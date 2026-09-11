mod stream_index;
mod uploader;
pub(crate) mod waveform;

use crate::crypto::kdf::derive_song_key;
use crate::metadata::client as metadata_client;
use crate::pipeline::context::PipelineContext;
use crate::proto::metadata_service::ByteRange;
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
    FRAGMENT_DURATION_SECONDS, IncrementalMetaParser, SEEKTABLE_VERSION, TIMESCALE_FALLBACK,
    build_segments, validate_seek_points, validate_segments,
};
use self::uploader::HybridUploader;
use self::waveform::{WAVEFORM_POINTS, build_waveform_temp_path, extract_waveform_from_audio_file};

type Aes256Ctr = ctr::Ctr128BE<Aes256>;

#[derive(Debug, Clone)]
pub struct StemOutput {
    pub output_key: String,
    pub duration: f64,
    pub encrypted_size_bytes: usize,
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

async fn probe_audio_duration(path: &std::path::Path) -> anyhow::Result<f64> {
    let output = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            &path.to_string_lossy(),
        ])
        .output()
        .await
        .context("failed to run ffprobe for stem duration")?;
    if !output.status.success() {
        return Err(anyhow::anyhow!(
            "ffprobe stem duration failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    let duration = String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse::<f64>()
        .context("ffprobe returned an invalid stem duration")?;
    if !duration.is_finite() || duration <= 0.0 {
        return Err(anyhow::anyhow!(
            "ffprobe returned a non-positive stem duration"
        ));
    }
    Ok(duration)
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
            if line.contains("time=")
                && let Some(t) = parse_ffmpeg_time(&line)
            {
                duration = t;
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
        if let Some(expected) = expected_checksum
            && input_checksum != expected
        {
            uploader.abort().await;
            return Err(anyhow::anyhow!(
                "source checksum mismatch: expected={}, actual={}",
                expected,
                input_checksum
            ));
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
        metadata_client::update_technical_meta(metadata_client::TechnicalMeta {
            song_id: ctx.job.song_id.clone(),
            variant: String::new(),
            metadata_version: ctx.job.metadata_version,
            duration: final_duration,
            segments,
            waveform,
            encryption_start_offset: 0,
            seektable_version: SEEKTABLE_VERSION,
            timescale: effective_timescale,
            media_offset,
            init_range: ByteRange {
                start: 0,
                end: init_range_end,
            },
        })
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

/// Packages one AAC/M4A stem from Modal into the encrypted fMP4 format used by
/// the player. This remuxes AAC packets without a second lossy encode; each
/// stem still has independent byte ranges and AES-CTR material.
pub async fn transcode_stem_file(
    song_id: &str,
    variant: &str,
    metadata_version: i64,
    source_path: &std::path::Path,
    master_secret_key: &[u8],
    r2_client: aws_sdk_s3::Client,
    waveform: Vec<f32>,
) -> anyhow::Result<StemOutput> {
    if variant != "instrumental" && variant != "vocal" {
        return Err(anyhow::anyhow!("invalid stem variant: {variant}"));
    }

    let bucket = env::var("R2_BUCKET").context("R2_BUCKET env is not set")?;
    let temp_output = std::env::temp_dir().join(format!(
        "stem_{song_id}_{variant}_{:016x}.m4a",
        rand::random::<u64>()
    ));
    let output_key = format!("processed/{song_id}/{variant}.m4a");
    // Modal's regular M4A has authoritative duration metadata. The fMP4
    // remux uses an empty moov box, so probing it can report N/A on some
    // ffprobe versions.
    let exact_duration = probe_audio_duration(source_path).await?;

    let remux_result = Command::new("ffmpeg")
        .args([
            "-y",
            "-i",
            &source_path.to_string_lossy(),
            "-map",
            "0:a:0",
            "-dn",
            "-sn",
            "-map_metadata",
            "-1",
            "-map_chapters",
            "-1",
            "-c:a",
            "copy",
            "-movflags",
            "frag_keyframe+empty_moov+default_base_moof",
            "-frag_duration",
            "2000000",
            "-f",
            "mp4",
            &temp_output.to_string_lossy(),
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .await
        .context("failed to remux stem with ffmpeg")?;
    let result = async {
        if !remux_result.status.success() {
            let stderr = String::from_utf8_lossy(&remux_result.stderr);
            return Err(anyhow::anyhow!("ffmpeg stem remux failed: {stderr}"));
        }

        let asset_id = format!("{song_id}:{variant}");
        let (key, iv) = derive_song_key(master_secret_key, &asset_id)?;
        let mut cipher = Aes256Ctr::new_from_slices(&key, &iv)
            .map_err(|e| anyhow::anyhow!("invalid key/iv for stem: {e}"))?;
        let mut uploader = HybridUploader::new(r2_client, bucket, output_key.clone());
        let mut parser = IncrementalMetaParser::new();
        let mut file = File::open(&temp_output).await?;
        let mut buf = vec![0_u8; 64 * 1024];
        let mut total_bytes = 0usize;

        let upload_result = async {
            loop {
                let read = file.read(&mut buf).await?;
                if read == 0 {
                    break;
                }
                let chunk = &mut buf[..read];
                parser.push(chunk)?;
                cipher.apply_keystream(chunk);
                uploader.push_chunk(chunk).await?;
                total_bytes += read;
            }
            uploader.finalize().await
        }
        .await;

        if upload_result.is_err() {
            uploader.abort().await;
        }
        upload_result?;

        let timescale = parser.timescale.unwrap_or(TIMESCALE_FALLBACK);
        validate_seek_points(&parser.seek_points)?;
        let segments = build_segments(&parser.seek_points, total_bytes, exact_duration, timescale)?;
        validate_segments(&segments)?;
        let media_offset = parser
            .seek_points
            .first()
            .map(|point| point.byte_offset.max(0))
            .unwrap_or(0);
        metadata_client::update_technical_meta(metadata_client::TechnicalMeta {
            song_id: song_id.to_owned(),
            variant: variant.to_owned(),
            metadata_version,
            duration: exact_duration,
            segments,
            waveform,
            encryption_start_offset: 0,
            seektable_version: SEEKTABLE_VERSION,
            timescale,
            media_offset,
            init_range: ByteRange {
                start: 0,
                end: (media_offset - 1).max(0),
            },
        })
        .await?;

        Ok(StemOutput {
            output_key,
            duration: exact_duration,
            encrypted_size_bytes: total_bytes,
        })
    }
    .await;

    let _ = tokio::fs::remove_file(&temp_output).await;
    result
}
