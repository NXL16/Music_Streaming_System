use crate::pipeline::context::PipelineContext;
use crate::pipeline::steps::{download, transcode};
use crate::queue::job::JobPayload;
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

pub async fn run_pipeline(
    job: JobPayload,
    master_secret_key: Arc<Vec<u8>>,
) -> anyhow::Result<PipelineContext> {
    let pipeline_started = Instant::now();
    let song_id = job.song_id.clone();
    let mut ctx = PipelineContext::new(job, master_secret_key);

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
    timeout(
        Duration::from_secs(stage_timeout_secs("WORKER_TRANSCODE_TIMEOUT_SEC", 600)),
        transcode::transcode(&mut ctx),
    )
    .await
    .map_err(|_| anyhow::anyhow!("process stage timed out"))??;
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
