use anyhow::{Context, Result};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use reqwest::StatusCode;
use serde::Serialize;
use std::env;

#[derive(Serialize)]
struct SongKeyPayload {
    #[serde(rename = "encryptionKey")]
    encryption_key: String,
    iv: String,
    #[serde(rename = "encryptionStart")]
    encryption_start: usize,
}

pub async fn put_song_key(
    song_id: &str,
    encryption_key: &[u8],
    iv: &[u8],
    encryption_start: usize,
) -> Result<()> {
    let account_id =
        env::var("CF_ACCOUNT_ID").context("CF_ACCOUNT_ID environment variable not set")?;
    let namespace_id = env::var("CF_SONG_KEYS_NAMESPACE_ID")
        .context("CF_SONG_KEYS_NAMESPACE_ID environment variable not set")?;
    let api_token =
        env::var("CF_API_TOKEN").context("CF_API_TOKEN environment variable not set")?;

    let kv_key = format!("song:{song_id}");
    let encoded_key = urlencoding::encode(&kv_key);
    let url = format!(
        "https://api.cloudflare.com/client/v4/accounts/{account_id}/storage/kv/namespaces/{namespace_id}/values/{encoded_key}"
    );

    let payload = SongKeyPayload {
        encryption_key: STANDARD.encode(encryption_key),
        iv: STANDARD.encode(iv),
        encryption_start,
    };

    let body = serde_json::to_string(&payload).context("Failed to serialize SONG_KEYS payload")?;

    let response = reqwest::Client::new()
        .put(&url)
        .bearer_auth(api_token)
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await
        .context("Failed to call Cloudflare KV API")?;

    if response.status().is_success() {
        return Ok(());
    }

    let status = response.status();
    let err_body = response
        .text()
        .await
        .unwrap_or_else(|_| "<empty body>".to_string());

    let hint = if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
        " (check CF_API_TOKEN permissions for Workers KV write)"
    } else {
        ""
    };

    anyhow::bail!("Cloudflare KV write failed for {kv_key}: HTTP {status}{hint}; body={err_body}");
}
