use crate::job::handler::handle_with_options;
use crate::queue::job::JobPayload;
use std::sync::Arc;
use tokio::sync::Semaphore;
use tokio::time::{Duration, sleep};

pub struct Consumer {
    client: redis::Client,
    queue_name: String,
    max_concurrency: usize,
    job_max_retries: u32,
    retry_backoff_ms: u64,
    master_secret_key: Arc<Vec<u8>>,
}

impl Consumer {
    pub async fn new(
        redis_url: &str,
        queue_name: String,
        max_concurrency: usize,
        job_max_retries: u32,
        retry_backoff_ms: u64,
        master_secret_key: Vec<u8>,
    ) -> anyhow::Result<Self> {
        let client = redis::Client::open(redis_url)?;
        Ok(Self {
            client,
            queue_name,
            max_concurrency,
            job_max_retries,
            retry_backoff_ms,
            master_secret_key: Arc::new(master_secret_key),
        })
    }

    pub async fn run(&self) -> anyhow::Result<()> {
        let mut conn = self.client.get_async_connection().await?;
        let concurrency = Arc::new(Semaphore::new(self.max_concurrency));

        loop {
            let popped: Result<(String, String), redis::RedisError> = redis::cmd("BLPOP")
                .arg(&self.queue_name)
                .arg(0)
                .query_async(&mut conn)
                .await;

            let (_, job_str) = match popped {
                Ok(v) => v,
                Err(err) => {
                    eprintln!("Consumer: Redis BLPOP error: {err}");
                    sleep(Duration::from_secs(1)).await;
                    conn = self.client.get_async_connection().await?;
                    continue;
                }
            };

            let job: JobPayload = match serde_json::from_str(&job_str) {
                Ok(job) => job,
                Err(err) => {
                    eprintln!("Consumer: invalid job payload dropped: {err}; raw={job_str}");
                    continue;
                }
            };

            let permit = concurrency.clone().acquire_owned().await?;
            let retries = self.job_max_retries;
            let backoff_ms = self.retry_backoff_ms;
            let master_secret_key = Arc::clone(&self.master_secret_key);

            tokio::spawn(async move {
                let _permit = permit;
                if let Err(err) = process_with_retry(job, retries, backoff_ms, master_secret_key).await {
                    eprintln!("Consumer: job failed permanently: {err}");
                }
            });
        }
    }
}

async fn process_with_retry(
    job: JobPayload,
    max_retries: u32,
    retry_backoff_ms: u64,
    master_secret_key: Arc<Vec<u8>>,
) -> anyhow::Result<()> {
    let total_attempts = max_retries.saturating_add(1);

    for attempt in 1..=total_attempts {
        let publish_error_event = attempt == total_attempts;
        match handle_with_options(job.clone(), publish_error_event, Arc::clone(&master_secret_key)).await {
            Ok(_) => return Ok(()),
            Err(err) => {
                if attempt == total_attempts {
                    return Err(err);
                }

                let exponent = (attempt - 1).min(20);
                let multiplier = 1u64 << exponent;
                let delay = retry_backoff_ms.saturating_mul(multiplier);
                sleep(Duration::from_millis(delay)).await;
            }
        }
    }

    Err(anyhow::anyhow!("Unexpected retry loop termination"))
}
