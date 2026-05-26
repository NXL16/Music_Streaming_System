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
] as const;

const isPositiveInteger = (value: string): boolean => /^\d+$/.test(value);

export const validateEnv = (rawEnv: RawEnv): RawEnv => {
  const missing = REQUIRED_KEYS.filter((key) => !rawEnv[key]);

  if (missing.length > 0) {
    throw new Error(`Thiếu biến môi trường bắt buộc: ${missing.join(', ')}`);
  }

  if ((rawEnv.INTERNAL_GRPC_TOKEN as string).length < 32) {
    throw new Error('INTERNAL_GRPC_TOKEN phải có ít nhất 32 ký tự');
  }

  const apiPort = rawEnv.API_PORT as string;
  const redisPort = rawEnv.REDIS_PORT as string;
  const streamUrlTtlSec = rawEnv.STREAM_URL_TTL_SEC as string;

  if (!isPositiveInteger(apiPort)) {
    throw new Error('API_PORT phải là số nguyên dương');
  }

  if (!isPositiveInteger(redisPort)) {
    throw new Error('REDIS_PORT phải là số nguyên dương');
  }

  if (!isPositiveInteger(streamUrlTtlSec)) {
    throw new Error('STREAM_URL_TTL_SEC phải là số nguyên dương');
  }

  return rawEnv;
};
