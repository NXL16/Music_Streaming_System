use crate::proto::metadata_service::{
    ByteRange, GetStreamDataRequest, Segment, UpdateMetaRequest,
    metadata_service_client::MetadataServiceClient,
};

use anyhow::{Context, Result, anyhow};
use std::env;
use tokio::sync::RwLock;
use tokio::time::{Duration, sleep, timeout};
use tonic::{Code, transport::Channel};

static META_CLIENT: RwLock<Option<MetadataServiceClient<Channel>>> = RwLock::const_new(None);

const REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const META_UPDATE_MAX_RETRIES: u32 = 3;
const META_VERIFY_MAX_RETRIES: u32 = 3;
const META_RETRY_BACKOFF_MS: u64 = 200;

async fn get_client() -> Result<MetadataServiceClient<Channel>> {
    if let Some(client) = &*META_CLIENT.read().await {
        return Ok(client.clone());
    }

    let mut writer = META_CLIENT.write().await;
    if let Some(client) = &*writer {
        return Ok(client.clone());
    }

    let url = env::var("META_GRPC_URL").context("META_GRPC_URL environment variable not set")?;

    let endpoint = tonic::transport::Endpoint::from_shared(url)?
        .connect_timeout(CONNECT_TIMEOUT)
        .tcp_keepalive(Some(Duration::from_secs(60)));

    let client = MetadataServiceClient::connect(endpoint).await?;
    *writer = Some(client.clone());

    Ok(client)
}

async fn invalidate_client() {
    let mut writer = META_CLIENT.write().await;
    *writer = None;
}

pub async fn update_technical_meta(
    song_id: String,
    duration: f64,
    segments: Vec<Segment>,
    waveform: Vec<f32>,
    encryption_start_offset: i64,
    seektable_version: i32,
    timescale: i32,
    media_offset: i64,
    init_range_start: i64,
    init_range_end: i64,
) -> Result<()> {
    let req_payload = UpdateMetaRequest {
        song_id,
        duration,
        encryption_start_offset,
        seektable_version,
        timescale,
        media_offset,
        init_range: Some(ByteRange {
            start: init_range_start,
            end: init_range_end,
        }),
        segments,
        waveform,
    };

    let mut last_err: Option<anyhow::Error> = None;
    for attempt in 0..=META_UPDATE_MAX_RETRIES {
        let mut client = get_client().await?;
        let req = tonic::Request::new(req_payload.clone());
        match timeout(REQUEST_TIMEOUT, client.update_technical_meta(req)).await {
            Ok(Ok(_)) => {
                verify_stream_data_written(req_payload.song_id.clone(), req_payload.timescale).await?;
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

async fn verify_stream_data_written(song_id: String, expected_timescale: i32) -> Result<()> {
    let mut last_err: Option<anyhow::Error> = None;
    for attempt in 0..=META_VERIFY_MAX_RETRIES {
        let mut client = get_client().await?;
        let req = tonic::Request::new(GetStreamDataRequest {
            song_id: song_id.clone(),
        });

        match timeout(REQUEST_TIMEOUT, client.get_stream_data(req)).await {
            Ok(Ok(resp)) => {
                let data = resp.into_inner();
                if data.song_id != song_id {
                    return Err(anyhow!("Metadata Service verify mismatch song_id"));
                }
                if data.timescale <= 0 || data.timescale != expected_timescale {
                    return Err(anyhow!("Metadata Service verify invalid timescale"));
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
