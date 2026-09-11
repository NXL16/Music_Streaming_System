use anyhow::Result;
use redis::aio::ConnectionManager;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct SongCompletionEvent {
    pub song_id: String,
    pub metadata_version: i64,
    pub status: String,
    pub audio_analysis_only: bool,
    pub duration_sec: Option<i32>,
    pub encrypted_file_path: Option<String>,
    pub bitrate_kbps: Option<i32>,
    pub codec: Option<String>,
    pub format: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_bpm: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_energy: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_embedding: Option<Vec<f64>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_analysis_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_analysis_error: Option<String>,
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
        let _: String = redis::cmd("XADD")
            .arg("song_completion_queue")
            .arg("*")
            .arg("payload")
            .arg(&message)
            .query_async(&mut self.conn)
            .await?;

        Ok(())
    }

    pub async fn publish_audio_analysis_job(
        &mut self,
        song_id: &str,
        metadata_version: i64,
        source_key: &str,
    ) -> Result<()> {
        let queue = std::env::var("AUDIO_INTELLIGENCE_QUEUE")
            .unwrap_or_else(|_| "audio_intelligence_queue".to_string());
        let payload = serde_json::json!({
            "song_id": song_id,
            "metadata_version": metadata_version,
            "source_key": source_key,
        });
        let _: String = redis::cmd("XADD")
            .arg(queue)
            .arg("*")
            .arg("payload")
            .arg(payload.to_string())
            .query_async(&mut self.conn)
            .await?;
        Ok(())
    }
}
