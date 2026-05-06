use redis::aio::Connection;
use anyhow::{Context, Result};
use std::env;
use serde::Serialize;
use serde_json;

#[derive(Debug, Serialize)]
pub struct SongCompletionEvent {
    pub song_id: String,
    pub status: String, // "success" or "error"
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
        let redis_url = env::var("REDIS_URL").context("REDIS_URL not set")?;
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
        
        println!("📤 Published completion event for song {}: {}", event.song_id, event.status);
        Ok(())
    }
}