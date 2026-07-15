use crate::pipeline::context::PipelineContext;
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

async fn cleanup_waveform_temp_files(song_id: &str) {
    let temp_dir = std::env::temp_dir();
    let prefix = format!("waveform_source_{}_", song_id);
    if let Ok(mut entries) = tokio::fs::read_dir(&temp_dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            if let Some(name) = entry.file_name().to_str() {
                if name.starts_with(&prefix) && name.ends_with(".bin") {
                    let _ = tokio::fs::remove_file(entry.path()).await;
                }
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
