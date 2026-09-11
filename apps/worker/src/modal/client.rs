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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioAnalysisResponse {
    pub analysis_version: String,
    pub bpm: f64,
    pub energy: f64,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub embedding: Vec<f64>,
}

pub fn audio_intelligence_enabled() -> bool {
    matches!(
        std::env::var("AUDIO_INTELLIGENCE_ENABLED").as_deref(),
        Ok("true") | Ok("1") | Ok("TRUE") | Ok("True")
    )
}

pub async fn analyze(song_id: &str, source_key: &str) -> Result<AudioAnalysisResponse> {
    let endpoint = std::env::var("AUDIO_INTELLIGENCE_URL")
        .context("AUDIO_INTELLIGENCE_URL is required for CLAP analysis")?;
    let secret = std::env::var("AUDIO_INTELLIGENCE_SHARED_SECRET")
        .context("AUDIO_INTELLIGENCE_SHARED_SECRET is required for CLAP analysis")?;
    let response = reqwest::Client::new()
        .post(endpoint)
        .bearer_auth(secret)
        .timeout(Duration::from_secs(900))
        .json(&SeparationRequest {
            song_id,
            source_key,
        })
        .send()
        .await
        .context("Modal audio-intelligence request failed")?;
    if response.status() != StatusCode::OK {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        anyhow::bail!("Modal audio-intelligence returned {status}: {body}");
    }
    let body = response
        .text()
        .await
        .context("Modal audio-intelligence response body could not be read")?;
    let output = parse_audio_analysis_response(&body)?;
    Ok(output)
}

fn parse_audio_analysis_response(body: &str) -> Result<AudioAnalysisResponse> {
    let output: AudioAnalysisResponse = serde_json::from_str(body).with_context(|| {
        format!(
            "Modal audio-intelligence response was invalid JSON ({} bytes)",
            body.len()
        )
    })?;
    if output.analysis_version.trim().is_empty()
        || !output.bpm.is_finite()
        || output.bpm < 0.0
        || !output.energy.is_finite()
        || !(0.0..=1.0).contains(&output.energy)
        || output.embedding.len() != 512
        || output.embedding.iter().any(|value| !value.is_finite())
    {
        anyhow::bail!("Modal audio-intelligence returned invalid analysis");
    }
    Ok(output)
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
    use super::{parse_audio_analysis_response, validate_staging_key};

    #[test]
    fn accepts_expected_staging_key() {
        assert!(validate_staging_key("song-1", "staging/song-1/vocal.m4a", "vocal").is_ok());
    }

    #[test]
    fn rejects_unexpected_staging_key() {
        assert!(validate_staging_key("song-1", "processed/song-1/vocal.m4a", "vocal").is_err());
    }

    #[test]
    fn accepts_a_single_512_dimension_embedding() {
        let embedding = vec![0.0_f64; 512];
        let body = serde_json::json!({
            "analysisVersion": "clap-test",
            "bpm": 120.0,
            "energy": 0.5,
            "embedding": embedding,
        })
        .to_string();

        assert!(parse_audio_analysis_response(&body).is_ok());
    }

    #[test]
    fn rejects_a_nested_or_wrong_size_embedding() {
        let body = serde_json::json!({
            "analysisVersion": "clap-test",
            "bpm": 120.0,
            "energy": 0.5,
            "embedding": vec![vec![0.0_f64; 512]],
        })
        .to_string();

        assert!(parse_audio_analysis_response(&body).is_err());
    }
}
