import ms, { StringValue } from 'ms';

type IdentityEnv = {
  DATABASE_URL: string;
  MONGODB_URI: string;
  REDIS_HOST: string;
  REDIS_PORT: string;
  REDIS_PASSWORD: string;
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ACCESS_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;
};

const REQUIRED_KEYS: Array<keyof IdentityEnv> = [
  'DATABASE_URL',
  'MONGODB_URI',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_PASSWORD',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_ACCESS_EXPIRES_IN',
  'JWT_REFRESH_EXPIRES_IN',
];

export function validateEnv(config: Record<string, unknown>): IdentityEnv {
  for (const key of REQUIRED_KEYS) {
    if (typeof config[key] !== 'string' || !config[key]?.toString().trim()) {
      throw new Error(`Thiếu biến môi trường bắt buộc: ${key}`);
    }
  }

  const redisPort = Number(config.REDIS_PORT);
  if (!Number.isInteger(redisPort) || redisPort <= 0 || redisPort > 65535) {
    throw new Error('REDIS_PORT phải là cổng TCP hợp lệ');
  }

  if (config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET) {
    throw new Error('JWT_ACCESS_SECRET và JWT_REFRESH_SECRET phải khác nhau');
  }

  const accessTtlMs = ms(config.JWT_ACCESS_EXPIRES_IN as StringValue);
  const refreshTtlMs = ms(config.JWT_REFRESH_EXPIRES_IN as StringValue);

  if (!Number.isFinite(accessTtlMs) || accessTtlMs <= 0) {
    throw new Error(
      'JWT_ACCESS_EXPIRES_IN phải là thời lượng hợp lệ và lớn hơn 0',
    );
  }

  if (!Number.isFinite(refreshTtlMs) || refreshTtlMs <= 0) {
    throw new Error(
      'JWT_REFRESH_EXPIRES_IN phải là thời lượng hợp lệ và lớn hơn 0',
    );
  }

  if (refreshTtlMs <= accessTtlMs) {
    throw new Error(
      'JWT_REFRESH_EXPIRES_IN phải lớn hơn JWT_ACCESS_EXPIRES_IN',
    );
  }

  return config as IdentityEnv;
}
