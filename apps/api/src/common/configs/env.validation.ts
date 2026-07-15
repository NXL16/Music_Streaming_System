type RawEnv = Record<string, string | undefined>;

const REQUIRED_KEYS = [
  'API_HOST',
  'API_PORT',
  'API_PREFIX',
  'IDENTITY_GRPC_URL',
  'INTERNAL_GRPC_TOKEN',
  'META_GRPC_URL',
  'WALLET_GRPC_URL',
  'RECOMMENDATION_GRPC_URL',
  'ASSET_GRPC_URL',
  'WALLET_HTTP_URL',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_PASSWORD',
  'R2_ENDPOINT',
  'R2_ACCESS_KEY',
  'R2_SECRET_KEY',
  'R2_BUCKET',
  'FINALIZER_INTERNAL_TOKEN',
  'AUTH_REFRESH_COOKIE_MAX_AGE_DAYS',
  'MASTER_SECRET_KEY',
  'STREAM_WORKER_URL',
] as const;

const isPositiveInteger = (value: string): boolean => /^\d+$/.test(value);

export const validateEnv = (rawEnv: RawEnv): RawEnv => {
  const missing = REQUIRED_KEYS.filter((key) => !rawEnv[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if ((rawEnv.INTERNAL_GRPC_TOKEN as string).length < 32) {
    throw new Error('INTERNAL_GRPC_TOKEN must be at least 32 characters');
  }

  if ((rawEnv.FINALIZER_INTERNAL_TOKEN as string).length < 32) {
    throw new Error('FINALIZER_INTERNAL_TOKEN must be at least 32 characters');
  }

  const apiPort = rawEnv.API_PORT as string;
  const redisPort = rawEnv.REDIS_PORT as string;
  const refreshCookieMaxAgeDays = rawEnv.AUTH_REFRESH_COOKIE_MAX_AGE_DAYS as string;

  if (!isPositiveInteger(apiPort)) {
    throw new Error('API_PORT must be a positive integer');
  }

  if (!isPositiveInteger(redisPort)) {
    throw new Error('REDIS_PORT must be a positive integer');
  }

  if (!isPositiveInteger(refreshCookieMaxAgeDays)) {
    throw new Error('AUTH_REFRESH_COOKIE_MAX_AGE_DAYS must be a positive integer');
  }

  const masterSecretKey = rawEnv.MASTER_SECRET_KEY as string;
  if (masterSecretKey.length < 64 || masterSecretKey.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(masterSecretKey)) {
    throw new Error('MASTER_SECRET_KEY must be a hex string of at least 32 bytes (64 hex chars)');
  }

  return rawEnv;
};
