use std::env;

pub struct Config {
    pub redis_url: String,
    pub queue_name: String,
    pub max_concurrency: usize,
    pub job_max_retries: u32,
    pub retry_backoff_ms: u64,
    pub master_secret_key: Vec<u8>,
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
            master_secret_key: resolve_master_secret_key(),
        }
    }
}

fn resolve_master_secret_key() -> Vec<u8> {
    let raw = env::var("MASTER_SECRET_KEY")
        .expect("MASTER_SECRET_KEY environment variable is required and must be hex-encoded");
    let normalized = raw.trim();

    if normalized.is_empty() {
        panic!("MASTER_SECRET_KEY must not be empty");
    }
    if normalized.len() % 2 != 0 {
        panic!("MASTER_SECRET_KEY must be an even-length hex string");
    }

    hex_to_bytes(normalized).unwrap_or_else(|err| panic!("{err}"))
}

fn hex_to_bytes(input: &str) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(input.len() / 2);
    let bytes = input.as_bytes();

    for i in (0..bytes.len()).step_by(2) {
        let high = hex_value(bytes[i]).ok_or_else(|| {
            format!("MASTER_SECRET_KEY has invalid hex character at position {i}")
        })?;
        let low = hex_value(bytes[i + 1]).ok_or_else(|| {
            format!(
                "MASTER_SECRET_KEY has invalid hex character at position {}",
                i + 1
            )
        })?;
        out.push((high << 4) | low);
    }

    Ok(out)
}

fn hex_value(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
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
