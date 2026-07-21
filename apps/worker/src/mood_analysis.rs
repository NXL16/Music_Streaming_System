use anyhow::{Context, Result};
use serde::Deserialize;
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;
use std::process::Stdio;
use tokio::process::Command;
use tokio::time::{timeout, Duration};

const ALLOWED_TAGS: [&str; 7] = [
    "focus", "feeling-blue", "energy", "heartbreak", "relax", "feel-good", "love",
];

#[derive(Debug)]
pub struct MoodAnalysisResult {
    pub version: String,
    pub mood_tags: Vec<String>,
    pub scores: BTreeMap<String, f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnalyzerOutput {
    version: String,
    #[serde(default)]
    mood_tags: Vec<String>,
    #[serde(default)]
    scores: BTreeMap<String, f64>,
}

fn enabled() -> bool {
    matches!(std::env::var("MOOD_ANALYSIS_ENABLED").as_deref(), Ok("true") | Ok("1") | Ok("TRUE") | Ok("True"))
}

pub async fn analyze_file(path: &Path) -> Result<Option<MoodAnalysisResult>> {
    if !enabled() {
        return Ok(None);
    }
    let executable = std::env::var("MOOD_ANALYSIS_EXECUTABLE")
        .context("MOOD_ANALYSIS_EXECUTABLE is required when mood analysis is enabled")?;
    if executable.trim().is_empty() {
        anyhow::bail!("MOOD_ANALYSIS_EXECUTABLE is empty");
    }
    let seconds = std::env::var("MOOD_ANALYSIS_TIMEOUT_SEC")
        .ok().and_then(|value| value.parse::<u64>().ok()).filter(|value| *value > 0).unwrap_or(90);
    let configured_args = std::env::var("MOOD_ANALYSIS_ARGUMENTS")
        .unwrap_or_default()
        .split_whitespace()
        .map(str::to_owned)
        .collect::<Vec<_>>();
    let mut command = Command::new(executable);
    command.args(configured_args).arg(path).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let output = timeout(
        Duration::from_secs(seconds),
        command.output(),
    ).await.map_err(|_| anyhow::anyhow!("mood analyser timed out after {}s", seconds))?
      .context("failed to start mood analyser")?;
    if !output.status.success() {
        anyhow::bail!("mood analyser exited {}: {}", output.status, String::from_utf8_lossy(&output.stderr).trim());
    }
    let raw: AnalyzerOutput = serde_json::from_slice(&output.stdout)
        .context("mood analyser stdout must be one JSON object")?;
    let allowed: BTreeSet<&str> = ALLOWED_TAGS.into_iter().collect();
    let mood_tags = raw.mood_tags.into_iter().map(|tag| tag.trim().to_ascii_lowercase())
        .filter(|tag| allowed.contains(tag.as_str())).collect::<BTreeSet<_>>().into_iter().collect::<Vec<_>>();
    let scores = raw.scores.into_iter()
        .filter(|(tag, score)| allowed.contains(tag.as_str()) && score.is_finite())
        .map(|(tag, score)| (tag, score.clamp(0.0, 1.0))).collect();
    if raw.version.trim().is_empty() || mood_tags.is_empty() {
        return Ok(None);
    }
    Ok(Some(MoodAnalysisResult { version: raw.version, mood_tags, scores }))
}
