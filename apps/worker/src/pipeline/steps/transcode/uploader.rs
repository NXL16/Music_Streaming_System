use anyhow::Context;
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::types::{CompletedMultipartUpload, CompletedPart};
use std::env;

const MIN_MULTIPART_PART_SIZE: usize = 5 * 1024 * 1024;

fn parse_part_size_bytes() -> usize {
    env::var("WORKER_UPLOAD_PART_SIZE_BYTES")
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .filter(|v| *v >= MIN_MULTIPART_PART_SIZE)
        .unwrap_or(8 * 1024 * 1024)
}

fn parse_single_put_threshold_bytes() -> usize {
    env::var("WORKER_SINGLE_PUT_THRESHOLD_BYTES")
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(MIN_MULTIPART_PART_SIZE)
}

fn parse_upload_part_max_retries() -> u32 {
    env::var("WORKER_UPLOAD_PART_MAX_RETRIES")
        .ok()
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(3)
}

fn parse_upload_part_backoff_base_ms() -> u64 {
    env::var("WORKER_UPLOAD_PART_BACKOFF_BASE_MS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(120)
}

fn parse_put_object_max_retries() -> u32 {
    env::var("WORKER_PUT_OBJECT_MAX_RETRIES")
        .ok()
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(3)
}

pub struct HybridUploader {
    client: aws_sdk_s3::Client,
    bucket: String,
    key: String,
    part_size: usize,
    single_put_threshold: usize,
    upload_part_max_retries: u32,
    upload_part_backoff_base_ms: u64,
    put_object_max_retries: u32,
    buffer: Vec<u8>,
    multipart: Option<MultipartState>,
    pub uploaded_parts: u32,
    pub total_upload_retries: u32,
    pub used_single_put: bool,
}

struct MultipartState {
    upload_id: String,
    next_part_number: i32,
    parts: Vec<CompletedPart>,
}

impl HybridUploader {
    pub fn new(client: aws_sdk_s3::Client, bucket: String, key: String) -> Self {
        Self {
            client,
            bucket,
            key,
            part_size: parse_part_size_bytes(),
            single_put_threshold: parse_single_put_threshold_bytes(),
            upload_part_max_retries: parse_upload_part_max_retries(),
            upload_part_backoff_base_ms: parse_upload_part_backoff_base_ms(),
            put_object_max_retries: parse_put_object_max_retries(),
            buffer: Vec::new(),
            multipart: None,
            uploaded_parts: 0,
            total_upload_retries: 0,
            used_single_put: false,
        }
    }

    pub async fn push_chunk(&mut self, chunk: &[u8]) -> anyhow::Result<()> {
        if chunk.is_empty() {
            return Ok(());
        }
        self.buffer.extend_from_slice(chunk);

        if self.multipart.is_none() && self.buffer.len() > self.single_put_threshold {
            self.start_multipart().await?;
        }

        if self.multipart.is_some() {
            while self.buffer.len() >= self.part_size {
                let part = self.buffer.drain(..self.part_size).collect::<Vec<u8>>();
                self.upload_part(part).await?;
            }
        }

        Ok(())
    }

    pub async fn finalize(&mut self) -> anyhow::Result<()> {
        if self.multipart.is_none() {
            let payload = std::mem::take(&mut self.buffer);
            let mut attempt: u32 = 0;
            loop {
                let result = self
                    .client
                    .put_object()
                    .bucket(&self.bucket)
                    .key(&self.key)
                    .body(ByteStream::from(payload.clone()))
                    .content_type("audio/mp4")
                    .cache_control("public, max-age=31536000, immutable")
                    .send()
                    .await;
                match result {
                    Ok(_) => break,
                    Err(err) => {
                        attempt += 1;
                        if attempt > self.put_object_max_retries {
                            return Err(anyhow::anyhow!(
                                "put_object failed after {} retries: {}",
                                self.put_object_max_retries,
                                err
                            ));
                        }
                        self.total_upload_retries += 1;
                        let backoff = self
                            .upload_part_backoff_base_ms
                            .saturating_mul(1u64 << (attempt - 1).min(10));
                        tokio::time::sleep(std::time::Duration::from_millis(backoff)).await;
                    }
                }
            }
            self.used_single_put = true;
            return Ok(());
        }

        if !self.buffer.is_empty() {
            let last = std::mem::take(&mut self.buffer);
            self.upload_part(last).await?;
        }

        let state = self.multipart.as_ref().context("multipart state missing")?;
        let completed = CompletedMultipartUpload::builder()
            .set_parts(Some(state.parts.clone()))
            .build();

        self.client
            .complete_multipart_upload()
            .bucket(&self.bucket)
            .key(&self.key)
            .upload_id(&state.upload_id)
            .multipart_upload(completed)
            .send()
            .await
            .context("complete_multipart_upload failed")?;

        Ok(())
    }

    pub async fn abort(&mut self) {
        if let Some(state) = &self.multipart {
            let _ = self
                .client
                .abort_multipart_upload()
                .bucket(&self.bucket)
                .key(&self.key)
                .upload_id(&state.upload_id)
                .send()
                .await;
        }
    }

    async fn start_multipart(&mut self) -> anyhow::Result<()> {
        let resp = self
            .client
            .create_multipart_upload()
            .bucket(&self.bucket)
            .key(&self.key)
            .content_type("audio/mp4")
            .cache_control("public, max-age=31536000, immutable")
            .send()
            .await
            .context("create_multipart_upload failed")?;

        let upload_id = resp
            .upload_id()
            .map(ToOwned::to_owned)
            .context("missing upload_id from create_multipart_upload")?;

        self.multipart = Some(MultipartState {
            upload_id,
            next_part_number: 1,
            parts: Vec::new(),
        });

        Ok(())
    }

    async fn upload_part(&mut self, part: Vec<u8>) -> anyhow::Result<()> {
        let state = self.multipart.as_mut().context("multipart state missing")?;
        let part_number = state.next_part_number;
        let upload_id = state.upload_id.clone();
        let mut attempt: u32 = 0;
        let resp = loop {
            let result = self
                .client
                .upload_part()
                .bucket(&self.bucket)
                .key(&self.key)
                .upload_id(&upload_id)
                .part_number(part_number)
                .body(ByteStream::from(part.clone()))
                .send()
                .await;

            match result {
                Ok(ok) => break ok,
                Err(err) => {
                    attempt += 1;
                    if attempt > self.upload_part_max_retries {
                        return Err(anyhow::anyhow!(
                            "upload_part failed for part {} after {} retries: {}",
                            part_number,
                            self.upload_part_max_retries,
                            err
                        ));
                    }
                    self.total_upload_retries += 1;
                    let backoff = self
                        .upload_part_backoff_base_ms
                        .saturating_mul(1u64 << (attempt - 1).min(10));
                    tokio::time::sleep(std::time::Duration::from_millis(backoff)).await;
                }
            }
        };

        let etag = resp
            .e_tag()
            .map(ToOwned::to_owned)
            .context("missing e_tag from upload_part")?;

        state.parts.push(
            CompletedPart::builder()
                .part_number(part_number)
                .e_tag(etag)
                .build(),
        );
        state.next_part_number += 1;
        self.uploaded_parts += 1;

        Ok(())
    }
}
