use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobPayload {
    pub song_id: String,
    pub r2_path: String,
    #[serde(default)]
    pub checksum: String,
}
