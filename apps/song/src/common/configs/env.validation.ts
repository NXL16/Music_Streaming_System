type RawEnv = Record<string, string | undefined>;

const REQUIRED_KEYS = [
  'DATABASE_URL',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_PASSWORD',
  'R2_ENDPOINT',
  'R2_ACCESS_KEY',
  'R2_SECRET_KEY',
  'R2_BUCKET',
  'ASSET_GRPC_URL',
  'INTERNAL_GRPC_TOKEN',
] as const;

export function validateEnv(rawEnv: RawEnv): RawEnv {
  const missing = REQUIRED_KEYS.filter((key) => !rawEnv[key]?.trim());

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  if (!/^postgres(ql)?:\/\//.test(rawEnv.DATABASE_URL!)) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string');
  }

  const redisPort = Number(rawEnv.REDIS_PORT);
  if (!Number.isInteger(redisPort) || redisPort <= 0 || redisPort > 65535) {
    throw new Error('REDIS_PORT must be a valid TCP port');
  }

  if (rawEnv.INTERNAL_GRPC_TOKEN!.length < 32) {
    throw new Error('INTERNAL_GRPC_TOKEN must be at least 32 characters');
  }

  if (!/^[^:\s]+:\d{1,5}$/.test(rawEnv.ASSET_GRPC_URL!)) {
    throw new Error('ASSET_GRPC_URL must use host:port format');
  }

  return rawEnv;
}
