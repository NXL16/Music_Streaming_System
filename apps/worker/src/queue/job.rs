use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AudioMode {
    #[default]
    Standard,
    Sing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobPayload {
    #[serde(default)]
    pub job_id: Option<String>,
    pub song_id: String,
    pub r2_path: String,
    /// Monotonic version allocated transactionally by Song's transcode outbox.
    /// Missing versions are rejected instead of being derived from wall-clock time.
    #[serde(default)]
    pub metadata_version: i64,
    #[serde(default)]
    pub checksum: String,
    #[serde(default)]
    pub audio_mode: AudioMode,
}

impl JobPayload {
    pub fn requires_stem_separation(&self) -> bool {
        self.audio_mode == AudioMode::Sing
    }

    pub fn is_valid(&self) -> bool {
        if self.song_id.trim().is_empty()
            || self.r2_path.trim().is_empty()
            || self.metadata_version <= 0
        {
            return false;
        }

        self.job_id
            .as_deref()
            .map(|job_id| {
                !job_id.is_empty()
                    && job_id.len() <= 128
                    && job_id
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
            })
            .unwrap_or(true)
    }

    pub fn completed_key(&self) -> Option<String> {
        self.job_id
            .as_deref()
            .filter(|_| self.is_valid())
            .map(|job_id| {
                format!(
                    "worker:transcode:completed:{job_id}:{}",
                    self.metadata_version
                )
            })
    }
}

#[cfg(test)]
mod tests {
    use super::{AudioMode, JobPayload};

    #[test]
    fn rejects_job_without_authoritative_metadata_version() {
        let job: JobPayload =
            serde_json::from_str(r#"{"song_id":"song-1","r2_path":"quarantine/source.m4a"}"#)
                .expect("missing numeric fields default during deserialization");

        assert_eq!(job.audio_mode, AudioMode::Standard);
        assert!(!job.is_valid());
    }

    #[test]
    fn rejects_unknown_audio_mode() {
        let invalid = serde_json::from_str::<JobPayload>(
            r#"{"song_id":"song-1","r2_path":"quarantine/source.m4a","audio_mode":"UNKNOWN"}"#,
        );

        assert!(invalid.is_err());
    }

    #[test]
    fn rejects_empty_required_fields() {
        let job: JobPayload = serde_json::from_str(
            r#"{"job_id":"outbox-1","song_id":"","r2_path":"quarantine/source.m4a","metadata_version":1}"#,
        )
        .expect("payload shape must deserialize before validation");

        assert!(!job.is_valid());
    }

    #[test]
    fn creates_completed_key_for_valid_outbox_job() {
        let job: JobPayload = serde_json::from_str(
            r#"{"job_id":"outbox-1","song_id":"song-1","r2_path":"quarantine/source.m4a","metadata_version":7}"#,
        )
        .expect("payload must deserialize");

        assert_eq!(
            job.completed_key().as_deref(),
            Some("worker:transcode:completed:outbox-1:7")
        );
    }
}
