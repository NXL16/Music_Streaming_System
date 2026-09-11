mod config;
mod crypto;
mod job;
mod metadata;
mod modal;
mod observability;
mod pipeline;
mod proto;
mod queue;
mod r2;
mod redis;

use crate::config::Config;
use crate::observability::metrics::RuntimeMetrics;
use crate::queue::audio_analysis_consumer::AudioAnalysisConsumer;
use crate::queue::consumer::Consumer;
use std::path::PathBuf;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // `pnpm dev` launches this binary from the workspace root. Resolve the
    // environment file from the worker crate itself so worker-only settings
    // are never silently skipped.
    let worker_env = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".env");
    if let Err(error) = dotenvy::from_path_override(&worker_env) {
        eprintln!(
            "worker_config env_load_failed path={} error={}",
            worker_env.display(),
            error
        );
    }

    let audio_intelligence_enabled = crate::modal::client::audio_intelligence_enabled();
    let audio_intelligence_url_configured = std::env::var("AUDIO_INTELLIGENCE_URL")
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    let audio_intelligence_secret_configured = std::env::var("AUDIO_INTELLIGENCE_SHARED_SECRET")
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    eprintln!(
        "worker_config audio_intelligence_enabled={} audio_intelligence_url_configured={} audio_intelligence_secret_configured={}",
        audio_intelligence_enabled,
        audio_intelligence_url_configured,
        audio_intelligence_secret_configured
    );

    let config = Config::load();
    let metrics = RuntimeMetrics::shared();

    let consumer = Consumer::new(&config, metrics).await?;
    if audio_intelligence_enabled {
        let audio_consumer = AudioAnalysisConsumer::new(&config.redis_url).await?;
        tokio::try_join!(consumer.run(), audio_consumer.run())?;
    } else {
        consumer.run().await?;
    }

    Ok(())
}
