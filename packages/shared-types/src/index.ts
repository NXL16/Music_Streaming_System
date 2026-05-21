// ==========================================
//                  REDIS
// ==========================================
export const TRANSCODE_QUEUE = "transcode_queue" as const;
export const SONG_COMPLETION_QUEUE = "song_completion_queue" as const;

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
  ADMIN: "ADMIN",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const SongStatus = {
  PROCESSING: "processing",
  READY: "ready",
  FAILED: "failed",
} as const;
export type SongStatus = (typeof SongStatus)[keyof typeof SongStatus];

export const AudioQuality = {
  Q128K: "128k",
  Q192K: "192k",
  Q320K: "320k",
} as const;
export type AudioQuality = (typeof AudioQuality)[keyof typeof AudioQuality];

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

export interface AuthSessionTokens {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
}

export interface AuthUserSummary {
  sub: string;
  username: string;
  email?: string;
  displayName?: string;
  role: UserRole;
}

export interface AuthSessionData extends AuthSessionTokens {
  user?: AuthUserSummary;
  expiresIn?: number;
}

export interface ApiEnvelope<T = unknown> {
  data?: T;
  message?: string | string[];
}

export interface AuthRefreshApiResponse {
  data?: Partial<AuthSessionTokens>;
}

export interface KmsGenerateKeyRequest {
  song_id: string;
  user_id: string;
}

export interface KmsGetKeyRequest {
  song_id: string;
  user_id: string;
  device_fingerprint: string;
}

export interface KmsGenerateKeyResponse {
  key_id: string;
  key: Uint8Array;
  iv: Uint8Array;
}

export interface KmsGetKeyResponse {
  key: Uint8Array;
  iv: Uint8Array;
}

export interface HttpExceptionResponseBody {
  message: string[] | string;
  code?: string;
  error?: string;
  statusCode?: number;
}

// ==========================================
// INTERFACES (Dựa theo MongoDB Schema)
// ==========================================

export interface IUser {
  _id: string;
  username: string;
  email: string;
  displayName: string;
  avatar: string | null;
  bio: string;
  role: UserRole;
  isActive: boolean;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  stats: {
    totalPlays: number;
    totalPlaytime: number;
    totalPlaylistsCreated: number;
    totalFollowers: number;
  };
  createdAt: Date;
  lastLoginAt: Date | null;
  updatedAt: Date;
}

export interface ISong {
  _id: string;
  title: string;
  artistId: string; // Ref to Artist
  album: string;
  duration: number;
  genre: string;
  releaseDate: Date | null;
  description: string;
  lyrics: string;

  // HLS & Streaming
  hlsMasterPath: string | null;
  hlsKeyId: string | null;
  hlsIV: string | null;
  isEncrypted: boolean;

  bitrates: {
    quality: AudioQuality;
    path: string;
    bandwidth: number;
    avgSegmentSize: number;
    segmentCount: number;
  }[];

  blurHash: string | null;
  waveform: number[];
  thumbnails: {
    small: string | null;
    medium: string | null;
    large: string | null;
  };

  checksum: string;
  fileSize: number;
  originalFormat: string | null;

  status: SongStatus;
  processingLog: string | null;

  metrics: {
    playCount: number;
    likeCount: number;
    shareCount: number;
    skipCount: number;
  };

  isPublic: boolean;
  uploadedBy: string; // Ref to User

  createdAt: Date;
  updatedAt: Date;
}

export interface IPlaylist {
  _id: string;
  userId: string; // Ref to User
  name: string;
  description: string;
  songIds: string[]; // Array of Song Refs
  thumbnail: string | null;
  isPublic: boolean;
  metrics: {
    totalDuration: number;
    songCount: number;
    followerCount: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// JOB QUEUE PAYLOADS (BullMQ)
// ==========================================
export interface ITranscodeJob {
  songId: string;
  originalFilePath: string;
  uploadedBy: string;
  format: string; // mp3, flac, wav
  checksum: string;
}

export interface ITranscodeResult {
  success: true;
  songId: string;
  duration: number;
  hlsMasterPath: string;
  hlsKeyId: string;
  coverUrl: string | null;
}
