use crate::proto::metadata_service::{
    metadata_service_client::MetadataServiceClient,
    UpdateMetaRequest, SeekPoint
};

use anyhow::{anyhow, Context, Result};
use std::env;
use tokio::sync::RwLock;
use tokio::time::{timeout, Duration};
use tonic::{transport::Channel, Code};

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

    // Lấy META_URL trực tiếp từ env giống KMS
    let url = env::var("META_URL").context("META_URL environment variable not set")?;

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
    seek_points: Vec<SeekPoint>,
    waveform: Vec<f32>,
) -> Result<()> {
    let mut client = get_client().await?;

    let req = tonic::Request::new(UpdateMetaRequest {
        song_id,
        duration,
        seek_points,
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