use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct JobPayload {
    pub song_id: String,
    pub r2_path: String,
    pub checksum: String,
    pub file_url: Option<String>,
}