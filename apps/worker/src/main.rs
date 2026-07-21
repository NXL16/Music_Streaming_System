mod config;
mod crypto;
mod job;
mod metadata;
mod mood_analysis;
mod observability;
mod pipeline;
mod proto;
mod queue;
mod r2;
mod redis;

use crate::config::config::Config;
use crate::observability::metrics::RuntimeMetrics;
use crate::queue::consumer::Consumer;
use std::path::PathBuf;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // `pnpm dev` launches this binary from the workspace root. Resolve the
    // environment file from the worker crate itself so worker-only settings
    // (including the local mood analyser) are never silently skipped.
    let worker_env = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".env");
    if let Err(error) = dotenvy::from_path_override(&worker_env) {
        eprintln!("worker_config env_load_failed path={} error={}", worker_env.display(), error);
    }

    let mood_enabled = matches!(
        std::env::var("MOOD_ANALYSIS_ENABLED").as_deref(),
        Ok("true") | Ok("1") | Ok("TRUE") | Ok("True")
    );
    let mood_executable_configured = std::env::var("MOOD_ANALYSIS_EXECUTABLE")
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    eprintln!(
        "worker_config mood_analysis_enabled={} mood_analysis_executable_configured={}",
        mood_enabled, mood_executable_configured
    );

    let config = Config::load();
    let metrics = RuntimeMetrics::shared();

    let consumer = Consumer::new(
        &config.redis_url,
        config.queue_name.clone(),
        config.max_concurrency,
        config.job_max_retries,
        config.retry_backoff_ms,
        config.master_secret_key.clone(),
        metrics,
    )
    .await?;
    consumer.run().await?;

    Ok(())
}
