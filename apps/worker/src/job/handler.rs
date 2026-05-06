use crate::queue::job::JobPayload;
use crate::pipeline::ingest::run_pipeline;
use crate::redis::{RedisPublisher, SongCompletionEvent};

pub async fn handle(job: JobPayload) -> anyhow::Result<()> {
    println!("🚀 Start job {}", job.song_id);

    let song_id = job.song_id.clone();
    let mut redis = RedisPublisher::new().await?;

    match run_pipeline(job).await {
        Ok(ctx) => {
            println!("✅ Done job {}", song_id);
            let duration_sec = ctx.duration.map(|duration| duration.round() as i32);
            let encrypted_file_path = ctx
                .output_key
                .unwrap_or_else(|| format!("processed/{}.m4a", song_id));
            
            let event = SongCompletionEvent {
                song_id: song_id.clone(),
                status: "success".to_string(),
                duration_sec,
                encrypted_file_path: Some(encrypted_file_path),
                bitrate_kbps: Some(128),
                codec: Some("aac".to_string()),
                format: Some("fmp4".to_string()),
                error_message: None,
            };
            
            redis.publish_song_completion(event).await?;
        }
        Err(e) => {
            eprintln!("❌ Job failed: {}", e);
            
            let event = SongCompletionEvent {
                song_id: song_id.clone(),
                status: "error".to_string(),
                duration_sec: None,
                encrypted_file_path: None,
                bitrate_kbps: None,
                codec: None,
                format: None,
                error_message: Some(e.to_string()),
            };
            
            let _ = redis.publish_song_completion(event).await;
            return Err(e);
        }
    }

    Ok(())
}