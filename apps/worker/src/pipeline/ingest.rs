use crate::pipeline::context::PipelineContext;
use crate::pipeline::steps::transcode::waveform::{
    WAVEFORM_POINTS, extract_waveform_from_audio_file,
};
use crate::pipeline::steps::{download, transcode};
use crate::queue::job::JobPayload;
use aws_sdk_s3::Client;
use std::sync::Arc;
use std::time::Instant;
use tokio::time::{Duration, timeout};

fn stage_timeout_secs(env_key: &str, default_secs: u64) -> u64 {
    std::env::var(env_key)
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(default_secs)
}

fn stem_separation_enabled() -> bool {
    matches!(
        std::env::var("STEM_SEPARATION_ENABLED").as_deref(),
        Ok("true") | Ok("1") | Ok("TRUE") | Ok("True")
    )
}

async fn cleanup_waveform_temp_files(song_id: &str) {
    let temp_dir = std::env::temp_dir();
    let prefix = format!("waveform_source_{}_", song_id);
    if let Ok(mut entries) = tokio::fs::read_dir(&temp_dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            if let Some(name) = entry.file_name().to_str()
                && name.starts_with(&prefix)
                && name.ends_with(".bin")
            {
                let _ = tokio::fs::remove_file(entry.path()).await;
            }
        }
    }
}

pub async fn run_pipeline(
    job: JobPayload,
    master_secret_key: Arc<Vec<u8>>,
    r2_client: Client,
) -> anyhow::Result<PipelineContext> {
    let pipeline_started = Instant::now();
    let song_id = job.song_id.clone();
    let mut ctx = PipelineContext::new(job, master_secret_key, r2_client);

    if ctx.job.requires_stem_separation() {
        if !stem_separation_enabled() {
            return Err(anyhow::anyhow!(
                "stem separation is disabled for SING audio mode"
            ));
        }
        let separation_started = Instant::now();
        let separated = if let Some((vocal_key, instrumental_key)) =
            download::complete_staging_stem_keys(&ctx.r2_client, &song_id).await?
        {
            eprintln!(
                "pipeline song_id={} stage=modal_separation reused_staging=true",
                song_id,
            );
            crate::modal::client::SeparationResponse {
                vocal_key,
                instrumental_key,
                model_version: "reused-staging".to_string(),
            }
        } else {
            timeout(
                Duration::from_secs(stage_timeout_secs("STEM_SEPARATION_TIMEOUT_SEC", 900)),
                crate::modal::client::separate(&song_id, &ctx.job.r2_path),
            )
            .await
            .map_err(|_| anyhow::anyhow!("Modal stem separation timed out"))??
        };
        eprintln!(
            "pipeline song_id={} stage=modal_separation model={} elapsed_ms={}",
            song_id,
            separated.model_version,
            separation_started.elapsed().as_millis(),
        );

        let (instrumental_download, vocal_download) = tokio::join!(
            download::download_object_to_temp(
                &ctx.r2_client,
                &separated.instrumental_key,
                "instrumental",
            ),
            download::download_object_to_temp(&ctx.r2_client, &separated.vocal_key, "vocal",),
        );
        let (instrumental_path, vocal_path) = match (instrumental_download, vocal_download) {
            (Ok(instrumental_path), Ok(vocal_path)) => (instrumental_path, vocal_path),
            (instrumental, vocal) => {
                let instrumental_error = instrumental.as_ref().err().map(ToString::to_string);
                let vocal_error = vocal.as_ref().err().map(ToString::to_string);
                if let Ok(path) = instrumental {
                    let _ = tokio::fs::remove_file(path).await;
                }
                if let Ok(path) = vocal {
                    let _ = tokio::fs::remove_file(path).await;
                }
                return Err(anyhow::anyhow!(
                    "failed to download Modal stems: instrumental={instrumental_error:?}, vocal={vocal_error:?}",
                ));
            }
        };

        let stems_result = async {
            let waveform = extract_waveform_from_audio_file(&instrumental_path, WAVEFORM_POINTS)
                .await
                .unwrap_or_default();
            let instrumental = transcode::transcode_stem_file(
                &song_id,
                "instrumental",
                ctx.job.metadata_version,
                &instrumental_path,
                ctx.master_secret_key.as_slice(),
                ctx.r2_client.clone(),
                waveform,
            )
            .await?;
            let vocal = transcode::transcode_stem_file(
                &song_id,
                "vocal",
                ctx.job.metadata_version,
                &vocal_path,
                ctx.master_secret_key.as_slice(),
                ctx.r2_client.clone(),
                Vec::new(),
            )
            .await?;
            let mut high_outputs = Vec::new();
            if instrumental_path
                .extension()
                .and_then(|value| value.to_str())
                == Some("flac")
            {
                high_outputs.push(
                    transcode::transcode_stem_file(
                        &song_id,
                        "instrumental-high",
                        ctx.job.metadata_version,
                        &instrumental_path,
                        ctx.master_secret_key.as_slice(),
                        ctx.r2_client.clone(),
                        Vec::new(),
                    )
                    .await?,
                );
                high_outputs.push(
                    transcode::transcode_stem_file(
                        &song_id,
                        "vocal-high",
                        ctx.job.metadata_version,
                        &vocal_path,
                        ctx.master_secret_key.as_slice(),
                        ctx.r2_client.clone(),
                        Vec::new(),
                    )
                    .await?,
                );
            }
            Ok::<_, anyhow::Error>((instrumental, vocal, high_outputs))
        }
        .await;
        let _ = tokio::fs::remove_file(&instrumental_path).await;
        let _ = tokio::fs::remove_file(&vocal_path).await;
        let (instrumental, vocal, high_outputs) = stems_result?;

        let drift = (instrumental.duration - vocal.duration).abs();
        if drift > 0.050 {
            return Err(anyhow::anyhow!("stem durations differ by {:.3}s", drift));
        }
        ctx.duration = Some(instrumental.duration.min(vocal.duration));
        ctx.encrypted_size_bytes = Some(
            instrumental
                .encrypted_size_bytes
                .saturating_add(vocal.encrypted_size_bytes)
                .saturating_add(
                    high_outputs
                        .iter()
                        .map(|output| output.encrypted_size_bytes)
                        .sum::<usize>(),
                ),
        );
        // SING playback is defined by the two-stem manifest. Keep the
        // instrumental key as a compatibility metadata anchor; it is not a
        // substitute for clients that require the original mixed track.
        ctx.output_key = Some(instrumental.output_key);
        ctx.highest_bitrate_kbps = if high_outputs.is_empty() { 128 } else { 320 };
        let retained_variants = if high_outputs.is_empty() {
            ["instrumental", "vocal"].as_slice()
        } else {
            ["instrumental", "vocal", "instrumental-high", "vocal-high"].as_slice()
        };
        if let Err(error) = download::delete_obsolete_processed_variants(
            &ctx.r2_client,
            &song_id,
            retained_variants,
        )
        .await
        {
            eprintln!(
                "pipeline song_id={} warn=obsolete_rendition_cleanup_failed error={}",
                song_id, error
            );
        }
        if let Err(error) = download::delete_staging_objects(
            &ctx.r2_client,
            &[separated.instrumental_key, separated.vocal_key],
        )
        .await
        {
            eprintln!(
                "pipeline song_id={} warn=staging_cleanup_failed error={}",
                song_id, error
            );
        }
        eprintln!(
            "pipeline song_id={} stage=stem_package elapsed_ms={}",
            song_id,
            separation_started.elapsed().as_millis(),
        );
        return Ok(ctx);
    }

    let download_started = Instant::now();
    timeout(
        Duration::from_secs(stage_timeout_secs("WORKER_DOWNLOAD_TIMEOUT_SEC", 120)),
        download::download(&mut ctx),
    )
    .await
    .map_err(|_| anyhow::anyhow!("download stage timed out"))??;
    eprintln!(
        "pipeline song_id={} stage=download elapsed_ms={} source_bytes={}",
        song_id,
        download_started.elapsed().as_millis(),
        ctx.source_size_bytes.unwrap_or(0)
    );

    let process_started = Instant::now();
    let transcode_result = timeout(
        Duration::from_secs(stage_timeout_secs("WORKER_TRANSCODE_TIMEOUT_SEC", 600)),
        transcode::transcode(&mut ctx),
    )
    .await
    .map_err(|_| anyhow::anyhow!("process stage timed out"));

    cleanup_waveform_temp_files(&song_id).await;

    transcode_result??;
    eprintln!(
        "pipeline song_id={} stage=process elapsed_ms={}",
        song_id,
        process_started.elapsed().as_millis()
    );
    eprintln!(
        "pipeline song_id={} stage=total elapsed_ms={}",
        song_id,
        pipeline_started.elapsed().as_millis()
    );

    Ok(ctx)
}
