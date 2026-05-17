use crate::queue::job::JobPayload;
use bytes::Bytes;
use futures_core::Stream;
use std::pin::Pin;
use std::sync::Arc;

pub type ByteStream = Pin<Box<dyn Stream<Item = Result<Bytes, reqwest::Error>> + Send>>;

pub struct PipelineContext {
    pub job: JobPayload,
    pub master_secret_key: Arc<Vec<u8>>,
    pub input_stream: Option<ByteStream>,
    pub data: Option<Vec<u8>>,
    pub duration: Option<f64>,
    pub encryption_start_offset: Option<usize>,
    pub output_key: Option<String>,
}

impl PipelineContext {
    pub fn new(job: JobPayload, master_secret_key: Arc<Vec<u8>>) -> Self {
        Self {
            job,
            master_secret_key,
            input_stream: None,
            data: None,
            duration: None,
            encryption_start_offset: None,
            output_key: None,
        }
    }
}
