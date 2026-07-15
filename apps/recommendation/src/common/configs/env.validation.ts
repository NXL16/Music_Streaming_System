type RawEnv = Record<string, string | undefined>;

const REQUIRED_KEYS = [
  'RECOMMENDATION_GRPC_URL',
  'SONG_GRPC_URL',
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

  if (!/^postgres(ql)?:\/\//.test(rawEnv.DATABASE_URL!)) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string');
  }

  if (rawEnv.INTERNAL_GRPC_TOKEN!.length < 32) {
    throw new Error('INTERNAL_GRPC_TOKEN must be at least 32 characters');
  }

  return rawEnv;
}
