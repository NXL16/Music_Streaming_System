use crate::pipeline::context::PipelineContext;
use anyhow::Context;

pub async fn download(ctx: &mut PipelineContext) -> anyhow::Result<()> {
    let file_url = ctx
        .job
        .file_url
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("missing file_url"))?;

    println!("📥 Downloading {}", file_url);

    let res = reqwest::get(file_url)
        .await
        .context("failed to download source file")?;

    let stream = res.bytes_stream();

    ctx.input_stream = Some(Box::pin(stream));

    Ok(())
}