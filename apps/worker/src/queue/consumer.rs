use crate::job::handler::handle_with_options;
use crate::observability::log::log_event;
use crate::observability::metrics::RuntimeMetrics;
use crate::queue::job::JobPayload;
use std::sync::Arc;
use std::sync::atomic::Ordering;
use tokio::sync::Semaphore;
use tokio::time::{Duration, sleep};

pub struct Consumer {
    client: redis::Client,
    queue_name: String,
    max_concurrency: usize,
    job_max_retries: u32,
    retry_backoff_ms: u64,
    master_secret_key: Arc<Vec<u8>>,
    metrics: Arc<RuntimeMetrics>,
}

impl Consumer {
    pub async fn new(
        redis_url: &str,
        queue_name: String,
        max_concurrency: usize,
        job_max_retries: u32,
        retry_backoff_ms: u64,
        master_secret_key: Vec<u8>,
        metrics: Arc<RuntimeMetrics>,
    ) -> anyhow::Result<Self> {
        let client = redis::Client::open(redis_url)?;
        Ok(Self {
            client,
            queue_name,
            max_concurrency,
            job_max_retries,
            retry_backoff_ms,
            master_secret_key: Arc::new(master_secret_key),
            metrics,
        })
    }

    pub async fn run(&self) -> anyhow::Result<()> {
        let mut conn = self.client.get_async_connection().await?;
        let concurrency = Arc::new(Semaphore::new(self.max_concurrency));
        let mut metric_tick = tokio::time::interval(Duration::from_secs(30));
        let mut shutdown = Box::pin(tokio::signal::ctrl_c());
        let mut stopping = false;

        loop {
            if stopping {
                if concurrency.available_permits() == self.max_concurrency {
                    log_event("info", "worker_shutdown_complete", &[]);
                    break;
                }
                sleep(Duration::from_millis(200)).await;
                continue;
            }

            let mut cmd = redis::cmd("BLPOP");
            cmd.arg(&self.queue_name).arg(1);
            let blpop_fut = cmd.query_async(&mut conn);

            let popped: Result<Option<(String, String)>, redis::RedisError> = tokio::select! {
                _ = &mut shutdown => {
                    stopping = true;
                    log_event("warn", "worker_shutdown_requested", &[]);
                    continue;
                }
                _ = metric_tick.tick() => {
                    let (started, ok, failed, retries) = self.metrics.snapshot();
                    log_event(
                        "info",
                        "worker_metrics",
                        &[
                            ("jobs_started", started.to_string()),
                            ("jobs_succeeded", ok.to_string()),
                            ("jobs_failed", failed.to_string()),
                            ("retries_total", retries.to_string()),
                        ],
                    );
                    continue;
                }
                res = blpop_fut => res,
            };

            let (_, job_str) = match popped {
                Ok(Some(v)) => v,
                Ok(None) => continue,
                Err(err) => {
                    let msg = err.to_string();
                    log_event("error", "redis_blpop_error", &[("error", msg)]);
                    sleep(Duration::from_secs(1)).await;
                    conn = self.client.get_async_connection().await?;
                    continue;
                }
            };

            let job: JobPayload = match serde_json::from_str(&job_str) {
                Ok(job) => job,
                Err(err) => {
                    log_event(
                        "error",
                        "invalid_job_payload_dropped",
                        &[("error", err.to_string())],
                    );
                    continue;
                }
            };

            let permit = concurrency.clone().acquire_owned().await?;
            let retries = self.job_max_retries;
            let backoff_ms = self.retry_backoff_ms;
            let master_secret_key = Arc::clone(&self.master_secret_key);
            let metrics = Arc::clone(&self.metrics);
            metrics.jobs_started.fetch_add(1, Ordering::Relaxed);

            tokio::spawn(async move {
                let _permit = permit;
                let song_id = job.song_id.clone();
                if let Err(err) = process_with_retry(job, retries, backoff_ms, master_secret_key, Arc::clone(&metrics)).await {
                    metrics.jobs_failed.fetch_add(1, Ordering::Relaxed);
                    log_event("error", "job_failed_permanently", &[("song_id", song_id), ("error", err.to_string())]);
                } else {
                    metrics.jobs_succeeded.fetch_add(1, Ordering::Relaxed);
                }
            });
        }

        Ok(())
    }
}

async fn process_with_retry(
    job: JobPayload,
    max_retries: u32,
    retry_backoff_ms: u64,
    master_secret_key: Arc<Vec<u8>>,
    metrics: Arc<RuntimeMetrics>,
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
                metrics.retries_total.fetch_add(1, Ordering::Relaxed);

                let exponent = (attempt - 1).min(20);
                let multiplier = 1u64 << exponent;
                let delay = retry_backoff_ms.saturating_mul(multiplier);
                sleep(Duration::from_millis(delay)).await;
            }
        }
    }

    Err(anyhow::anyhow!("Unexpected retry loop termination"))
}
