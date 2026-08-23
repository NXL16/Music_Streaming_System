interface Env {
  API_FINALIZE_URL: string;
  FINALIZER_INTERNAL_TOKEN: string;
  UPLOAD_EVENTS_DLQ: Queue<FinalizerDeadLetterEvent>;
}

type R2EventNotification = {
  account: string;
  action: string;
  bucket: string;
  object: {
    key: string;
    size: number;
    eTag: string;
  };
  eventTime: string;
};

type FinalizerDeadLetterEvent = {
  event: unknown;
  reason: string;
  status?: number;
  receivedAt: string;
};

const FINALIZE_TIMEOUT_MS = 10_000;

export default {
  async queue(
    batch: MessageBatch<unknown>,
    env: Env,
  ): Promise<void> {
    await Promise.all(
      batch.messages.map((message) => processMessage(message, env)),
    );
  },
};

async function processMessage(message: Message<unknown>, env: Env): Promise<void> {
  const event = parseR2Event(message.body);
  if (!event) {
    await deadLetterAndAck(message, env, 'invalid_r2_event');
    return;
  }

  const checksum = quarantineChecksum(event.object.key);
  if (!checksum) {
    log('info', 'finalizer_event_ignored', { key: event.object.key });
    message.ack();
    return;
  }

  if (!env.API_FINALIZE_URL || !env.FINALIZER_INTERNAL_TOKEN) {
    log('error', 'finalizer_configuration_missing', { checksum });
    message.retry();
    return;
  }

  let response: Response;
  try {
    response = await fetch(env.API_FINALIZE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-token': env.FINALIZER_INTERNAL_TOKEN,
      },
      body: JSON.stringify({ checksum }),
      signal: AbortSignal.timeout(FINALIZE_TIMEOUT_MS),
    });
  } catch (error) {
    log('warn', 'finalizer_retry_scheduled', {
      checksum,
      reason: errorMessage(error),
    });
    message.retry();
    return;
  }

  const responseStatus = response.status;
  await response.body?.cancel().catch(() => undefined);

  if (response.ok) {
    log('info', 'finalizer_completed', { checksum, status: responseStatus });
    message.ack();
    return;
  }

  if (isRetryableStatus(responseStatus)) {
    log('warn', 'finalizer_retry_scheduled', {
      checksum,
      status: responseStatus,
    });
    message.retry();
    return;
  }

  await deadLetterAndAck(message, env, 'permanent_finalize_response', responseStatus);
}

function parseR2Event(value: unknown): R2EventNotification | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as { object?: { key?: unknown } };
  if (typeof candidate.object?.key !== 'string') return undefined;
  return value as R2EventNotification;
}

function quarantineChecksum(key: string): string | undefined {
  const match = /^quarantine\/([^/]+)(?:\/|$)/.exec(key);
  return match?.[1] || undefined;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function deadLetterAndAck(
  message: Message<unknown>,
  env: Env,
  reason: string,
  status?: number,
): Promise<void> {
  await env.UPLOAD_EVENTS_DLQ.send({
    event: message.body,
    reason,
    status,
    receivedAt: new Date().toISOString(),
  });
  log('error', 'finalizer_dead_lettered', { reason, status });
  message.ack();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function log(
  level: 'error' | 'info' | 'warn',
  event: string,
  fields: Record<string, string | number | undefined>,
): void {
  console[level](JSON.stringify({ level, event, ...fields }));
}
