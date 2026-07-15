use crate::queue::job::JobPayload;
use anyhow::Result;
use aws_sdk_s3::Client;
use bytes::Bytes;
use futures_core::Stream;
use std::pin::Pin;
use std::sync::Arc;

pub type ByteStream = Pin<Box<dyn Stream<Item = Result<Bytes>> + Send>>;

pub struct PipelineContext {
    pub job: JobPayload,
    pub master_secret_key: Arc<Vec<u8>>,
    pub r2_client: Client,
    pub input_stream: Option<ByteStream>,
    pub source_size_bytes: Option<usize>,
    pub encrypted_size_bytes: Option<usize>,
    pub duration: Option<f64>,
    pub output_key: Option<String>,
}

impl PipelineContext {
    pub fn new(job: JobPayload, master_secret_key: Arc<Vec<u8>>, r2_client: Client) -> Self {
        Self {
            job,
            master_secret_key,
            r2_client,
            input_stream: None,
            source_size_bytes: None,
            encrypted_size_bytes: None,
            duration: None,
            output_key: None,
        }
    }
}
