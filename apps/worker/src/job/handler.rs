use crate::queue::job::JobPayload;
use crate::pipeline::ingest::run_pipeline;

pub async fn handle(job: JobPayload) -> anyhow::Result<()> {
    println!("🚀 Start job {}", job.song_id);

    let song_id = job.song_id.clone();

    run_pipeline(job).await?;

    println!("✅ Done job {}", song_id);

    Ok(())
}