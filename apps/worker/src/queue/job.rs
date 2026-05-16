use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobPayload {
    pub song_id: String,
    #[serde(default)]
    pub file_url: Option<String>,
}
