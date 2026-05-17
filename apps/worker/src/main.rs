mod config;
mod crypto;
mod job;
mod metadata;
mod pipeline;
mod proto;
mod queue;
mod r2;
mod redis;
mod transcoder;

use crate::config::config::Config;
use crate::queue::consumer::Consumer;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    let config = Config::load();

    let consumer = Consumer::new(
        &config.redis_url,
        config.queue_name.clone(),
        config.max_concurrency,
        config.job_max_retries,
        config.retry_backoff_ms,
        config.master_secret_key.clone(),
    )
    .await?;
    consumer.run().await?;

    Ok(())
}
