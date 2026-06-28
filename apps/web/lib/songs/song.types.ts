export type SongStatus = 0 | 1 | 2 | 3 | 4;

export type SongSummary = {
  id: string;
  title: string;
  artist: string;
  album: string;
  isPublic: boolean;
  status: SongStatus;
  durationSec: number;
  createdAt: number;
  coverUrl: string;
};

export type SongDetail = {
  id: string;
  title: string;
  artist: string;
  album: string;
  uploaderId: string;
  isPublic: boolean;
  status: SongStatus;
  encryptedFilePath: string;
  durationSec: number;
  bitrateKbps: number;
  codec: string;
  format: string;
  createdAt: number;
  updatedAt: number;
};

export type ListSongsResponse = {
  songs: SongSummary[];
  nextCursor: string;
  hasMore: boolean;
};

export type RequestUploadPayload = {
  title: string;
  artist?: string;
  album?: string;
  isPublic?: boolean;
  checksum: string;
  size: number;
};

export type RequestUploadResponse = {
  songId: string;
  instant: boolean;
  uploadUrl: string;
  status?: "PROCESSING" | "RETRY_UPLOAD";
};

export type GetSongResponse = {
  song: SongDetail;
};

export type DeleteSongResponse = {
  success: boolean;
};
