use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

#[derive(Default)]
pub struct RuntimeMetrics {
    pub jobs_started: AtomicU64,
    pub jobs_succeeded: AtomicU64,
    pub jobs_failed: AtomicU64,
    pub retries_total: AtomicU64,
    pub jobs_reclaimed: AtomicU64,
    pub jobs_dead_lettered: AtomicU64,
}

impl RuntimeMetrics {
    pub fn shared() -> Arc<Self> {
        Arc::new(Self::default())
    }

    pub fn snapshot(&self) -> (u64, u64, u64, u64, u64, u64) {
        (
            self.jobs_started.load(Ordering::Relaxed),
            self.jobs_succeeded.load(Ordering::Relaxed),
            self.jobs_failed.load(Ordering::Relaxed),
            self.retries_total.load(Ordering::Relaxed),
            self.jobs_reclaimed.load(Ordering::Relaxed),
            self.jobs_dead_lettered.load(Ordering::Relaxed),
        )
    }
}
