type RawEnv = Record<string, string | undefined>;

const REQUIRED_KEYS = [
  'MONGODB_URI',
  'API_HOST',
  'API_PORT',
  'API_PREFIX',
  'JWT_ACCESS_SECRET',
  'JWT_ACCESS_EXPIRES_IN',
  'JWT_REFRESH_SECRET',
  'JWT_REFRESH_EXPIRES_IN',
  'REDIS_HOST',
  'REDIS_PORT',
] as const;

const isPositiveInteger = (value: string): boolean => /^\d+$/.test(value);

const hasTimeUnit = (value: string): boolean => /^\d+[smhd]$/.test(value);

export const validateEnv = (rawEnv: RawEnv): RawEnv => {
  const missing = REQUIRED_KEYS.filter((key) => !rawEnv[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const apiPort = rawEnv.API_PORT as string;
  const redisPort = rawEnv.REDIS_PORT as string;

  if (!isPositiveInteger(apiPort)) {
    throw new Error('Invalid API_PORT: expected a positive integer');
  }

  if (!isPositiveInteger(redisPort)) {
    throw new Error('Invalid REDIS_PORT: expected a positive integer');
  }

  const accessExpiresIn = rawEnv.JWT_ACCESS_EXPIRES_IN as string;
  const refreshExpiresIn = rawEnv.JWT_REFRESH_EXPIRES_IN as string;

  if (!hasTimeUnit(accessExpiresIn)) {
    throw new Error(
      'Invalid JWT_ACCESS_EXPIRES_IN: expected format like 15m, 7d, 30s, 1h',
    );
  }

  if (!hasTimeUnit(refreshExpiresIn)) {
    throw new Error(
      'Invalid JWT_REFRESH_EXPIRES_IN: expected format like 15m, 7d, 30s, 1h',
    );
  }

  return rawEnv;
};