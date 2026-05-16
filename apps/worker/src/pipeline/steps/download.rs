use crate::pipeline::context::PipelineContext;
use anyhow::Context;
use std::sync::OnceLock;

fn shared_http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .pool_idle_timeout(std::time::Duration::from_secs(30))
            .pool_max_idle_per_host(16)
            .timeout(std::time::Duration::from_secs(120))
            .tcp_keepalive(std::time::Duration::from_secs(30))
            .build()
            .expect("failed to build shared reqwest client")
    })
}

pub async fn download(ctx: &mut PipelineContext) -> anyhow::Result<()> {
    let file_url = ctx
        .job
        .file_url
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("missing file_url"))?;

    let res = shared_http_client()
        .get(file_url)
        .send()
        .await
        .context("failed to download source file")?;

    if !res.status().is_success() {
        return Err(anyhow::anyhow!(
            "source download failed with status {}",
            res.status()
        ));
    }

    ctx.input_stream = Some(Box::pin(res.bytes_stream()));

    Ok(())
}
