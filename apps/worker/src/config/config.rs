use std::{env, fs};

pub struct Config {
    pub redis_url: String,
    pub queue_name: String,
    pub max_concurrency: usize,
    pub job_max_retries: u32,
    pub retry_backoff_ms: u64,
    pub stream_claim_idle_ms: u64,
    pub stream_max_deliveries: u64,
    pub master_secret_key: Vec<u8>,
}

impl Config {
    pub fn load() -> Self {
        let redis_url = resolve_redis_url();
        validate_internal_grpc_token();
        validate_meta_grpc_transport();

        Self {
            redis_url,
            queue_name: env::var("TRANSCODE_QUEUE")
                .ok()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| "transcode_queue".to_string()),
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
            // Keep this above the longest legitimate pipeline execution. The
            // default covers the 15-minute Modal deadline plus stem packaging,
            // downloads, and metadata publication. A reclaimed entry may run
            // twice, so claiming active jobs is worse than a slower recovery.
            stream_claim_idle_ms: env::var("WORKER_STREAM_CLAIM_IDLE_MS")
                .ok()
                .and_then(|v| v.parse::<u64>().ok())
                .filter(|v| *v > 0)
                .unwrap_or(2_400_000),
            stream_max_deliveries: env::var("WORKER_STREAM_MAX_DELIVERIES")
                .ok()
                .and_then(|v| v.parse::<u64>().ok())
                .filter(|v| *v > 0)
                .unwrap_or(5),
            master_secret_key: resolve_master_secret_key(),
        }
    }
}

fn validate_internal_grpc_token() {
    let token = env::var("INTERNAL_GRPC_TOKEN")
        .expect("INTERNAL_GRPC_TOKEN environment variable is required");
    if token.trim().len() < 32 {
        panic!("INTERNAL_GRPC_TOKEN must be at least 32 characters");
    }
}

fn validate_meta_grpc_transport() {
    let url = env::var("META_GRPC_URL")
        .expect("META_GRPC_URL environment variable is required")
        .trim()
        .to_string();
    let tls_enabled = match env::var("META_GRPC_TLS_ENABLED") {
        Ok(value) if value.trim().eq_ignore_ascii_case("true") => true,
        Ok(value) if value.trim().is_empty() || value.trim().eq_ignore_ascii_case("false") => false,
        Err(_) => false,
        Ok(_) => panic!("META_GRPC_TLS_ENABLED must be true or false"),
    };

    if tls_enabled {
        if !url.to_lowercase().starts_with("https://") {
            panic!("META_GRPC_URL must use https:// when META_GRPC_TLS_ENABLED=true");
        }
        validate_readable_file("META_GRPC_TLS_CA_FILE");
        let certificate_file = optional_nonempty_env("META_GRPC_TLS_CLIENT_CERT_FILE");
        let key_file = optional_nonempty_env("META_GRPC_TLS_CLIENT_KEY_FILE");
        if certificate_file.is_some() != key_file.is_some() {
            panic!(
                "META_GRPC_TLS_CLIENT_CERT_FILE and META_GRPC_TLS_CLIENT_KEY_FILE must be set together"
            );
        }
        if certificate_file.is_some() {
            validate_readable_file("META_GRPC_TLS_CLIENT_CERT_FILE");
            validate_readable_file("META_GRPC_TLS_CLIENT_KEY_FILE");
        }
    } else if url.to_lowercase().starts_with("https://") {
        panic!("META_GRPC_TLS_ENABLED must be true when META_GRPC_URL uses https://");
    }
}

fn optional_nonempty_env(key: &str) -> Option<String> {
    env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn validate_readable_file(key: &str) {
    let path = env::var(key).unwrap_or_else(|_| panic!("{key} environment variable is required"));
    if path.trim().is_empty() {
        panic!("{key} environment variable is required");
    }
    fs::metadata(path.trim()).unwrap_or_else(|error| panic!("{key} is not readable: {error}"));
}

fn resolve_master_secret_key() -> Vec<u8> {
    let raw = env::var("MASTER_SECRET_KEY")
        .expect("MASTER_SECRET_KEY environment variable is required and must be hex-encoded");
    let normalized = raw.trim();

    if normalized.is_empty() {
        panic!("MASTER_SECRET_KEY must not be empty");
    }
    if !normalized.len().is_multiple_of(2) {
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
    if let Ok(url) = env::var("REDIS_URL")
        && !url.trim().is_empty()
    {
        return url;
    }

    let host = env::var("REDIS_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = env::var("REDIS_PORT").unwrap_or_else(|_| "6379".to_string());
    let password = env::var("REDIS_PASSWORD").unwrap_or_default();
    let encoded = urlencoding::encode(&password);

    format!("redis://:{}@{}:{}", encoded, host, port)
}
