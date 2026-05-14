type RawEnv = Record<string, string | undefined>;

const REQUIRED_KEYS = [
  'API_HOST',
  'API_PORT',
  'API_PREFIX',
  'CDN_SIGNING_KEY',
  'CDN_URL',
  'IDENTITY_GRPC_URL',
  'META_GRPC_URL',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_PASSWORD',
  'R2_ENDPOINT',
  'R2_ACCESS_KEY',
  'R2_SECRET_KEY',
  'R2_BUCKET',
] as const;

const isPositiveInteger = (value: string): boolean => /^\d+$/.test(value);

export const validateEnv = (rawEnv: RawEnv): RawEnv => {
  const missing = REQUIRED_KEYS.filter((key) => !rawEnv[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  const apiPort = rawEnv.API_PORT as string;
  const redisPort = rawEnv.REDIS_PORT as string;

  if (!isPositiveInteger(apiPort)) {
    throw new Error('Invalid API_PORT: expected a positive integer');
  }

  if (!isPositiveInteger(redisPort)) {
    throw new Error('Invalid REDIS_PORT: expected a positive integer');
  }

  return rawEnv;
};
