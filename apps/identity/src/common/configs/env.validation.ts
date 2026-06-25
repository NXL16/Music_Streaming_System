import ms, { StringValue } from 'ms';

type IdentityEnv = {
  DATABASE_URL: string;
  MONGODB_URI: string;
  REDIS_HOST: string;
  REDIS_PORT: string;
  REDIS_PASSWORD: string;
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  TWO_FACTOR_SECRET_KEY: string;
  INTERNAL_GRPC_TOKEN: string;
  IDENTITY_GRPC_URL: string;
  WALLET_GRPC_URL: string;
  JWT_ACCESS_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;
  RESEND_API_KEY: string;
  MAIL_FROM: string;
  PASSWORD_RESET_URL: string;
  EMAIL_VERIFICATION_URL: string;
  TOKEN_CLEANUP_INTERVAL_MINUTES?: string;
  RECOVERY_CODE_RETENTION_DAYS?: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_OAUTH_REDIRECT_URI: string;
  TWO_FACTOR_TRUST_DAYS_USER?: string;
  TWO_FACTOR_TRUST_DAYS_ADMIN?: string;
};

const REQUIRED_KEYS: Array<keyof IdentityEnv> = [
  'DATABASE_URL',
  'MONGODB_URI',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_PASSWORD',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'TWO_FACTOR_SECRET_KEY',
  'INTERNAL_GRPC_TOKEN',
  'IDENTITY_GRPC_URL',
  'WALLET_GRPC_URL',
  'JWT_ACCESS_EXPIRES_IN',
  'JWT_REFRESH_EXPIRES_IN',
  'RESEND_API_KEY',
  'MAIL_FROM',
  'PASSWORD_RESET_URL',
  'EMAIL_VERIFICATION_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_OAUTH_REDIRECT_URI',
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

  if (String(config.INTERNAL_GRPC_TOKEN).length < 32) {
    throw new Error('INTERNAL_GRPC_TOKEN phải có ít nhất 32 ký tự');
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

  for (const key of ['PASSWORD_RESET_URL', 'EMAIL_VERIFICATION_URL'] as const) {
    try {
      new URL(config[key] as string);
    } catch {
      throw new Error(`${key} phải là URL hợp lệ`);
    }
  }

  if (config.TOKEN_CLEANUP_INTERVAL_MINUTES !== undefined) {
    const minutes = Number(config.TOKEN_CLEANUP_INTERVAL_MINUTES);
    if (!Number.isInteger(minutes) || minutes <= 0) {
      throw new Error('TOKEN_CLEANUP_INTERVAL_MINUTES phải là số nguyên dương');
    }
  }

  if (config.RECOVERY_CODE_RETENTION_DAYS !== undefined) {
    const days = Number(config.RECOVERY_CODE_RETENTION_DAYS);
    if (!Number.isInteger(days) || days <= 0) {
      throw new Error('RECOVERY_CODE_RETENTION_DAYS phải là số nguyên dương');
    }
  }

  if (config.TWO_FACTOR_TRUST_DAYS_USER !== undefined) {
    const days = Number(config.TWO_FACTOR_TRUST_DAYS_USER);
    if (!Number.isInteger(days) || days <= 0) {
      throw new Error('TWO_FACTOR_TRUST_DAYS_USER phải là số nguyên dương');
    }
  }

  if (config.TWO_FACTOR_TRUST_DAYS_ADMIN !== undefined) {
    const days = Number(config.TWO_FACTOR_TRUST_DAYS_ADMIN);
    if (!Number.isInteger(days) || days <= 0) {
      throw new Error('TWO_FACTOR_TRUST_DAYS_ADMIN phải là số nguyên dương');
    }
  }

  return config as IdentityEnv;
}
