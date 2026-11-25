export const AUTH_USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;
export const AUTH_DISPLAY_NAME_MAX_LENGTH = 50;
export const AUTH_TWO_FACTOR_CODE_PATTERN = /^\d{6}$/;
export const AUTH_RECOVERY_CODE_PATTERN = /^[A-Za-z0-9-]{16,24}$/;
export const AUTH_TWO_FACTOR_CHALLENGE_TTL_SECONDS = 300;
export const AUTH_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const AUTH_PASSWORD_CHARACTER_PATTERNS = {
  lowercase: /[a-z]/,
  uppercase: /[A-Z]/,
  number: /\d/,
  symbol: /[@$!%*?&]/,
};
export const AUTH_PASSWORD_PATTERN = new RegExp(
  `^${Object.values(AUTH_PASSWORD_CHARACTER_PATTERNS)
    .map((pattern) => `(?=.*${pattern.source})`)
    .join("")}.+$`,
);
