mod stream_index;
mod uploader;
mod waveform;

use crate::crypto::kdf::derive_song_key;
use crate::metadata::client as metadata_client;
use crate::pipeline::context::PipelineContext;
use aes::Aes256;
use anyhow::Context;
use ctr::cipher::{KeyIvInit, StreamCipher};
use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use std::env;
use std::process::Stdio;
use std::time::Instant;
use tokio::fs::File;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

use self::stream_index::{
    IncrementalMetaParser, FRAGMENT_DURATION_SECONDS, SEEKTABLE_VERSION, TIMESCALE_FALLBACK,
    build_segments, validate_seek_points, validate_segments,
};
use self::uploader::HybridUploader;
use self::waveform::{WAVEFORM_POINTS, build_waveform_temp_path, extract_waveform_from_audio_file};

type Aes256Ctr = ctr::Ctr128BE<Aes256>;

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

#[cfg(test)]
mod tests {
    use super::parse_ffmpeg_time;

    #[test]
    fn parse_ffmpeg_time_valid() {
        let v = parse_ffmpeg_time("frame=10 fps=20 time=00:01:02.50 bitrate=120.0kbits/s");
        assert_eq!(v, Some(62.5));
    }

    #[test]
    fn parse_ffmpeg_time_invalid() {
        assert_eq!(parse_ffmpeg_time("no time here"), None);
        assert_eq!(parse_ffmpeg_time("time=ab:cd:ef"), None);
    }
}

pub async fn transcode(ctx: &mut PipelineContext) -> anyhow::Result<()> {
    let pipeline_started_at = Instant::now();
    let input = ctx
        .input_stream
        .take()
        .ok_or_else(|| anyhow::anyhow!("Transcode step: no input stream found in context"))?;

    let client = ctx.r2_client.clone();
    let bucket = env::var("R2_BUCKET").context("R2_BUCKET env is not set")?;
    let output_key = format!("processed/{}.m4a", ctx.job.song_id);

    let mut uploader = HybridUploader::new(client, bucket, output_key.clone());

    let (key, iv) = derive_song_key(ctx.master_secret_key.as_slice(), &ctx.job.song_id)?;
    let mut cipher = Aes256Ctr::new_from_slices(&key, &iv)
        .map_err(|e| anyhow::anyhow!("invalid key/iv for aes-ctr: {e}"))?;

    let mut ffmpeg = Command::new("ffmpeg")
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
        .spawn()
        .context("failed to spawn ffmpeg")?;

    let mut ffmpeg_stdin = ffmpeg
        .stdin
        .take()
        .context("failed to capture ffmpeg stdin")?;
    let mut ffmpeg_stdout = ffmpeg
        .stdout
        .take()
        .context("failed to capture ffmpeg stdout")?;
    let ffmpeg_stderr = ffmpeg
        .stderr
        .take()
        .context("failed to capture ffmpeg stderr")?;

    let expected_checksum = if ctx.job.checksum.trim().is_empty() {
        None
    } else {
        Some(ctx.job.checksum.clone())
    };
    let waveform_source_path = build_waveform_temp_path(&ctx.job.song_id);
    let waveform_source_path_for_task = waveform_source_path.clone();
    let stdin_task = tokio::spawn(async move {
        let mut source = input;
        let mut hasher = Sha256::new();
        let mut source_file = File::create(&waveform_source_path_for_task)
            .await
            .context("failed to create temporary waveform source file")?;
        while let Some(chunk) = source.next().await {
            let bytes = chunk?;
            hasher.update(&bytes);
            source_file.write_all(&bytes).await?;
            ffmpeg_stdin.write_all(&bytes).await?;
        }
        source_file.flush().await?;
        drop(ffmpeg_stdin);
        let digest = hasher.finalize();
        let mut out = String::with_capacity(digest.len() * 2);
        for b in digest {
            use std::fmt::Write as _;
            let _ = write!(&mut out, "{:02x}", b);
        }
        Ok::<String, anyhow::Error>(out)
    });

    let stderr_task = tokio::spawn(async move {
        let mut duration = 0.0_f64;
        let mut lines = BufReader::new(ffmpeg_stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.contains("time=") {
                if let Some(t) = parse_ffmpeg_time(&line) {
                    duration = t;
                }
            }
        }
        duration
    });

    let mut parser = IncrementalMetaParser::new();
    let mut total_bytes = 0usize;
    let mut buf = vec![0_u8; 64 * 1024];

    let stream_started_at = Instant::now();
    let pipeline_result: anyhow::Result<()> = async {
        loop {
            let n = ffmpeg_stdout
                .read(&mut buf)
                .await
                .context("failed to read ffmpeg stdout")?;
            if n == 0 {
                break;
            }

            let chunk = &mut buf[..n];
            parser.push(chunk)?;
            cipher.apply_keystream(chunk);
            uploader.push_chunk(chunk).await?;
            total_bytes += n;
        }

        Ok(())
    }
    .await;
    let stream_elapsed = stream_started_at.elapsed();

    let result: anyhow::Result<()> = async {
        let input_checksum = stdin_task.await.context("ffmpeg stdin task join failed")??;
        let duration = stderr_task.await.context("ffmpeg stderr task join failed")?;
        let status = ffmpeg.wait().await.context("failed waiting ffmpeg process")?;

        if let Err(e) = pipeline_result {
            uploader.abort().await;
            return Err(e);
        }
        if let Some(expected) = expected_checksum {
            if input_checksum != expected {
                uploader.abort().await;
                return Err(anyhow::anyhow!(
                    "source checksum mismatch: expected={}, actual={}",
                    expected,
                    input_checksum
                ));
            }
        }
        if !status.success() {
            uploader.abort().await;
            return Err(anyhow::anyhow!("ffmpeg exited with status {}", status));
        }

        let finalize_started_at = Instant::now();
        uploader.finalize().await?;
        let finalize_elapsed = finalize_started_at.elapsed();

        let effective_timescale = parser.timescale.unwrap_or(TIMESCALE_FALLBACK);
        let inferred_min_duration = parser
            .seek_points
            .last()
            .map(|p| p.timestamp + FRAGMENT_DURATION_SECONDS)
            .unwrap_or(0.0);
        let final_duration = duration.max(inferred_min_duration);
        validate_seek_points(&parser.seek_points)?;
        let segments =
            build_segments(&parser.seek_points, total_bytes, final_duration, effective_timescale)?;
        validate_segments(&segments)?;
        let media_offset = parser
            .seek_points
            .first()
            .map(|p| p.byte_offset.max(0))
            .unwrap_or(0);
        let init_range_end = (media_offset - 1).max(0);
        let waveform =
            match extract_waveform_from_audio_file(&waveform_source_path, WAVEFORM_POINTS).await {
                Ok(data) => data,
                Err(err) => {
                    eprintln!(
                        "pipeline song_id={} warn=waveform_extraction_failed error={}",
                        ctx.job.song_id, err
                    );
                    Vec::new()
                }
            };

        let metadata_started_at = Instant::now();
        metadata_client::update_technical_meta(
            ctx.job.song_id.clone(),
            final_duration,
            segments,
            waveform,
            0,
            SEEKTABLE_VERSION,
            effective_timescale,
            media_offset,
            0,
            init_range_end,
        )
        .await?;
        let metadata_elapsed = metadata_started_at.elapsed();

        ctx.duration = Some(final_duration);
        ctx.encrypted_size_bytes = Some(total_bytes);
        ctx.output_key = Some(output_key);
        let total_elapsed = pipeline_started_at.elapsed();
        let upload_mbps = if total_elapsed.as_secs_f64() > 0.0 {
            (total_bytes as f64 * 8.0) / total_elapsed.as_secs_f64() / 1_000_000.0
        } else {
            0.0
        };
        eprintln!(
            "pipeline song_id={} metric=upload mode={} parts={} retries={} peak_inflight={} output_bytes={} duration_sec={:.3} throughput_mbps={:.3} stage_stream_ms={} stage_finalize_ms={} stage_metadata_ms={} stage_total_ms={}",
            ctx.job.song_id,
            if uploader.used_single_put { "single_put" } else { "multipart" },
            uploader.uploaded_parts,
            uploader.total_upload_retries,
            uploader.peak_inflight_parts,
            total_bytes,
            final_duration
            ,
            upload_mbps,
            stream_elapsed.as_millis(),
            finalize_elapsed.as_millis(),
            metadata_elapsed.as_millis(),
            total_elapsed.as_millis()
        );
        Ok(())
    }
    .await;

    let _ = tokio::fs::remove_file(&waveform_source_path).await;
    result
}
