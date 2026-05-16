use std::env;

pub struct Config {
    pub redis_url: String,
    pub queue_name: String,
    pub max_concurrency: usize,
    pub job_max_retries: u32,
    pub retry_backoff_ms: u64,
}

impl Config {
    pub fn load() -> Self {
        let redis_url = resolve_redis_url();

        Self {
            redis_url,
            queue_name: env::var("TRANSCODE_QUEUE")
                .unwrap_or_else(|_| "transcode_queue".to_string()),
            max_concurrency: env::var("WORKER_MAX_CONCURRENCY")
                .ok()
                .or_else(|| env::var("WORKER_CONCURRENCY").ok())
                .and_then(|v| v.parse::<usize>().ok())
                .filter(|v| *v > 0)
                .unwrap_or(4),
            job_max_retries: env::var("WORKER_JOB_MAX_RETRIES")
                .ok()
                .and_then(|v| v.parse::<u32>().ok())
                .unwrap_or(3),
            retry_backoff_ms: env::var("WORKER_RETRY_BACKOFF_MS")
                .ok()
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(300),
        }
    }
}

fn resolve_redis_url() -> String {
    if let Ok(url) = env::var("REDIS_URL") {
        if !url.trim().is_empty() {
            return url;
        }
    }

    let host = env::var("REDIS_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = env::var("REDIS_PORT").unwrap_or_else(|_| "6379".to_string());
    let password = env::var("REDIS_PASSWORD").unwrap_or_default();
    let encoded = urlencoding::encode(&password);

    format!("redis://:{}@{}:{}", encoded, host, port)
}
