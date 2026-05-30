use anyhow::Context;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::process::Command;

pub const WAVEFORM_POINTS: usize = 100;

pub fn build_waveform_temp_path(song_id: &str) -> PathBuf {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    std::env::temp_dir().join(format!("waveform_source_{}_{}.bin", song_id, ts))
}

pub async fn extract_waveform_from_audio_file(
    path: &Path,
    points: usize,
) -> anyhow::Result<Vec<f32>> {
    if points == 0 {
        return Ok(Vec::new());
    }

    let output = Command::new("ffmpeg")
        .arg("-i")
        .arg(path)
        .arg("-vn")
        .arg("-ac")
        .arg("1")
        .arg("-ar")
        .arg("8000")
        .arg("-f")
        .arg("f32le")
        .arg("pipe:1")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .await
        .context("failed to run ffmpeg for waveform extraction")?;

    if !output.status.success() {
        return Err(anyhow::anyhow!(
            "ffmpeg waveform extraction exited with status {}",
            output.status
        ));
    }

    let bytes = output.stdout;
    if bytes.len() < 4 {
        return Ok(Vec::new());
    }

    let sample_count = bytes.len() / 4;
    if sample_count == 0 {
        return Ok(Vec::new());
    }

    let mut samples = Vec::with_capacity(sample_count);
    for chunk in bytes.chunks_exact(4) {
        samples.push(f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]).abs());
    }

    let mut waveform = Vec::with_capacity(points);
    for i in 0..points {
        let start = i * samples.len() / points;
        let end = ((i + 1) * samples.len() / points).max(start + 1).min(samples.len());
        let mut peak = 0.0_f32;
        for &v in &samples[start..end] {
            if v > peak {
                peak = v;
            }
        }
        waveform.push(peak.clamp(0.0, 1.0));
    }

    Ok(waveform)
}
