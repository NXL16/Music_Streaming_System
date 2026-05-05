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
}

impl PipelineContext {
    pub fn new(job: JobPayload) -> Self {
        Self {
            job,
            input_stream: None,
            data: None,
            duration: None,
        }
    }
}
