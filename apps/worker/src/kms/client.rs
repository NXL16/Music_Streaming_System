use crate::proto::key_management::{
    key_management_service_client::KeyManagementServiceClient,
    GetKeyRequest
};

use anyhow::{anyhow, Context, Result};
use std::env;
use tokio::sync::RwLock;
use tokio::time::{sleep, timeout, Duration};
use tonic::{transport::Channel, Code};

static KMS_CLIENT: RwLock<Option<KeyManagementServiceClient<Channel>>> = RwLock::const_new(None);

const MAX_RETRIES: u32 = 3;
const INITIAL_BACKOFF_MS: u64 = 200;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(2);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);

async fn get_client() -> Result<KeyManagementServiceClient<Channel>> {
    if let Some(client) = &*KMS_CLIENT.read().await {
        return Ok(client.clone());
    }

    let mut writer = KMS_CLIENT.write().await;
    if let Some(client) = &*writer {
        return Ok(client.clone());
    }

    let url = env::var("KMS_GRPC_URL").context("KMS_GRPC_URL environment variable not set")?;

    let endpoint = tonic::transport::Endpoint::from_shared(url)?
        .connect_timeout(CONNECT_TIMEOUT)
        .tcp_keepalive(Some(Duration::from_secs(60)));

    let client = KeyManagementServiceClient::connect(endpoint).await?;
    *writer = Some(client.clone());

    Ok(client)
}

async fn invalidate_client() {
    let mut writer = KMS_CLIENT.write().await;
    *writer = None;
}

pub async fn get_song_key(song_id: &str) -> Result<(Vec<u8>, Vec<u8>)> {
    let mut last_error = anyhow!("KMS request failed");

    for attempt in 0..MAX_RETRIES {
        match try_fetch_key(song_id).await {
            Ok(res) => return Ok(res),
            Err(e) => {
                last_error = e;
                
                if attempt < MAX_RETRIES - 1 {
                    let backoff = Duration::from_millis(INITIAL_BACKOFF_MS * (1 << attempt));
                    sleep(backoff).await;
                }
            }
        }
    }

    Err(last_error)
}

async fn try_fetch_key(song_id: &str) -> Result<(Vec<u8>, Vec<u8>)> {
    let mut client = get_client().await?;

    let req = tonic::Request::new(GetKeyRequest {
        song_id: song_id.to_string(),
    });

    let response = timeout(REQUEST_TIMEOUT, client.get_song_key(req))
        .await
        .map_err(|_| {
            tokio::spawn(invalidate_client());
            anyhow!("KMS timeout")
        })?
        .map_err(|e| {
            if e.code() == Code::Unavailable {
                tokio::spawn(invalidate_client());
            }
            e
        })?;

    let inner = response.into_inner();
    Ok((inner.encryption_key, inner.iv))
}