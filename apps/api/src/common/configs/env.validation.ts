type RawEnv = Record<string, string | undefined>;

const REQUIRED_KEYS = [
  'API_HOST',
  'API_PORT',
  'API_PREFIX',
  'MASTER_SIGNING_KEY',
  'STREAM_URL_TTL_SEC',
  'CDN_URL',
  'IDENTITY_GRPC_URL',
  'INTERNAL_GRPC_TOKEN',
  'META_GRPC_URL',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_PASSWORD',
  'R2_ENDPOINT',
  'R2_ACCESS_KEY',
  'R2_SECRET_KEY',
  'R2_BUCKET',
  'FINALIZER_INTERNAL_TOKEN',
  'AUTH_REFRESH_COOKIE_MAX_AGE_DAYS',
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
  const streamUrlTtlSec = rawEnv.STREAM_URL_TTL_SEC as string;
  const refreshCookieMaxAgeDays = rawEnv.AUTH_REFRESH_COOKIE_MAX_AGE_DAYS as string;

  if (!isPositiveInteger(apiPort)) {
    throw new Error('API_PORT must be a positive integer');
  }

  if (!isPositiveInteger(redisPort)) {
    throw new Error('REDIS_PORT must be a positive integer');
  }

  if (!isPositiveInteger(streamUrlTtlSec)) {
    throw new Error('STREAM_URL_TTL_SEC must be a positive integer');
  }

  if (!isPositiveInteger(refreshCookieMaxAgeDays)) {
    throw new Error('AUTH_REFRESH_COOKIE_MAX_AGE_DAYS must be a positive integer');
  }

  return rawEnv;
};
