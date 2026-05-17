use crate::pipeline::context::PipelineContext;
use anyhow::{Context, Result};
use aws_sdk_s3::primitives::ByteStream;
use std::env;

pub async fn upload(ctx: &mut PipelineContext) -> Result<()> {
    let data = ctx
        .data
        .take()
        .context("No processed data found in context to upload")?;

    let client = crate::r2::client::create_r2_client()
        .await
        .context("Failed to initialize R2 client")?;

    let bucket = env::var("R2_BUCKET").context("R2_BUCKET env is not set")?;
    let key = format!("processed/{}.m4a", ctx.job.song_id);

    client
        .put_object()
        .bucket(&bucket)
        .key(&key)
        .body(ByteStream::from(data))
        .content_type("audio/mp4")
        .cache_control("public, max-age=31536000, immutable")
        .send()
        .await
        .context("Failed to upload object to R2")?;

    ctx.output_key = Some(key);

    Ok(())
}
