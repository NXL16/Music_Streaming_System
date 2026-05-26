import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function buildOtpAuthUrl(
  issuer: string,
  accountName: string,
  secret: string,
): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });

  return `otpauth://totp/${label}?${params.toString()}`;
}

export function verifyTotpCode(secret: string, code: string): boolean {
  return verifyTotpCodeWithCounter(secret, code) !== null;
}

export function verifyTotpCodeWithCounter(
  secret: string,
  code: string,
): number | null {
  const normalizedCode = code.trim();
  if (!/^\d{6}$/.test(normalizedCode)) return null;

  const nowCounter = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);

  for (let offset = -1; offset <= 1; offset += 1) {
    const counter = nowCounter + offset;
    const expectedCode = generateTotpCode(secret, counter);
    const expected = Buffer.from(expectedCode);
    const actual = Buffer.from(normalizedCode);

    if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
      return counter;
    }
  }

  return null;
}

export function encryptSecret(secret: string, keyMaterial: string): string {
  const key = createHash('sha256').update(keyMaterial).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptSecret(payload: string, keyMaterial: string): string {
  const [ivRaw, tagRaw, encryptedRaw] = payload.split('.');
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error('Dữ liệu bảo mật 2FA không hợp lệ');
  }

  const key = createHash('sha256').update(keyMaterial).digest();
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivRaw, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function generateTotpCode(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(secret: string): Buffer {
  const normalized = secret.replace(/=+$/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Secret 2FA không hợp lệ');

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}
