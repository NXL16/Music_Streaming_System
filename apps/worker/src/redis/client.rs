use anyhow::Result;
use redis::aio::ConnectionManager;
use serde::Serialize;

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
    conn: ConnectionManager,
}

impl RedisPublisher {
    /// Build a publisher from a shared `ConnectionManager`. The manager is
    /// cloneable and multiplexes over a single auto-reconnecting connection,
    /// so callers should clone the shared manager once per job rather than
    /// opening a fresh connection each time.
    pub fn from_manager(manager: ConnectionManager) -> Self {
        Self { conn: manager }
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
