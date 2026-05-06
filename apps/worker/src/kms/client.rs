use crate::proto::key_management::{
    key_management_service_client::KeyManagementServiceClient,
    GenerateKeyRequest
};

use anyhow::{anyhow, Context, Result};
use std::env;
use std::error::Error as StdError;
use std::fmt;
use tokio::sync::RwLock;
use tokio::time::{sleep, timeout, Duration};
use tonic::{transport::Channel, Code};

static KMS_CLIENT: RwLock<Option<KeyManagementServiceClient<Channel>>> = RwLock::const_new(None);

const MAX_RETRIES: u32 = 3;
const INITIAL_BACKOFF_MS: u64 = 200;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(2);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug)]
struct KmsTimeoutError;

impl fmt::Display for KmsTimeoutError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "KMS timeout")
    }
}

impl StdError for KmsTimeoutError {}

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

pub async fn generate_song_key(song_id: &str) -> Result<(Vec<u8>, Vec<u8>)> {
    let mut last_error = anyhow!("KMS request failed");

    for attempt in 0..MAX_RETRIES {
        match try_generate_key(song_id).await {
            Ok(res) => return Ok(res),
            Err(e) => {
                let retryable = is_retryable_error(&e);
                last_error = e;

                if !retryable || attempt >= MAX_RETRIES - 1 {
                    break;
                }

                let backoff = Duration::from_millis(INITIAL_BACKOFF_MS * (1 << attempt));
                sleep(backoff).await;
            }
        }
    }

    Err(last_error)
}

fn is_retryable_error(err: &anyhow::Error) -> bool {
    if err.downcast_ref::<KmsTimeoutError>().is_some() {
        return true;
    }

    if let Some(status) = err.downcast_ref::<tonic::Status>() {
        return matches!(status.code(), Code::Unavailable | Code::DeadlineExceeded);
    }

    if err.downcast_ref::<tonic::transport::Error>().is_some() {
        return true;
    }

    false
}

async fn try_generate_key(song_id: &str) -> Result<(Vec<u8>, Vec<u8>)> {
    let mut client = get_client().await?;

    let req = tonic::Request::new(GenerateKeyRequest {
        song_id: song_id.to_string(),
        user_id: "system".to_string(),
    });

    let response = timeout(REQUEST_TIMEOUT, client.generate_song_key(req))
        .await
        .map_err(|_| {
            tokio::spawn(invalidate_client());
            anyhow!(KmsTimeoutError)
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