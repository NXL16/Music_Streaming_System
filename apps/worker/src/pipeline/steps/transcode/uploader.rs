use anyhow::Context;
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::types::{CompletedMultipartUpload, CompletedPart};
use bytes::{Bytes, BytesMut};
use futures_util::stream::{FuturesUnordered, StreamExt};
use std::env;
use tokio::task::JoinHandle;

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

fn parse_multipart_max_inflight() -> usize {
    env::var("WORKER_MULTIPART_MAX_INFLIGHT")
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .filter(|v| *v > 0)
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
    multipart_max_inflight: usize,
    buffer: BytesMut,
    multipart: Option<MultipartState>,
    pub uploaded_parts: u32,
    pub total_upload_retries: u32,
    pub used_single_put: bool,
    pub peak_inflight_parts: usize,
}

struct MultipartState {
    upload_id: String,
    next_part_number: i32,
    completed_parts: Vec<UploadedPart>,
    inflight: FuturesUnordered<JoinHandle<anyhow::Result<UploadedPartResult>>>,
}

struct UploadedPart {
    part_number: i32,
    etag: String,
}

struct UploadedPartResult {
    part_number: i32,
    etag: String,
    retries_used: u32,
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
            multipart_max_inflight: parse_multipart_max_inflight(),
            buffer: BytesMut::new(),
            multipart: None,
            uploaded_parts: 0,
            total_upload_retries: 0,
            used_single_put: false,
            peak_inflight_parts: 0,
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
                let part = self.buffer.split_to(self.part_size).freeze();
                self.enqueue_part_upload(part).await?;
            }
        }

        Ok(())
    }

    pub async fn finalize(&mut self) -> anyhow::Result<()> {
        if self.multipart.is_none() {
            let payload = self.buffer.split().freeze();
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
            let last = self.buffer.split().freeze();
            self.enqueue_part_upload(last).await?;
        }

        self.drain_inflight_uploads().await?;

        let state = self.multipart.as_ref().context("multipart state missing")?;
        let mut parts = state
            .completed_parts
            .iter()
            .map(|part| {
                CompletedPart::builder()
                    .part_number(part.part_number)
                    .e_tag(part.etag.clone())
                    .build()
            })
            .collect::<Vec<_>>();
        parts.sort_by_key(|part| part.part_number.unwrap_or_default());
        let completed = CompletedMultipartUpload::builder()
            .set_parts(Some(parts))
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
            completed_parts: Vec::new(),
            inflight: FuturesUnordered::new(),
        });

        Ok(())
    }

    async fn enqueue_part_upload(&mut self, part: Bytes) -> anyhow::Result<()> {
        while self.current_inflight_len() >= self.multipart_max_inflight {
            self.collect_one_upload_result().await?;
        }

        let state = self.multipart.as_mut().context("multipart state missing")?;
        let part_number = state.next_part_number;
        let upload_id = state.upload_id.clone();
        let client = self.client.clone();
        let bucket = self.bucket.clone();
        let key = self.key.clone();
        let max_retries = self.upload_part_max_retries;
        let backoff_base_ms = self.upload_part_backoff_base_ms;

        let task = tokio::spawn(async move {
            let mut attempt: u32 = 0;
            let mut retries_used: u32 = 0;
            let resp = loop {
                let result = client
                    .upload_part()
                    .bucket(&bucket)
                    .key(&key)
                    .upload_id(&upload_id)
                    .part_number(part_number)
                    .body(ByteStream::from(part.clone()))
                    .send()
                    .await;

                match result {
                    Ok(ok) => break ok,
                    Err(err) => {
                        attempt += 1;
                        if attempt > max_retries {
                            return Err(anyhow::anyhow!(
                                "upload_part failed for part {} after {} retries: {}",
                                part_number,
                                max_retries,
                                err
                            ));
                        }
                        retries_used += 1;
                        let backoff = backoff_base_ms
                            .saturating_mul(1u64 << (attempt - 1).min(10));
                        tokio::time::sleep(std::time::Duration::from_millis(backoff)).await;
                    }
                }
            };

            let etag = resp
                .e_tag()
                .map(ToOwned::to_owned)
                .context("missing e_tag from upload_part")?;

            Ok(UploadedPartResult {
                part_number,
                etag,
                retries_used,
            })
        });

        state.inflight.push(task);
        self.peak_inflight_parts = self.peak_inflight_parts.max(state.inflight.len());
        state.next_part_number += 1;

        Ok(())
    }

    fn current_inflight_len(&self) -> usize {
        self.multipart
            .as_ref()
            .map(|state| state.inflight.len())
            .unwrap_or(0)
    }

    async fn drain_inflight_uploads(&mut self) -> anyhow::Result<()> {
        while self.current_inflight_len() > 0 {
            self.collect_one_upload_result().await?;
        }
        Ok(())
    }

    async fn collect_one_upload_result(&mut self) -> anyhow::Result<()> {
        let state = self.multipart.as_mut().context("multipart state missing")?;
        let next = state
            .inflight
            .next()
            .await
            .context("multipart inflight task unexpectedly missing")?;
        let result = next.context("upload part task join failed")??;
        self.total_upload_retries += result.retries_used;
        self.uploaded_parts += 1;
        state.completed_parts.push(UploadedPart {
            part_number: result.part_number,
            etag: result.etag,
        });
        Ok(())
    }
}
