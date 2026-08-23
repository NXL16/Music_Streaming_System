use crate::config::Config;
use crate::job::handler::handle;
use crate::observability::log::log_event;
use crate::observability::metrics::RuntimeMetrics;
use crate::queue::job::JobPayload;
use crate::redis::SongCompletionEvent;
use aws_sdk_s3::Client as R2Client;
use redis::Value;
use redis::streams::{
    StreamClaimReply, StreamPendingCountReply, StreamReadOptions, StreamReadReply,
};
use redis::{AsyncCommands, FromRedisValue};
use std::sync::Arc;
use std::sync::atomic::Ordering;
use tokio::sync::{Semaphore, mpsc};
use tokio::time::{Duration, sleep};

const TRANSCODE_JOB_DEDUPE_TTL_SECONDS: u64 = 7 * 24 * 60 * 60;

struct TerminalFailure<'a> {
    message_id: &'a str,
    payload: &'a str,
    song_id: &'a str,
    metadata_version: i64,
    error: &'a str,
    deliveries: u64,
}

pub struct Consumer {
    client: redis::Client,
    publisher_conn: redis::aio::ConnectionManager,
    r2_client: R2Client,
    queue_name: String,
    max_concurrency: usize,
    job_max_retries: u32,
    retry_backoff_ms: u64,
    stream_claim_idle_ms: u64,
    stream_max_deliveries: u64,
    master_secret_key: Arc<Vec<u8>>,
    metrics: Arc<RuntimeMetrics>,
}

impl Consumer {
    pub async fn new(config: &Config, metrics: Arc<RuntimeMetrics>) -> anyhow::Result<Self> {
        let client = redis::Client::open(config.redis_url.as_str())?;
        // Shared, auto-reconnecting connection for completion publishing and
        // stream acknowledgements. Blocking reads use a dedicated connection.
        let publisher_conn = redis::aio::ConnectionManager::new(client.clone()).await?;
        let r2_client = crate::r2::client::create_r2_client().await?;
        Ok(Self {
            client,
            publisher_conn,
            r2_client,
            queue_name: config.queue_name.clone(),
            max_concurrency: config.max_concurrency,
            job_max_retries: config.job_max_retries,
            retry_backoff_ms: config.retry_backoff_ms,
            stream_claim_idle_ms: config.stream_claim_idle_ms,
            stream_max_deliveries: config.stream_max_deliveries,
            master_secret_key: Arc::new(config.master_secret_key.clone()),
            metrics,
        })
    }

    pub async fn run(&self) -> anyhow::Result<()> {
        let mut conn = self.client.get_async_connection().await?;
        let group = "transcode-workers";
        let consumer_host = std::env::var("HOSTNAME")
            .or_else(|_| std::env::var("COMPUTERNAME"))
            .unwrap_or_else(|_| "unknown-host".to_string());
        let consumer = format!("worker-{consumer_host}-{}", std::process::id());
        let created: Result<String, redis::RedisError> = redis::cmd("XGROUP")
            .arg("CREATE")
            .arg(&self.queue_name)
            .arg(group)
            .arg("0")
            .arg("MKSTREAM")
            .query_async(&mut conn)
            .await;
        if let Err(error) = created
            && !error.to_string().contains("BUSYGROUP")
        {
            return Err(error.into());
        }
        let concurrency = Arc::new(Semaphore::new(self.max_concurrency));
        let mut metric_tick = tokio::time::interval(Duration::from_secs(30));
        let mut next_claim_at = tokio::time::Instant::now();
        let mut claim_cursor = "0-0".to_string();
        let (retry_tx, mut retry_rx) = mpsc::channel::<(String, String)>(self.max_concurrency);
        let mut shutdown = Box::pin(tokio::signal::ctrl_c());
        let mut stopping = false;

        loop {
            if stopping {
                if concurrency.available_permits() == self.max_concurrency {
                    log_event("info", "worker_shutdown_complete", &[]);
                    break;
                }
                sleep(Duration::from_millis(200)).await;
                continue;
            }

            // Reclaim uses an independent connection: the main connection is
            // reserved for the blocking XREADGROUP call below. Scan on a
            // bounded cadence so idle workers do not create a connection/sec.
            let reclaimed = if tokio::time::Instant::now() >= next_claim_at {
                next_claim_at = tokio::time::Instant::now() + Duration::from_secs(30);
                let (next_cursor, reclaimed) =
                    self.claim_stale(group, &consumer, &claim_cursor).await?;
                claim_cursor = next_cursor;
                reclaimed
            } else {
                None
            };
            if reclaimed.is_some() {
                self.metrics.jobs_reclaimed.fetch_add(1, Ordering::Relaxed);
                log_event(
                    "warn",
                    "stream_entry_reclaimed",
                    &[("queue", self.queue_name.clone())],
                );
            }
            let scheduled_retry = retry_rx.try_recv().ok();
            let (message_id, job_str) = match reclaimed.or(scheduled_retry) {
                Some(entry) => entry,
                None => {
                    let stream_keys = [self.queue_name.as_str()];
                    let read_options = StreamReadOptions::default()
                        .group(group, &consumer)
                        .block(1000)
                        .count(1);
                    let read_fut = conn.xread_options::<_, _, Option<StreamReadReply>>(
                        &stream_keys,
                        &[">"],
                        &read_options,
                    );
                    let popped: Result<Option<StreamReadReply>, redis::RedisError> = tokio::select! {
                        _ = &mut shutdown => {
                            stopping = true;
                            log_event("warn", "worker_shutdown_requested", &[]);
                            continue;
                        }
                        _ = metric_tick.tick() => {
                            let (started, ok, failed, retries, reclaimed, dlq) = self.metrics.snapshot();
                            log_event(
                                "info",
                                "worker_metrics",
                                &[
                                    ("jobs_started", started.to_string()),
                                    ("jobs_succeeded", ok.to_string()),
                                    ("jobs_failed", failed.to_string()),
                                    ("retries_total", retries.to_string()),
                                    ("jobs_reclaimed_total", reclaimed.to_string()),
                                    ("jobs_dead_lettered_total", dlq.to_string()),
                                ],
                            );
                            continue;
                        }
                        res = read_fut => res,
                    };
                    match popped {
                        Ok(Some(reply)) => {
                            let Some(entry) = reply.keys.first().and_then(|key| key.ids.first())
                            else {
                                continue;
                            };
                            let payload = entry
                                .map
                                .get("payload")
                                .and_then(|value| String::from_redis_value(value).ok())
                                .unwrap_or_default();
                            (entry.id.clone(), payload)
                        }
                        Ok(None) => continue,
                        Err(err) => {
                            let msg = err.to_string();
                            log_event("error", "redis_xreadgroup_error", &[("error", msg)]);
                            sleep(Duration::from_secs(1)).await;
                            conn = self.client.get_async_connection().await?;
                            continue;
                        }
                    }
                }
            };

            let job: JobPayload = match serde_json::from_str(&job_str) {
                Ok(job) => job,
                Err(err) => {
                    self.move_to_dlq(
                        group,
                        &message_id,
                        &job_str,
                        &format!("invalid job payload: {err}"),
                        0,
                    )
                    .await?;
                    self.metrics
                        .jobs_dead_lettered
                        .fetch_add(1, Ordering::Relaxed);
                    log_event(
                        "error",
                        "job_dead_lettered",
                        &[("reason", "invalid_payload".to_string())],
                    );
                    continue;
                }
            };
            if !job.is_valid() {
                self.move_to_dlq(
                    group,
                    &message_id,
                    &job_str,
                    "invalid job payload fields",
                    0,
                )
                .await?;
                self.metrics
                    .jobs_dead_lettered
                    .fetch_add(1, Ordering::Relaxed);
                log_event(
                    "error",
                    "job_dead_lettered",
                    &[("reason", "invalid_payload_fields".to_string())],
                );
                continue;
            }

            let completed_key = job.completed_key();
            if let Some(key) = &completed_key {
                let mut dedupe_conn = self.publisher_conn.clone();
                let completed: redis::RedisResult<Option<String>> = dedupe_conn.get(key).await;
                match completed {
                    Ok(Some(_)) => {
                        let _: i32 = dedupe_conn
                            .xack(&self.queue_name, group, std::slice::from_ref(&message_id))
                            .await
                            .unwrap_or(0);
                        log_event(
                            "info",
                            "job_duplicate_acknowledged",
                            &[("job_id", job.job_id.clone().unwrap_or_default())],
                        );
                        continue;
                    }
                    Ok(None) => {}
                    Err(error) => log_event(
                        "warn",
                        "job_dedupe_check_failed",
                        &[("error", error.to_string())],
                    ),
                }
            }

            let permit = concurrency.clone().acquire_owned().await?;
            let retries = self.job_max_retries;
            let backoff_ms = self.retry_backoff_ms;
            let master_secret_key = Arc::clone(&self.master_secret_key);
            let metrics = Arc::clone(&self.metrics);
            let r2_client = self.r2_client.clone();
            let publisher_conn = self.publisher_conn.clone();
            let mut ack_conn = self.publisher_conn.clone();
            let queue_name = self.queue_name.clone();
            let message_id = message_id.clone();
            let completed_key = completed_key.clone();
            let max_deliveries = self.stream_max_deliveries;
            let retry_tx = retry_tx.clone();
            let retry_consumer = consumer.clone();
            let metadata_version = job.metadata_version;
            metrics.jobs_started.fetch_add(1, Ordering::Relaxed);

            tokio::spawn(async move {
                let _permit = permit;
                let song_id = job.song_id.clone();
                if let Err(err) = process_with_retry(
                    job,
                    retries,
                    backoff_ms,
                    master_secret_key,
                    r2_client,
                    publisher_conn,
                    Arc::clone(&metrics),
                )
                .await
                {
                    metrics.jobs_failed.fetch_add(1, Ordering::Relaxed);
                    let failure_message = err.to_string();
                    log_event(
                        "error",
                        // The pipeline exhausted its in-process attempts. The
                        // stream entry can still be retried or dead-lettered
                        // below based on its durable Redis delivery count.
                        "job_processing_attempts_exhausted",
                        &[
                            ("song_id", song_id.clone()),
                            ("error", failure_message.clone()),
                        ],
                    );
                    match pending_deliveries(&mut ack_conn, &queue_name, group, &message_id).await {
                        Ok(deliveries) if deliveries >= max_deliveries => {
                            if let Err(dlq_error) = publish_terminal_failure_and_move_to_dlq(
                                &mut ack_conn,
                                &queue_name,
                                group,
                                TerminalFailure {
                                    message_id: &message_id,
                                    payload: &job_str,
                                    song_id: &song_id,
                                    metadata_version,
                                    error: &failure_message,
                                    deliveries,
                                },
                            )
                            .await
                            {
                                log_event(
                                    "error",
                                    "job_dead_letter_failed",
                                    &[("song_id", song_id), ("error", dlq_error.to_string())],
                                );
                            } else {
                                metrics.jobs_dead_lettered.fetch_add(1, Ordering::Relaxed);
                                log_event(
                                    "error",
                                    "job_dead_lettered",
                                    &[("song_id", song_id), ("deliveries", deliveries.to_string())],
                                );
                            }
                        }
                        Ok(deliveries) => {
                            let delay_ms = 1_000_u64
                                .saturating_mul(1_u64 << deliveries.saturating_sub(1).min(5));
                            log_event(
                                "warn",
                                "job_retry_scheduled",
                                &[
                                    ("song_id", song_id.clone()),
                                    ("deliveries", deliveries.to_string()),
                                    ("max_deliveries", max_deliveries.to_string()),
                                    ("delay_ms", delay_ms.to_string()),
                                ],
                            );
                            sleep(Duration::from_millis(delay_ms)).await;
                            match claim_for_retry(
                                &mut ack_conn,
                                &queue_name,
                                group,
                                &retry_consumer,
                                &message_id,
                            )
                            .await
                            {
                                Ok(Some(entry)) => {
                                    // A normal XCLAIM increments the PEL delivery
                                    // count. Retrying solely through an in-memory
                                    // channel would leave that count unchanged and
                                    // could bypass the configured DLQ limit.
                                    match retry_tx.try_send(entry) {
                                        Ok(()) => {
                                            metrics.retries_total.fetch_add(1, Ordering::Relaxed);
                                        }
                                        Err(mpsc::error::TrySendError::Full(_)) => {
                                            // Keep the entry in the PEL. The reclaim
                                            // pass will pick it up later instead of
                                            // allowing an unbounded local retry queue.
                                            log_event(
                                                "warn",
                                                "job_retry_deferred",
                                                &[("song_id", song_id.clone())],
                                            );
                                        }
                                        Err(mpsc::error::TrySendError::Closed(_)) => {
                                            log_event("warn", "job_retry_cancelled", &[]);
                                        }
                                    }
                                }
                                Ok(None) => log_event(
                                    "warn",
                                    "job_retry_not_pending",
                                    &[("song_id", song_id.clone())],
                                ),
                                Err(retry_error) => log_event(
                                    "error",
                                    "job_retry_claim_failed",
                                    &[
                                        ("song_id", song_id.clone()),
                                        ("error", retry_error.to_string()),
                                    ],
                                ),
                            }
                        }
                        Err(count_error) => log_event(
                            "error",
                            "stream_pending_count_failed",
                            &[("song_id", song_id), ("error", count_error.to_string())],
                        ),
                    }
                } else {
                    metrics.jobs_succeeded.fetch_add(1, Ordering::Relaxed);
                    if let Some(key) = completed_key {
                        let marked: redis::RedisResult<String> = redis::cmd("SET")
                            .arg(&key)
                            .arg("1")
                            .arg("EX")
                            .arg(TRANSCODE_JOB_DEDUPE_TTL_SECONDS)
                            .query_async(&mut ack_conn)
                            .await;
                        if let Err(error) = marked {
                            log_event(
                                "warn",
                                "job_dedupe_mark_failed",
                                &[("error", error.to_string())],
                            );
                        }
                    }
                    let _: i32 = ack_conn
                        .xack(&queue_name, group, &[message_id])
                        .await
                        .unwrap_or(0);
                }
            });
        }

        Ok(())
    }
}

impl Consumer {
    async fn claim_stale(
        &self,
        group: &str,
        consumer: &str,
        start: &str,
    ) -> anyhow::Result<(String, Option<(String, String)>)> {
        let mut conn = self.client.get_async_connection().await?;
        let reply: Value = redis::cmd("XAUTOCLAIM")
            .arg(&self.queue_name)
            .arg(group)
            .arg(consumer)
            .arg(self.stream_claim_idle_ms)
            .arg(start)
            .arg("COUNT")
            .arg(1)
            .arg("JUSTID")
            .query_async(&mut conn)
            .await?;
        let (next_cursor, ids) = auto_claim_just_id_reply(reply)?;
        let Some(id) = ids.into_iter().next() else {
            return Ok((next_cursor, None));
        };
        // JUSTID deliberately avoids incrementing Redis' delivery counter.
        // Claim the recovered entry normally before executing it so repeated
        // crash recovery also contributes to the durable DLQ threshold.
        let entries: StreamClaimReply = redis::cmd("XCLAIM")
            .arg(&self.queue_name)
            .arg(group)
            .arg(consumer)
            .arg(0)
            .arg(&id)
            .query_async(&mut conn)
            .await?;
        Ok((next_cursor, claimed_entry_payload(entries)))
    }

    async fn move_to_dlq(
        &self,
        group: &str,
        message_id: &str,
        payload: &str,
        error: &str,
        deliveries: u64,
    ) -> anyhow::Result<()> {
        move_to_dlq(
            &mut self.publisher_conn.clone(),
            &self.queue_name,
            group,
            message_id,
            payload,
            error,
            deliveries,
        )
        .await
    }
}

fn auto_claim_just_id_reply(reply: Value) -> anyhow::Result<(String, Vec<String>)> {
    let Value::Bulk(parts) = reply else {
        anyhow::bail!("Redis XAUTOCLAIM reply must be an array");
    };
    let cursor = parts
        .first()
        .ok_or_else(|| anyhow::anyhow!("Redis XAUTOCLAIM reply is missing its cursor"))?;
    let ids = parts
        .get(1)
        .ok_or_else(|| anyhow::anyhow!("Redis XAUTOCLAIM reply is missing claimed IDs"))?;

    // Redis 7 adds a third list of deleted IDs; older compatible responses
    // contain only cursor and claimed IDs. Reclaim needs only those two.
    Ok((
        String::from_redis_value(cursor)?,
        Vec::<String>::from_redis_value(ids)?,
    ))
}

async fn claim_for_retry(
    conn: &mut redis::aio::ConnectionManager,
    queue: &str,
    group: &str,
    consumer: &str,
    message_id: &str,
) -> anyhow::Result<Option<(String, String)>> {
    let entries: StreamClaimReply = redis::cmd("XCLAIM")
        .arg(queue)
        .arg(group)
        .arg(consumer)
        .arg(0)
        .arg(message_id)
        .query_async(conn)
        .await?;
    Ok(claimed_entry_payload(entries))
}

fn claimed_entry_payload(entries: StreamClaimReply) -> Option<(String, String)> {
    let entry = entries.ids.into_iter().next()?;
    let payload = entry.get::<String>("payload").unwrap_or_default();
    Some((entry.id, payload))
}

async fn pending_deliveries(
    conn: &mut redis::aio::ConnectionManager,
    queue: &str,
    group: &str,
    message_id: &str,
) -> anyhow::Result<u64> {
    // XPENDING with an ID range returns a nested array of PEL entries.  Decode
    // it through Redis' stream type rather than a tuple: tuple decoding treats
    // the reply as a flat bulk response and fails before retry/DLQ can run.
    let reply: StreamPendingCountReply = redis::cmd("XPENDING")
        .arg(queue)
        .arg(group)
        .arg(message_id)
        .arg(message_id)
        .arg(1)
        .query_async(conn)
        .await?;
    Ok(pending_delivery_count(reply))
}

fn pending_delivery_count(reply: StreamPendingCountReply) -> u64 {
    reply
        .ids
        .first()
        .map(|entry| entry.times_delivered as u64)
        .unwrap_or(0)
}

async fn move_to_dlq(
    conn: &mut redis::aio::ConnectionManager,
    queue: &str,
    group: &str,
    message_id: &str,
    payload: &str,
    error: &str,
    deliveries: u64,
) -> anyhow::Result<()> {
    let dlq = format!("{queue}:dlq");
    let _: Vec<Value> = redis::pipe()
        .atomic()
        .cmd("XADD")
        .arg(&dlq)
        .arg("*")
        .arg("payload")
        .arg(payload)
        .arg("source_stream")
        .arg(queue)
        .arg("source_id")
        .arg(message_id)
        .arg("deliveries")
        .arg(deliveries)
        .arg("error")
        .arg(error)
        .cmd("XACK")
        .arg(queue)
        .arg(group)
        .arg(message_id)
        .query_async(conn)
        .await?;
    Ok(())
}

async fn publish_terminal_failure_and_move_to_dlq(
    conn: &mut redis::aio::ConnectionManager,
    queue: &str,
    group: &str,
    failure: TerminalFailure<'_>,
) -> anyhow::Result<()> {
    let completion = serde_json::to_string(&terminal_failure_completion(
        failure.song_id,
        failure.metadata_version,
        failure.error,
    ))?;
    let dlq = format!("{queue}:dlq");
    let _: Vec<Value> = redis::pipe()
        .atomic()
        // A terminal Song state and source ACK must not diverge. If this
        // transaction cannot commit, the PEL entry remains retryable.
        .cmd("XADD")
        .arg("song_completion_queue")
        .arg("*")
        .arg("payload")
        .arg(&completion)
        .cmd("XADD")
        .arg(&dlq)
        .arg("*")
        .arg("payload")
        .arg(failure.payload)
        .arg("source_stream")
        .arg(queue)
        .arg("source_id")
        .arg(failure.message_id)
        .arg("deliveries")
        .arg(failure.deliveries)
        .arg("error")
        .arg(failure.error)
        .cmd("XACK")
        .arg(queue)
        .arg(group)
        .arg(failure.message_id)
        .query_async(conn)
        .await?;
    Ok(())
}

fn terminal_failure_completion(
    song_id: &str,
    metadata_version: i64,
    error: &str,
) -> SongCompletionEvent {
    SongCompletionEvent {
        song_id: song_id.to_string(),
        metadata_version,
        status: "error".to_string(),
        duration_sec: None,
        encrypted_file_path: None,
        bitrate_kbps: None,
        codec: None,
        format: None,
        mood_tags: None,
        mood_analysis_version: None,
        mood_analysis_scores: None,
        error_message: Some(error.to_string()),
    }
}

async fn process_with_retry(
    job: JobPayload,
    max_retries: u32,
    retry_backoff_ms: u64,
    master_secret_key: Arc<Vec<u8>>,
    r2_client: R2Client,
    publisher_conn: redis::aio::ConnectionManager,
    metrics: Arc<RuntimeMetrics>,
) -> anyhow::Result<()> {
    let total_attempts = max_retries.saturating_add(1);

    for attempt in 1..=total_attempts {
        match handle(
            job.clone(),
            Arc::clone(&master_secret_key),
            r2_client.clone(),
            publisher_conn.clone(),
        )
        .await
        {
            Ok(_) => return Ok(()),
            Err(err) => {
                if attempt == total_attempts {
                    return Err(err);
                }
                metrics.retries_total.fetch_add(1, Ordering::Relaxed);

                let exponent = (attempt - 1).min(20);
                let multiplier = 1u64 << exponent;
                let delay = retry_backoff_ms.saturating_mul(multiplier);
                sleep(Duration::from_millis(delay)).await;
            }
        }
    }

    Err(anyhow::anyhow!("Unexpected retry loop termination"))
}

#[cfg(test)]
mod tests {
    use super::{
        auto_claim_just_id_reply, claimed_entry_payload, pending_delivery_count,
        terminal_failure_completion,
    };
    use redis::streams::{StreamClaimReply, StreamPendingCountReply};
    use redis::{FromRedisValue, Value};

    #[test]
    fn extracts_payload_from_a_claimed_stream_entry() {
        let entry = claimed_entry_payload(stream_claim_reply(&[
            ("ignored", "value"),
            ("payload", "job"),
        ]));

        assert_eq!(entry, Some(("1-0".to_string(), "job".to_string())));
    }

    #[test]
    fn keeps_an_entry_without_a_payload_for_dead_letter_handling() {
        let entry = claimed_entry_payload(stream_claim_reply(&[]));

        assert_eq!(entry, Some(("1-0".to_string(), String::new())));
    }

    #[test]
    fn terminal_failure_completion_is_not_emitted_until_the_dlq_path() {
        let event = terminal_failure_completion("song-1", 7, "pipeline failed");

        assert_eq!(event.song_id, "song-1");
        assert_eq!(event.metadata_version, 7);
        assert_eq!(event.status, "error");
        assert_eq!(event.error_message.as_deref(), Some("pipeline failed"));
    }

    #[test]
    fn reads_delivery_count_from_the_xpending_detail_reply_shape() {
        let reply =
            StreamPendingCountReply::from_redis_value(&Value::Bulk(vec![Value::Bulk(vec![
                Value::Data(b"1787413692748-0".to_vec()),
                Value::Data(b"worker-unknown-host-26184".to_vec()),
                Value::Int(234_626),
                Value::Int(1),
            ])]))
            .expect("Redis XPENDING detail reply should parse");

        assert_eq!(pending_delivery_count(reply), 1);
    }

    #[test]
    fn reads_xautoclaim_justid_replies_with_or_without_deleted_ids() {
        let two_part_reply = Value::Bulk(vec![
            Value::Data(b"2-0".to_vec()),
            Value::Bulk(vec![Value::Data(b"1-0".to_vec())]),
        ]);
        let three_part_reply = Value::Bulk(vec![
            Value::Data(b"0-0".to_vec()),
            Value::Bulk(vec![]),
            Value::Bulk(vec![Value::Data(b"deleted-1".to_vec())]),
        ]);

        assert_eq!(
            auto_claim_just_id_reply(two_part_reply).expect("two-part reply should parse"),
            ("2-0".to_string(), vec!["1-0".to_string()]),
        );
        assert_eq!(
            auto_claim_just_id_reply(three_part_reply).expect("three-part reply should parse"),
            ("0-0".to_string(), Vec::new()),
        );
    }

    fn stream_claim_reply(fields: &[(&str, &str)]) -> StreamClaimReply {
        let mut values = Vec::with_capacity(fields.len() * 2);
        for (field, value) in fields {
            values.push(Value::Data(field.as_bytes().to_vec()));
            values.push(Value::Data(value.as_bytes().to_vec()));
        }
        StreamClaimReply::from_redis_value(&Value::Bulk(vec![Value::Bulk(vec![
            Value::Data(b"1-0".to_vec()),
            Value::Bulk(values),
        ])]))
        .expect("Redis XCLAIM flat field list should parse")
    }
}
