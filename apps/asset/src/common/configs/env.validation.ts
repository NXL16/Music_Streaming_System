const REQUIRED_ENV = [
  'DATABASE_URL',
  'ASSET_GRPC_URL',
  'R2_ENDPOINT',
  'R2_ACCESS_KEY',
  'R2_SECRET_KEY',
  'R2_BUCKET',
  'CDN_URL',
  'INTERNAL_GRPC_TOKEN',
  'ASSET_VIDEO_KEY_URI_BASE',
  'ASSET_VIDEO_KEY_ENCRYPTION_KEY',
] as const;

export function validateEnv(
  rawEnv: Record<string, string | undefined>,
): Record<string, string> {
  for (const key of REQUIRED_ENV) {
    if (!rawEnv[key]?.trim()) {
      throw new Error(`${key} is required`);
    }
  }

  if (!/^[^:\s]+:\d{1,5}$/.test(rawEnv.ASSET_GRPC_URL!)) {
    throw new Error('ASSET_GRPC_URL must use host:port format');
  }

  if (rawEnv.INTERNAL_GRPC_TOKEN!.length < 32) {
    throw new Error('INTERNAL_GRPC_TOKEN must be at least 32 characters');
  }

  try {
    new URL(rawEnv.ASSET_VIDEO_KEY_URI_BASE!);
  } catch {
    throw new Error('ASSET_VIDEO_KEY_URI_BASE must be an absolute URL');
  }
  if (!/^[0-9a-fA-F]{64}$/.test(rawEnv.ASSET_VIDEO_KEY_ENCRYPTION_KEY!)) {
    throw new Error('ASSET_VIDEO_KEY_ENCRYPTION_KEY must be exactly 32 bytes in hex');
  }

  const workerEnabled = rawEnv.ASSET_WORKER_ENABLED;
  if (
    workerEnabled !== undefined &&
    !['true', 'false'].includes(workerEnabled.trim().toLowerCase())
  ) {
    throw new Error('ASSET_WORKER_ENABLED must be true or false');
  }

  const artifactCleanupEnabled = rawEnv.ASSET_ARTIFACT_CLEANUP_ENABLED;
  if (
    artifactCleanupEnabled !== undefined &&
    !['true', 'false'].includes(artifactCleanupEnabled.trim().toLowerCase())
  ) {
    throw new Error('ASSET_ARTIFACT_CLEANUP_ENABLED must be true or false');
  }

  validatePositiveInteger(
    rawEnv,
    'ASSET_WORKER_POLL_INTERVAL_MS',
    100,
    60_000,
  );
  validatePositiveInteger(
    rawEnv,
    'ASSET_WORKER_LOCK_TTL_MS',
    30_000,
    24 * 60 * 60 * 1000,
  );
  validatePositiveInteger(rawEnv, 'ASSET_WORKER_MAX_ATTEMPTS', 1, 20);
  validatePositiveInteger(
    rawEnv,
    'ASSET_WORKER_METRICS_INTERVAL_MS',
    10_000,
    24 * 60 * 60 * 1000,
  );
  validatePositiveInteger(
    rawEnv,
    'ASSET_ARTIFACT_CLEANUP_POLL_INTERVAL_MS',
    1_000,
    24 * 60 * 60 * 1000,
  );
  validatePositiveInteger(
    rawEnv,
    'ASSET_ARTIFACT_CLEANUP_LOCK_TTL_MS',
    30_000,
    24 * 60 * 60 * 1000,
  );
  validatePositiveInteger(
    rawEnv,
    'ASSET_ARTIFACT_CLEANUP_RETRY_MAX_BACKOFF_MS',
    1_000,
    24 * 60 * 60 * 1000,
  );
  validatePositiveInteger(
    rawEnv,
    'ASSET_ARTIFACT_CLEANUP_METRICS_INTERVAL_MS',
    10_000,
    24 * 60 * 60 * 1000,
  );
  validatePositiveInteger(
    rawEnv,
    'ASSET_FAILED_ARTIFACT_RETENTION_MS',
    60 * 60 * 1000,
    90 * 24 * 60 * 60 * 1000,
  );
  validatePositiveInteger(
    rawEnv,
    'ASSET_ARTWORK_MAX_INPUT_PIXELS',
    1_000_000,
    80_000_000,
  );
  validatePositiveInteger(
    rawEnv,
    'ASSET_IMAGE_RENDITION_CONCURRENCY',
    1,
    4,
  );
  validatePositiveInteger(rawEnv, 'ASSET_VIDEO_UPLOAD_CONCURRENCY', 1, 16);
  validatePositiveInteger(
    rawEnv,
    'ASSET_VIDEO_HLS_SEGMENT_DURATION_SECONDS',
    2,
    10,
  );

  return rawEnv as Record<string, string>;
}

function validatePositiveInteger(
  rawEnv: Record<string, string | undefined>,
  key: string,
  minimum: number,
  maximum: number,
): void {
  const value = rawEnv[key];
  if (value === undefined) return;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${key} must be an integer from ${minimum} to ${maximum}`);
  }
}
