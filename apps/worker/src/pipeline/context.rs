use crate::queue::job::JobPayload;
use bytes::Bytes;
use futures_core::Stream;
use std::pin::Pin;

pub type ByteStream = Pin<Box<dyn Stream<Item = Result<Bytes, reqwest::Error>> + Send>>;

pub struct PipelineContext {
    pub job: JobPayload,
    pub input_stream: Option<ByteStream>,
    pub data: Option<Vec<u8>>,
    pub duration: Option<f64>,
    pub encryption_start_offset: Option<usize>,
    pub output_key: Option<String>,
    pub encryption_key: Option<Vec<u8>>,
    pub encryption_iv: Option<Vec<u8>>,
}

impl PipelineContext {
    pub fn new(job: JobPayload) -> Self {
        Self {
            job,
            input_stream: None,
            data: None,
            duration: None,
            encryption_start_offset: None,
            output_key: None,
            encryption_key: None,
            encryption_iv: None,
        }
    }
}
