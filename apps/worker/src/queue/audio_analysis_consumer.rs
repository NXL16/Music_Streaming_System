use crate::modal::client;
use crate::redis::{RedisPublisher, SongCompletionEvent};
use anyhow::Result;
use redis::aio::ConnectionManager;
use redis::streams::StreamClaimReply;
use redis::{AsyncCommands, FromRedisValue, Value};
use serde::Deserialize;

const GROUP: &str = "audio-intelligence-workers";
const CLAIM_IDLE_MS: u64 = 15 * 60 * 1000;

#[derive(Debug, Deserialize)]
struct AudioAnalysisJob {
    song_id: String,
    metadata_version: i64,
    source_key: String,
}

impl AudioAnalysisJob {
    fn valid(&self) -> bool {
        !self.song_id.trim().is_empty()
            && !self.source_key.trim().is_empty()
            && self.metadata_version > 0
    }
}

pub struct AudioAnalysisConsumer {
    client: redis::Client,
    publisher_conn: ConnectionManager,
    queue_name: String,
}

impl AudioAnalysisConsumer {
    pub async fn new(redis_url: &str) -> Result<Self> {
        let client = redis::Client::open(redis_url)?;
        let publisher_conn = ConnectionManager::new(client.clone()).await?;
        let queue_name = std::env::var("AUDIO_INTELLIGENCE_QUEUE")
            .unwrap_or_else(|_| "audio_intelligence_queue".to_string());
        Ok(Self {
            client,
            publisher_conn,
            queue_name,
        })
    }

    pub async fn run(&self) -> Result<()> {
        let mut conn = self.client.get_async_connection().await?;
        let consumer = format!("audio-intelligence-{}", std::process::id());
        let mut claim_cursor = "0-0".to_string();
        let mut next_claim_at = tokio::time::Instant::now();
        let created: redis::RedisResult<String> = redis::cmd("XGROUP")
            .arg("CREATE")
            .arg(&self.queue_name)
            .arg(GROUP)
            .arg("0")
            .arg("MKSTREAM")
            .query_async(&mut conn)
            .await;
        if let Err(error) = created
            && !error.to_string().contains("BUSYGROUP")
        {
            return Err(error.into());
        }

        loop {
            let reclaimed = if tokio::time::Instant::now() >= next_claim_at {
                next_claim_at = tokio::time::Instant::now() + tokio::time::Duration::from_secs(30);
                let (cursor, entry) = self.claim_stale(&consumer, &claim_cursor).await?;
                claim_cursor = cursor;
                entry
            } else {
                None
            };
            let entry = match reclaimed {
                Some(entry) => entry,
                None => {
                    let reply: Option<redis::streams::StreamReadReply> = redis::cmd("XREADGROUP")
                        .arg("GROUP")
                        .arg(GROUP)
                        .arg(&consumer)
                        .arg("COUNT")
                        .arg(1)
                        .arg("BLOCK")
                        .arg(1000)
                        .arg("STREAMS")
                        .arg(&self.queue_name)
                        .arg(">")
                        .query_async(&mut conn)
                        .await?;
                    let Some(entry) = reply
                        .and_then(|reply| reply.keys.into_iter().next())
                        .and_then(|key| key.ids.into_iter().next())
                    else {
                        continue;
                    };
                    let payload = entry
                        .map
                        .get("payload")
                        .and_then(|value| String::from_redis_value(value).ok())
                        .unwrap_or_default();
                    (entry.id, payload)
                }
            };
            let (message_id, payload) = entry;
            if payload.is_empty() {
                self.ack(&message_id).await?;
                continue;
            }
            let job = match serde_json::from_str::<AudioAnalysisJob>(&payload) {
                Ok(job) if job.valid() => job,
                _ => {
                    self.ack(&message_id).await?;
                    continue;
                }
            };

            let event = match client::analyze(&job.song_id, &job.source_key).await {
                Ok(analysis) => {
                    eprintln!(
                        "audio_analysis song_id={} version={} bpm={} energy={} tags_count={}",
                        job.song_id,
                        analysis.analysis_version,
                        analysis.bpm,
                        analysis.energy,
                        analysis.tags.len(),
                    );
                    SongCompletionEvent {
                        song_id: job.song_id,
                        metadata_version: job.metadata_version,
                        status: "success".to_string(),
                        audio_analysis_only: true,
                        duration_sec: None,
                        encrypted_file_path: None,
                        bitrate_kbps: None,
                        codec: None,
                        format: None,
                        audio_bpm: Some(analysis.bpm),
                        audio_energy: Some(analysis.energy),
                        audio_tags: Some(analysis.tags),
                        audio_embedding: Some(analysis.embedding),
                        audio_analysis_version: Some(analysis.analysis_version),
                        audio_analysis_error: None,
                        error_message: None,
                    }
                }
                Err(error) => SongCompletionEvent {
                    song_id: job.song_id,
                    metadata_version: job.metadata_version,
                    status: "error".to_string(),
                    audio_analysis_only: true,
                    duration_sec: None,
                    encrypted_file_path: None,
                    bitrate_kbps: None,
                    codec: None,
                    format: None,
                    audio_bpm: None,
                    audio_energy: None,
                    audio_tags: None,
                    audio_embedding: None,
                    audio_analysis_version: None,
                    audio_analysis_error: Some(error.to_string()),
                    error_message: None,
                },
            };
            let mut publisher = RedisPublisher::from_manager(self.publisher_conn.clone());
            publisher.publish_song_completion(event).await?;
            self.ack(&message_id).await?;
        }
    }

    async fn claim_stale(
        &self,
        consumer: &str,
        start: &str,
    ) -> Result<(String, Option<(String, String)>)> {
        let mut conn = self.client.get_async_connection().await?;
        let reply: Value = redis::cmd("XAUTOCLAIM")
            .arg(&self.queue_name)
            .arg(GROUP)
            .arg(consumer)
            .arg(CLAIM_IDLE_MS)
            .arg(start)
            .arg("COUNT")
            .arg(1)
            .arg("JUSTID")
            .query_async(&mut conn)
            .await?;
        let Value::Bulk(parts) = reply else {
            anyhow::bail!("audio analysis XAUTOCLAIM response was invalid");
        };
        let cursor = String::from_redis_value(
            parts
                .first()
                .ok_or_else(|| anyhow::anyhow!("missing claim cursor"))?,
        )?;
        let ids = Vec::<String>::from_redis_value(
            parts
                .get(1)
                .ok_or_else(|| anyhow::anyhow!("missing claimed IDs"))?,
        )?;
        let Some(id) = ids.into_iter().next() else {
            return Ok((cursor, None));
        };
        let entries: StreamClaimReply = redis::cmd("XCLAIM")
            .arg(&self.queue_name)
            .arg(GROUP)
            .arg(consumer)
            .arg(0)
            .arg(&id)
            .query_async(&mut conn)
            .await?;
        let entry = entries.ids.into_iter().next().map(|entry| {
            let payload = entry.get::<String>("payload").unwrap_or_default();
            (entry.id, payload)
        });
        Ok((cursor, entry))
    }

    async fn ack(&self, message_id: &str) -> Result<()> {
        let mut conn = self.publisher_conn.clone();
        let _: i32 = conn.xack(&self.queue_name, GROUP, &[message_id]).await?;
        Ok(())
    }
}
