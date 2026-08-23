use anyhow::{Context, Result};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SeparationRequest<'a> {
    song_id: &'a str,
    source_key: &'a str,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeparationResponse {
    pub vocal_key: String,
    pub instrumental_key: String,
    pub model_version: String,
}

pub async fn separate(song_id: &str, source_key: &str) -> Result<SeparationResponse> {
    let endpoint = std::env::var("STEM_SEPARATION_URL")
        .context("STEM_SEPARATION_URL is required for stem separation")?;
    let secret = std::env::var("STEM_SEPARATION_SHARED_SECRET")
        .context("STEM_SEPARATION_SHARED_SECRET is required for stem separation")?;
    let timeout_secs = std::env::var("STEM_SEPARATION_TIMEOUT_SEC")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(900);

    let response = reqwest::Client::new()
        .post(endpoint)
        .bearer_auth(secret)
        .timeout(Duration::from_secs(timeout_secs))
        .json(&SeparationRequest {
            song_id,
            source_key,
        })
        .send()
        .await
        .context("Modal stem-separation request failed")?;

    if response.status() != StatusCode::OK {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(anyhow::anyhow!(
            "Modal stem-separation returned {status}: {body}"
        ));
    }

    let output: SeparationResponse = response
        .json()
        .await
        .context("Modal stem-separation response was invalid")?;
    validate_staging_key(song_id, &output.vocal_key, "vocal")?;
    validate_staging_key(song_id, &output.instrumental_key, "instrumental")?;
    Ok(output)
}

fn validate_staging_key(song_id: &str, key: &str, variant: &str) -> Result<()> {
    let expected = format!("staging/{song_id}/{variant}.m4a");
    if key != expected {
        return Err(anyhow::anyhow!(
            "Modal stem-separation returned unexpected {variant} key"
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_staging_key;

    #[test]
    fn accepts_expected_staging_key() {
        assert!(validate_staging_key("song-1", "staging/song-1/vocal.m4a", "vocal").is_ok());
    }

    #[test]
    fn rejects_unexpected_staging_key() {
        assert!(validate_staging_key("song-1", "processed/song-1/vocal.m4a", "vocal").is_err());
    }
}
