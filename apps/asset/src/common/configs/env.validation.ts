const REQUIRED_ENV = [
  'DATABASE_URL',
  'ASSET_GRPC_URL',
  'R2_ENDPOINT',
  'R2_ACCESS_KEY',
  'R2_SECRET_KEY',
  'R2_BUCKET',
  'CDN_URL',
  'INTERNAL_GRPC_TOKEN',
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

  const workerEnabled = rawEnv.ASSET_WORKER_ENABLED;
  if (
    workerEnabled !== undefined &&
    !['true', 'false'].includes(workerEnabled.trim().toLowerCase())
  ) {
    throw new Error('ASSET_WORKER_ENABLED must be true or false');
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
