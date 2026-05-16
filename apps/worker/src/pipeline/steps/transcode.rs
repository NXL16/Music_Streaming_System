use crate::pipeline::context::PipelineContext;
use crate::transcoder::ffmpeg::transcode_stream;

pub async fn transcode(ctx: &mut PipelineContext) -> anyhow::Result<()> {
    let input = ctx
        .input_stream
        .take()
        .ok_or_else(|| anyhow::anyhow!("Transcode step: no input stream found in context"))?;

    let (output, duration) = transcode_stream(input)
        .await
        .map_err(|e| anyhow::anyhow!("FFmpeg transcode failed: {e}"))?;

    if output.is_empty() {
        return Err(anyhow::anyhow!("Transcode step: output data is empty"));
    }

    ctx.data = Some(output);
    ctx.duration = Some(duration);

    Ok(())
}
