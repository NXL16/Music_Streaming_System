use crate::proto::metadata_service::{
    ByteRange, GetStreamDataRequest, Segment, UpdateMetaRequest,
    metadata_service_client::MetadataServiceClient,
};

use anyhow::{Context, Result, anyhow};
use std::{env, fs};
use tokio::sync::RwLock;
use tokio::time::{Duration, sleep, timeout};
use tonic::{
    Code, Request,
    metadata::MetadataValue,
    transport::{Certificate, Channel, ClientTlsConfig, Endpoint, Identity},
};

static META_CLIENT: RwLock<Option<MetadataServiceClient<Channel>>> = RwLock::const_new(None);

const REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const META_UPDATE_MAX_RETRIES: u32 = 3;
const META_VERIFY_MAX_RETRIES: u32 = 3;
const META_RETRY_BACKOFF_MS: u64 = 200;
// Keep this aligned with Meta and API. Valid seek-table metadata can exceed
// tonic's default 4 MiB message limit for a long track.
const MAX_METADATA_GRPC_MESSAGE_BYTES: usize = 8 * 1024 * 1024;

pub struct TechnicalMeta {
    pub song_id: String,
    pub variant: String,
    pub metadata_version: i64,
    pub duration: f64,
    pub segments: Vec<Segment>,
    pub waveform: Vec<f32>,
    pub encryption_start_offset: i64,
    pub seektable_version: i32,
    pub timescale: i32,
    pub media_offset: i64,
    pub init_range: ByteRange,
}

async fn get_client() -> Result<MetadataServiceClient<Channel>> {
    if let Some(client) = &*META_CLIENT.read().await {
        return Ok(client.clone());
    }

    let mut writer = META_CLIENT.write().await;
    if let Some(client) = &*writer {
        return Ok(client.clone());
    }

    let url = env::var("META_GRPC_URL").context("META_GRPC_URL environment variable not set")?;

    let endpoint = Endpoint::from_shared(url.clone())?
        .connect_timeout(CONNECT_TIMEOUT)
        .tcp_keepalive(Some(Duration::from_secs(60)));
    let endpoint = configure_tls(endpoint, &url)?;

    let client = MetadataServiceClient::connect(endpoint)
        .await?
        .max_encoding_message_size(MAX_METADATA_GRPC_MESSAGE_BYTES)
        .max_decoding_message_size(MAX_METADATA_GRPC_MESSAGE_BYTES);
    *writer = Some(client.clone());

    Ok(client)
}

fn configure_tls(endpoint: Endpoint, url: &str) -> Result<Endpoint> {
    if !meta_tls_enabled()? {
        return Ok(endpoint);
    }
    if !url.trim().to_lowercase().starts_with("https://") {
        return Err(anyhow!(
            "META_GRPC_URL must use https:// when META_GRPC_TLS_ENABLED=true"
        ));
    }

    let certificate_file = optional_env("META_GRPC_TLS_CLIENT_CERT_FILE");
    let key_file = optional_env("META_GRPC_TLS_CLIENT_KEY_FILE");
    if certificate_file.is_some() != key_file.is_some() {
        return Err(anyhow!(
            "META_GRPC_TLS_CLIENT_CERT_FILE and META_GRPC_TLS_CLIENT_KEY_FILE must be set together"
        ));
    }

    let mut tls = ClientTlsConfig::new().ca_certificate(Certificate::from_pem(read_pem_file(
        "META_GRPC_TLS_CA_FILE",
    )?));
    if let (Some(certificate_file), Some(key_file)) = (certificate_file, key_file) {
        tls = tls.identity(Identity::from_pem(
            read_pem_path(&certificate_file, "META_GRPC_TLS_CLIENT_CERT_FILE")?,
            read_pem_path(&key_file, "META_GRPC_TLS_CLIENT_KEY_FILE")?,
        ));
    }

    endpoint
        .tls_config(tls)
        .context("configure Meta gRPC TLS client")
}

fn meta_tls_enabled() -> Result<bool> {
    let enabled = optional_env("META_GRPC_TLS_ENABLED").map(|value| value.to_lowercase());
    match enabled.as_deref() {
        None | Some("false") => Ok(false),
        Some("true") => Ok(true),
        Some(_) => Err(anyhow!("META_GRPC_TLS_ENABLED must be true or false")),
    }
}

fn optional_env(key: &str) -> Option<String> {
    env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn read_pem_file(key: &str) -> Result<Vec<u8>> {
    let path = env::var(key).with_context(|| format!("{key} environment variable not set"))?;
    read_pem_path(path.trim(), key)
}

fn read_pem_path(path: &str, key: &str) -> Result<Vec<u8>> {
    fs::read(path).with_context(|| format!("read {key} at {path}"))
}

async fn invalidate_client() {
    let mut writer = META_CLIENT.write().await;
    *writer = None;
}

fn authenticated_request<T>(payload: T) -> Result<Request<T>> {
    let token = env::var("INTERNAL_GRPC_TOKEN")
        .context("INTERNAL_GRPC_TOKEN environment variable not set")?;
    let token = MetadataValue::try_from(token.trim())
        .context("INTERNAL_GRPC_TOKEN contains invalid gRPC metadata characters")?;

    let mut request = Request::new(payload);
    request.metadata_mut().insert("x-internal-token", token);
    Ok(request)
}

pub async fn update_technical_meta(meta: TechnicalMeta) -> Result<()> {
    let req_payload = UpdateMetaRequest {
        song_id: meta.song_id,
        variant: meta.variant,
        metadata_version: meta.metadata_version,
        duration: meta.duration,
        encryption_start_offset: meta.encryption_start_offset,
        seektable_version: meta.seektable_version,
        timescale: meta.timescale,
        media_offset: meta.media_offset,
        init_range: Some(meta.init_range),
        segments: meta.segments,
        waveform: meta.waveform,
    };

    let mut last_err: Option<anyhow::Error> = None;
    for attempt in 0..=META_UPDATE_MAX_RETRIES {
        let mut client = get_client().await?;
        let req = authenticated_request(req_payload.clone())?;
        match timeout(REQUEST_TIMEOUT, client.update_technical_meta(req)).await {
            Ok(Ok(_)) => {
                verify_stream_data_written(
                    req_payload.song_id.clone(),
                    req_payload.variant.clone(),
                    req_payload.timescale,
                    req_payload.metadata_version,
                )
                .await?;
                return Ok(());
            }
            Ok(Err(e)) => {
                if e.code() == Code::Unavailable {
                    tokio::spawn(invalidate_client());
                }
                last_err = Some(anyhow!("Metadata Service update error: {e}"));
            }
            Err(_) => {
                tokio::spawn(invalidate_client());
                last_err = Some(anyhow!("Metadata Service update timeout"));
            }
        }

        if attempt < META_UPDATE_MAX_RETRIES {
            let backoff = META_RETRY_BACKOFF_MS.saturating_mul(1u64 << attempt.min(10));
            sleep(Duration::from_millis(backoff)).await;
        }
    }

    Err(last_err.unwrap_or_else(|| anyhow!("Metadata Service update failed")))
}

async fn verify_stream_data_written(
    song_id: String,
    variant: String,
    expected_timescale: i32,
    expected_metadata_version: i64,
) -> Result<()> {
    let mut last_err: Option<anyhow::Error> = None;
    for attempt in 0..=META_VERIFY_MAX_RETRIES {
        let mut client = get_client().await?;
        let req = authenticated_request(GetStreamDataRequest {
            song_id: song_id.clone(),
            variant: variant.clone(),
        })?;

        match timeout(REQUEST_TIMEOUT, client.get_stream_data(req)).await {
            Ok(Ok(resp)) => {
                let data = resp.into_inner();
                if data.song_id != song_id {
                    return Err(anyhow!("Metadata Service verify mismatch song_id"));
                }
                if data.variant != variant {
                    return Err(anyhow!("Metadata Service verify mismatch variant"));
                }
                if data.timescale <= 0 || data.timescale != expected_timescale {
                    return Err(anyhow!("Metadata Service verify invalid timescale"));
                }
                if data.metadata_version != expected_metadata_version {
                    return Err(anyhow!("Metadata Service verify stale metadata version"));
                }
                if data.segments.is_empty() {
                    return Err(anyhow!("Metadata Service verify missing segments"));
                }
                return Ok(());
            }
            Ok(Err(e)) => {
                if e.code() == Code::Unavailable {
                    tokio::spawn(invalidate_client());
                }
                last_err = Some(anyhow!("Metadata Service verify error: {e}"));
            }
            Err(_) => {
                tokio::spawn(invalidate_client());
                last_err = Some(anyhow!("Metadata Service verify timeout"));
            }
        }

        if attempt < META_VERIFY_MAX_RETRIES {
            let backoff = META_RETRY_BACKOFF_MS.saturating_mul(1u64 << attempt.min(10));
            sleep(Duration::from_millis(backoff)).await;
        }
    }

    Err(last_err.unwrap_or_else(|| anyhow!("Metadata Service verify failed")))
}
