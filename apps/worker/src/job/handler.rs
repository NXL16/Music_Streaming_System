use crate::observability::log::log_event;
use crate::pipeline::ingest::run_pipeline;
use crate::queue::job::JobPayload;
use crate::redis::{RedisPublisher, SongCompletionEvent};
use aws_sdk_s3::Client;
use std::sync::Arc;

pub async fn handle(
    job: JobPayload,
    master_secret_key: Arc<Vec<u8>>,
    r2_client: Client,
    redis_conn: redis::aio::ConnectionManager,
) -> anyhow::Result<()> {
    let song_id = job.song_id.clone();
    let metadata_version = job.metadata_version;
    log_event("info", "job_started", &[("song_id", song_id.clone())]);
    let mut redis = RedisPublisher::from_manager(redis_conn);

    match run_pipeline(job, master_secret_key, r2_client).await {
        Ok(ctx) => {
            let duration_sec = ctx.duration.map(|duration| duration.round() as i32);
            let encrypted_file_path = ctx
                .output_key
                .unwrap_or_else(|| format!("processed/{}.m4a", song_id));

            let event = SongCompletionEvent {
                song_id: song_id.clone(),
                metadata_version,
                status: "success".to_string(),
                duration_sec,
                encrypted_file_path: Some(encrypted_file_path),
                bitrate_kbps: Some(128),
                codec: Some("aac".to_string()),
                format: Some("fmp4".to_string()),
                mood_tags: (!ctx.mood_tags.is_empty()).then_some(ctx.mood_tags),
                mood_analysis_version: ctx.mood_analysis_version,
                mood_analysis_scores: ctx.mood_analysis_scores,
                error_message: None,
            };

            redis.publish_song_completion(event).await?;
            log_event(
                "info",
                "job_completed",
                &[
                    ("song_id", song_id.clone()),
                    ("status", "success".to_string()),
                ],
            );
        }
        Err(e) => {
            log_event(
                "error",
                // This is an individual pipeline attempt, not a completed
                // terminal job. The consumer decides retry/DLQ afterward.
                "job_attempt_failed",
                &[
                    ("song_id", song_id.clone()),
                    ("status", "error".to_string()),
                    ("error", e.to_string()),
                ],
            );

            return Err(e);
        }
    }

    Ok(())
}
