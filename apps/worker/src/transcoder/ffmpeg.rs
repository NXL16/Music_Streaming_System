use tokio::process::Command;
use futures_util::StreamExt;
use bytes::Bytes;
use std::process::Stdio;
use tokio::io::{AsyncWriteExt, AsyncBufReadExt, BufReader};

pub async fn transcode_stream<S>(
    mut input_stream: S,
) -> anyhow::Result<(Vec<u8>, f64)> // 👉 Trả về cả Data và Duration
where
    S: futures_core::Stream<Item = Result<Bytes, reqwest::Error>> + Unpin + Send + 'static,
{
    let mut child = Command::new("ffmpeg")
        .args([
            "-i", "pipe:0",
            "-vn",
            "-c:a", "aac",
            "-b:a", "128k",
            // 👉 Flag quan trọng để tạo Fragmented MP4 có nhiều Seek Points
            "-movflags", "frag_keyframe+empty_moov+default_base_moof",
            "-frag_duration", "5000000", // 5 giây tạo 1 fragment (5.000.000 microseconds)
            "-f", "mp4",
            "pipe:1",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped()) // 👉 Bắt buộc phải có để parse duration
        .spawn()?;

    let mut stdin = child.stdin.take()
        .ok_or_else(|| anyhow::anyhow!("FFmpeg: Failed to open stdin pipe"))?;
    let stdout = child.stdout.take()
        .ok_or_else(|| anyhow::anyhow!("FFmpeg: Failed to open stdout pipe"))?;
    let stderr = child.stderr.take()
        .ok_or_else(|| anyhow::anyhow!("FFmpeg: Failed to open stderr pipe"))?;

    // 1. Luồng ghi input (chạy background)
    tokio::spawn(async move {
        while let Some(chunk) = input_stream.next().await {
            if let Ok(bytes) = chunk {
                if stdin.write_all(&bytes).await.is_err() {
                    break;
                }
            }
        }
        drop(stdin); // Báo hiệu kết thúc input
    });

    // 2. Luồng đọc output (stdout)
    let stdout_task = tokio::spawn(async move {
        let mut out = Vec::new();
        let mut reader = stdout;
        tokio::io::copy(&mut reader, &mut out).await.map(|_| out)
    });

    // 3. Luồng parse Duration (stderr)
    let mut duration = 0.0;
    let mut stderr_reader = BufReader::new(stderr).lines();
    
    // Đọc từng dòng log của ffmpeg
    while let Ok(Some(line)) = stderr_reader.next_line().await {
        if line.contains("time=") {
            if let Some(t) = parse_ffmpeg_time(&line) {
                duration = t;
            }
        }
    }

    let output_data = stdout_task.await??;
    let _ = child.wait().await?; // Đợi process kết thúc hoàn toàn

    Ok((output_data, duration))
}

/// Helper: Parse "time=00:03:55.33" -> f64 giây
fn parse_ffmpeg_time(line: &str) -> Option<f64> {
    // Cắt chuỗi lấy đoạn sau "time="
    let time_part = line.split("time=").last()?.split_whitespace().next()?;
    let parts: Vec<&str> = time_part.split(':').collect();
    
    if parts.len() == 3 {
        let h: f64 = parts[0].parse().ok()?;
        let m: f64 = parts[1].parse().ok()?;
        let s: f64 = parts[2].parse().ok()?;
        return Some(h * 3600.0 + m * 60.0 + s);
    }
    None
}