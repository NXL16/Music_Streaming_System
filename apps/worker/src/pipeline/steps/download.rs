use crate::pipeline::context::PipelineContext;
use anyhow::Context;
use bytes::Bytes;
use futures_util::stream::try_unfold;
use tokio::io::AsyncReadExt;

fn parse_max_source_size_bytes() -> usize {
    std::env::var("WORKER_MAX_SOURCE_SIZE_BYTES")
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(250 * 1024 * 1024)
}

pub async fn download(ctx: &mut PipelineContext) -> anyhow::Result<()> {
    let r2_path = &ctx.job.r2_path;
    let client = crate::r2::client::create_r2_client()
        .await
        .context("failed to initialize R2 client")?;
    let bucket = std::env::var("R2_BUCKET").context("R2_BUCKET env is not set")?;

    let object = client
        .get_object()
        .bucket(&bucket)
        .key(r2_path)
        .send()
        .await
        .with_context(|| format!("failed to download source file: key={r2_path}"))?;

    let max_size = parse_max_source_size_bytes();
    if let Some(content_len) = object.content_length() {
        if content_len > 0 && (content_len as usize) > max_size {
            return Err(anyhow::anyhow!(
                "source object too large: {} bytes > limit {} bytes",
                content_len,
                max_size
            ));
        }
        if content_len > 0 {
            ctx.source_size_bytes = Some(content_len as usize);
        }
    }

    let reader = object.body.into_async_read();
    let source = try_unfold(reader, |mut reader| async move {
        let mut buf = vec![0_u8; 64 * 1024];
        let n = reader
            .read(&mut buf)
            .await
            .map_err(|e| anyhow::anyhow!("R2 stream read error: {e}"))?;

        if n == 0 {
            return Ok(None);
        }

        buf.truncate(n);
        Ok(Some((Bytes::from(buf), reader)))
    });
    ctx.input_stream = Some(Box::pin(source));

    Ok(())
}
