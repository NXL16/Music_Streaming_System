use crate::pipeline::context::PipelineContext;
use crate::pipeline::steps::{download, encrypt, metadata, transcode, upload};
use crate::queue::job::JobPayload;

pub async fn run_pipeline(job: JobPayload) -> anyhow::Result<PipelineContext> {
    let mut ctx = PipelineContext::new(job);

    download::download(&mut ctx).await?;
    transcode::transcode(&mut ctx).await?;
    metadata::process(&mut ctx).await?;
    encrypt::encrypt(&mut ctx).await?;
    upload::upload(&mut ctx).await?;

    Ok(ctx)
}
