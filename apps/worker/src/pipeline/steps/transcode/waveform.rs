use anyhow::Context;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::io::AsyncReadExt;
use tokio::process::Command;

pub const WAVEFORM_POINTS: usize = 100;

pub fn build_waveform_temp_path(song_id: &str) -> PathBuf {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    std::env::temp_dir().join(format!("waveform_source_{}_{}.bin", song_id, ts))
}

const SAMPLES_PER_INTERMEDIATE_BUCKET: u64 = 800;

pub async fn extract_waveform_from_audio_file(
    path: &Path,
    points: usize,
) -> anyhow::Result<Vec<f32>> {
    if points == 0 {
        return Ok(Vec::new());
    }

    let mut child = Command::new("ffmpeg")
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
        .spawn()
        .context("failed to spawn ffmpeg for waveform extraction")?;

    let mut stdout = child
        .stdout
        .take()
        .context("failed to capture ffmpeg stdout")?;

    let mut intermediate_peaks: Vec<f32> = Vec::new();
    let mut current_peak = 0.0_f32;
    let mut count_in_bucket: u64 = 0;
    let mut buf = [0u8; 8192];
    let mut leftover = Vec::<u8>::new();

    loop {
        let n = stdout.read(&mut buf).await?;
        if n == 0 {
            break;
        }

        leftover.extend_from_slice(&buf[..n]);
        let usable = (leftover.len() / 4) * 4;

        for chunk in leftover[..usable].chunks_exact(4) {
            let sample = f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]).abs();
            if sample > current_peak {
                current_peak = sample;
            }
            count_in_bucket += 1;
            if count_in_bucket >= SAMPLES_PER_INTERMEDIATE_BUCKET {
                intermediate_peaks.push(current_peak);
                current_peak = 0.0;
                count_in_bucket = 0;
            }
        }

        leftover.drain(..usable);
    }

    if count_in_bucket > 0 {
        intermediate_peaks.push(current_peak);
    }

    let status = child.wait().await.context("failed waiting for ffmpeg")?;
    if !status.success() {
        return Err(anyhow::anyhow!(
            "ffmpeg waveform extraction exited with status {}",
            status
        ));
    }

    if intermediate_peaks.is_empty() {
        return Ok(Vec::new());
    }

    let len = intermediate_peaks.len();
    let mut waveform = Vec::with_capacity(points);
    for i in 0..points {
        let start = i * len / points;
        let end = ((i + 1) * len / points).max(start + 1).min(len);
        let mut peak = 0.0_f32;
        for &v in &intermediate_peaks[start..end] {
            if v > peak {
                peak = v;
            }
        }
        waveform.push(peak.clamp(0.0, 1.0));
    }

    Ok(waveform)
}
