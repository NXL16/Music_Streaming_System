use crate::pipeline::context::PipelineContext;
use anyhow::Context;
use aws_sdk_s3::error::ProvideErrorMetadata;
use bytes::Bytes;
use futures_util::stream::try_unfold;
use std::path::PathBuf;
use tokio::io::AsyncReadExt;
use tokio::io::AsyncWriteExt;

fn parse_max_source_size_bytes() -> usize {
    std::env::var("WORKER_MAX_SOURCE_SIZE_BYTES")
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(250 * 1024 * 1024)
}

pub async fn download(ctx: &mut PipelineContext) -> anyhow::Result<()> {
    let r2_path = &ctx.job.r2_path;
    let client = &ctx.r2_client;
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

pub async fn download_object_to_temp(
    client: &aws_sdk_s3::Client,
    key: &str,
    label: &str,
) -> anyhow::Result<PathBuf> {
    let bucket = std::env::var("R2_BUCKET").context("R2_BUCKET env is not set")?;
    let object = client
        .get_object()
        .bucket(bucket)
        .key(key)
        .send()
        .await
        .with_context(|| format!("failed to download stem: key={key}"))?;
    let max_size = parse_max_source_size_bytes();
    if let Some(content_len) = object.content_length()
        && content_len > 0
        && (content_len as usize) > max_size
    {
        return Err(anyhow::anyhow!(
            "stem object too large: {} bytes > limit {} bytes",
            content_len,
            max_size
        ));
    }

    let extension = if key.to_ascii_lowercase().ends_with(".flac") {
        "flac"
    } else {
        "m4a"
    };
    let path = std::env::temp_dir().join(format!("stem_{label}_{}.{extension}", uuid_suffix()));
    let mut output = tokio::fs::File::create(&path).await?;
    let mut reader = object.body.into_async_read();
    let mut buffer = vec![0_u8; 64 * 1024];
    let mut downloaded = 0_usize;
    loop {
        let read = reader.read(&mut buffer).await?;
        if read == 0 {
            break;
        }
        downloaded = downloaded.saturating_add(read);
        if downloaded > max_size {
            drop(output);
            let _ = tokio::fs::remove_file(&path).await;
            return Err(anyhow::anyhow!(
                "stem object exceeded limit while downloading: {} bytes > limit {} bytes",
                downloaded,
                max_size
            ));
        }
        output.write_all(&buffer[..read]).await?;
    }
    output.flush().await?;
    Ok(path)
}

pub async fn complete_staging_stem_keys(
    client: &aws_sdk_s3::Client,
    song_id: &str,
) -> anyhow::Result<Option<(String, String)>> {
    let bucket = std::env::var("R2_BUCKET").context("R2_BUCKET env is not set")?;
    for extension in ["flac", "m4a"] {
        let vocal_key = format!("staging/{song_id}/vocal.{extension}");
        let instrumental_key = format!("staging/{song_id}/instrumental.{extension}");
        let (vocal, instrumental) = tokio::join!(
            object_exists(client, &bucket, &vocal_key),
            object_exists(client, &bucket, &instrumental_key),
        );
        if vocal? && instrumental? {
            return Ok(Some((vocal_key, instrumental_key)));
        }
    }
    Ok(None)
}

async fn object_exists(
    client: &aws_sdk_s3::Client,
    bucket: &str,
    key: &str,
) -> anyhow::Result<bool> {
    match client.head_object().bucket(bucket).key(key).send().await {
        Ok(object) => Ok(object.content_length().unwrap_or_default() > 0),
        Err(error) => {
            let is_missing = error
                .as_service_error()
                .and_then(|service_error| service_error.code())
                .is_some_and(|code| matches!(code, "NotFound" | "NoSuchKey" | "404"));
            if is_missing {
                Ok(false)
            } else {
                Err(error).with_context(|| format!("failed to check staging stem: key={key}"))
            }
        }
    }
}

/// Remove staging assets only after their encrypted processed counterparts and
/// metadata have both been written. On a failed pipeline we deliberately keep
/// staging so the job can be retried without paying for separation again.
pub async fn delete_staging_objects(
    client: &aws_sdk_s3::Client,
    keys: &[String],
) -> anyhow::Result<()> {
    let bucket = std::env::var("R2_BUCKET").context("R2_BUCKET env is not set")?;
    for key in keys {
        client
            .delete_object()
            .bucket(&bucket)
            .key(key)
            .send()
            .await
            .with_context(|| format!("failed to delete staging stem: key={key}"))?;
    }
    Ok(())
}

/// Remove processed variants that were not generated by the successful
/// attempt. This is deliberately called only after all retained renditions
/// and their metadata have been written, so a failed reprocess never removes
/// the currently playable assets.
pub async fn delete_obsolete_processed_variants(
    client: &aws_sdk_s3::Client,
    song_id: &str,
    retained_variants: &[&str],
) -> anyhow::Result<()> {
    let bucket = std::env::var("R2_BUCKET").context("R2_BUCKET env is not set")?;
    let all_variants = [
        "",
        "high",
        "instrumental",
        "vocal",
        "instrumental-high",
        "vocal-high",
    ];
    for variant in all_variants {
        if retained_variants.contains(&variant) {
            continue;
        }
        let key = if variant.is_empty() {
            format!("processed/{song_id}.m4a")
        } else {
            format!("processed/{song_id}/{variant}.m4a")
        };
        client
            .delete_object()
            .bucket(&bucket)
            .key(&key)
            .send()
            .await
            .with_context(|| format!("failed to delete obsolete processed variant: key={key}"))?;
    }
    Ok(())
}

fn uuid_suffix() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos().to_string())
        .unwrap_or_else(|_| "0".to_string())
}
