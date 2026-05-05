mod config;
mod queue;
mod job;
mod pipeline;
mod transcoder;
mod crypto;
mod r2;
mod kms;
mod proto;
mod metadata;

use crate::config::config::Config;
use crate::queue::consumer::Consumer;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    let config = Config::load();

    let redis_url = config.redis_url();
    let consumer = Consumer::new(&redis_url).await?;
    consumer.run().await?;

    Ok(())
}