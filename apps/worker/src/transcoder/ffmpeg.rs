use bytes::Bytes;
use futures_util::StreamExt;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

pub async fn transcode_stream<S>(mut input_stream: S) -> anyhow::Result<(Vec<u8>, f64)>
where
    S: futures_core::Stream<Item = Result<Bytes, reqwest::Error>> + Unpin + Send + 'static,
{
    let mut child = Command::new("ffmpeg")
        .args([
            "-i",
            "pipe:0",
            "-map",
            "0:a:0",
            "-dn",
            "-sn",
            "-map_metadata",
            "-1",
            "-map_chapters",
            "-1",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "frag_keyframe+empty_moov+default_base_moof",
            "-frag_duration",
            "2000000",
            "-f",
            "mp4",
            "pipe:1",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| anyhow::anyhow!("FFmpeg: failed to open stdin pipe"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| anyhow::anyhow!("FFmpeg: failed to open stdout pipe"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| anyhow::anyhow!("FFmpeg: failed to open stderr pipe"))?;

    tokio::spawn(async move {
        while let Some(chunk) = input_stream.next().await {
            match chunk {
                Ok(bytes) => {
                    if stdin.write_all(&bytes).await.is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        drop(stdin);
    });

    let stdout_task = tokio::spawn(async move {
        let mut out = Vec::new();
        let mut reader = stdout;
        tokio::io::copy(&mut reader, &mut out).await.map(|_| out)
    });

    let mut duration = 0.0;
    let mut stderr_tail: Vec<String> = Vec::new();
    let mut stderr_reader = BufReader::new(stderr).lines();

    while let Ok(Some(line)) = stderr_reader.next_line().await {
        if line.contains("time=") {
            if let Some(t) = parse_ffmpeg_time(&line) {
                duration = t;
            }
        }

        stderr_tail.push(line);
        if stderr_tail.len() > 20 {
            stderr_tail.remove(0);
        }
    }

    let output_data = stdout_task.await??;
    let status = child.wait().await?;
    if !status.success() {
        let last_logs = stderr_tail.join("\n");
        return Err(anyhow::anyhow!(
            "FFmpeg exited with status {}. Last stderr lines:\n{}",
            status,
            last_logs
        ));
    }

    Ok((output_data, duration))
}

fn parse_ffmpeg_time(line: &str) -> Option<f64> {
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
