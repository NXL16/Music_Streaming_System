use crate::queue::job::JobPayload;
use crate::job::handler::handle; 

pub struct Consumer {
    client: redis::Client,
}

impl Consumer {
    pub async fn new(redis_url: &str) -> anyhow::Result<Self> {
        let client = redis::Client::open(redis_url)?;
        Ok(Self { client })
    }

    pub async fn run(&self) -> anyhow::Result<()> {
        let mut conn = self.client.get_async_connection().await?;

        println!("👂 Listening for jobs...");

        loop {
            let (_key, job_str): (String, String) =
                redis::cmd("BLPOP")
                    .arg("transcode_queue")
                    .arg(0)
                    .query_async(&mut conn)
                    .await?;

            let job: JobPayload = serde_json::from_str(&job_str)?;

            println!("🔥 Received job: {:?}", job);

            if let Err(e) = handle(job).await {
                eprintln!("❌ Job failed: {:?}", e);
            }
        }
    }
}