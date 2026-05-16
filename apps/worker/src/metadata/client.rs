use crate::proto::metadata_service::{
    ByteRange, Segment, UpdateMetaRequest, metadata_service_client::MetadataServiceClient,
};

use anyhow::{Context, Result, anyhow};
use std::env;
use tokio::sync::RwLock;
use tokio::time::{Duration, timeout};
use tonic::{Code, transport::Channel};

static META_CLIENT: RwLock<Option<MetadataServiceClient<Channel>>> = RwLock::const_new(None);

const REQUEST_TIMEOUT: Duration = Duration::from_secs(3);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);

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
    let mut client = get_client().await?;

    let req = tonic::Request::new(UpdateMetaRequest {
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
    });

    let _response = timeout(REQUEST_TIMEOUT, client.update_technical_meta(req))
        .await
        .map_err(|_| {
            tokio::spawn(invalidate_client());
            anyhow!("Metadata Service timeout")
        })?
        .map_err(|e| {
            if e.code() == Code::Unavailable {
                tokio::spawn(invalidate_client());
            }
            e
        })?;

    Ok(())
}
