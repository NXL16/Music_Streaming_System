type RawEnv = Record<string, string | undefined>;

const REQUIRED_KEYS = [
  'RECOMMENDATION_GRPC_URL',
  'SONG_GRPC_URL',
  'ASSET_GRPC_URL',
  'DATABASE_URL',
  'INTERNAL_GRPC_TOKEN',
] as const;

export function validateEnv(rawEnv: RawEnv): RawEnv {
  const missing = REQUIRED_KEYS.filter((key) => !rawEnv[key]?.trim());

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  if (!/^[^:\s]+:\d{1,5}$/.test(rawEnv.RECOMMENDATION_GRPC_URL!)) {
    throw new Error('RECOMMENDATION_GRPC_URL must use host:port format');
  }

  if (!/^[^:\s]+:\d{1,5}$/.test(rawEnv.SONG_GRPC_URL!)) {
    throw new Error('SONG_GRPC_URL must use host:port format');
  }

  if (!/^[^:\s]+:\d{1,5}$/.test(rawEnv.ASSET_GRPC_URL!)) {
    throw new Error('ASSET_GRPC_URL must use host:port format');
  }

  if (!/^postgres(ql)?:\/\//.test(rawEnv.DATABASE_URL!)) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string');
  }

  if (rawEnv.INTERNAL_GRPC_TOKEN!.length < 32) {
    throw new Error('INTERNAL_GRPC_TOKEN must be at least 32 characters');
  }

  const leaseTtl = optionalDuration(
    rawEnv.RECOMMENDATION_GENERATION_LEASE_TTL_MS,
    'RECOMMENDATION_GENERATION_LEASE_TTL_MS',
  );
  const leaseRenewInterval = optionalDuration(
    rawEnv.RECOMMENDATION_GENERATION_LEASE_RENEW_INTERVAL_MS,
    'RECOMMENDATION_GENERATION_LEASE_RENEW_INTERVAL_MS',
  );
  if (leaseTtl && leaseRenewInterval && leaseRenewInterval > leaseTtl / 2) {
    throw new Error(
      'RECOMMENDATION_GENERATION_LEASE_RENEW_INTERVAL_MS must not exceed half of RECOMMENDATION_GENERATION_LEASE_TTL_MS',
    );
  }

  return rawEnv;
}

function optionalDuration(
  value: string | undefined,
  key: string,
): number | null {
  if (value === undefined || value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 60_000 || parsed > 3_600_000) {
    throw new Error(`${key} must be an integer between 60000 and 3600000`);
  }
  return parsed;
}
