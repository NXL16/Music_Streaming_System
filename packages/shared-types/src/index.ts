// ==========================================
//                  REDIS
// ==========================================
export const TRANSCODE_QUEUE = "transcode_queue" as const;
export const SONG_COMPLETION_QUEUE = "song_completion_queue" as const;
export const SONG_ASSET_CLEANUP_QUEUE = "song_asset_cleanup_queue" as const;

export const authRefreshKey = (userId: string, deviceId: string): string =>
  `auth:refresh:${userId}:${deviceId}`;

export const authDevicesKey = (userId: string): string =>
  `auth:devices:${userId}`;

export const authAccessBlacklistKey = (jti: string): string =>
  `auth:blacklist:${jti}`;

export const authStateKey = (userId: string): string => `auth:state:${userId}`;

export const songCompletionProcessedKey = (songId: string): string =>
  `song_completion_processed:${songId}`;

export const songCompletionLockKey = (songId: string): string =>
  `song_completion_lock:${songId}`;

// ==========================================
// CONSTANTS & TYPES
// ==========================================
export const UserRole = {
  USER: "USER",
  ARTIST: "ARTIST",
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN_USER_OPS: "ADMIN_USER_OPS",
  ADMIN_SECURITY_OPS: "ADMIN_SECURITY_OPS",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export interface JwtUser {
  userId: string;
  username: string;
  role: UserRole;
  deviceId: string;
  tokenVersion: number;
  jti: string;
  exp: number;
}

export interface JwtPayload {
  sub: string;
  username: string;
  role: UserRole;
  deviceId: string;
  tokenVersion: number;
  jti: string;
  exp: number;
}

export interface HttpExceptionResponseBody {
  message: string[] | string;
  code?: string;
  error?: string;
  statusCode?: number;
}

export interface SessionState {
  deviceId: string;
  ipAddress?: string;
  userAgent?: string;
  lastSeenAt: number;
}

export interface AuthState {
  isActive: boolean;
  role: UserRole;
  tokenVersion: number;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
}
