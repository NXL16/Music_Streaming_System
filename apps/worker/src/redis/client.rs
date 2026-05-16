use anyhow::Result;
use redis::aio::Connection;
use serde::Serialize;
use std::env;

#[derive(Debug, Serialize)]
pub struct SongCompletionEvent {
    pub song_id: String,
    pub status: String,
    pub duration_sec: Option<i32>,
    pub encrypted_file_path: Option<String>,
    pub bitrate_kbps: Option<i32>,
    pub codec: Option<String>,
    pub format: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}

pub struct RedisPublisher {
    conn: Connection,
}

impl RedisPublisher {
    pub async fn new() -> Result<Self> {
        let redis_url = resolve_redis_url();
        let client = redis::Client::open(redis_url)?;
        let conn = client.get_async_connection().await?;
        Ok(Self { conn })
    }

    pub async fn publish_song_completion(&mut self, event: SongCompletionEvent) -> Result<()> {
        let message = serde_json::to_string(&event)?;
        let _: i64 = redis::cmd("LPUSH")
            .arg("song_completion_queue")
            .arg(&message)
            .query_async(&mut self.conn)
            .await?;

        Ok(())
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
