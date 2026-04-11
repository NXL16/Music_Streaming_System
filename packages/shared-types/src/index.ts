// ==========================================
// CONSTANTS & TYPES
// ==========================================
export const UserRole = {
  USER: "user",
  ADMIN: "admin",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const SongStatus = {
  PROCESSING: "processing",
  READY: "ready",
  FAILED: "failed",
} as const;
export type SongStatus = (typeof SongStatus)[keyof typeof SongStatus];

export const QualityQuality = {
  Q128K: "128k",
  Q192K: "192k",
  Q320K: "320k",
} as const;
export type QualityQuality =
  (typeof QualityQuality)[keyof typeof QualityQuality];

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
    quality: QualityQuality;
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
