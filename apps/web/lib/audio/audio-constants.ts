export const MIME_TYPE = 'audio/mp4; codecs="mp4a.40.2"';

export const BUFFER_AHEAD_SECONDS = 8;
export const MAX_PENDING_CHUNKS = 6;
export const SEGMENTS_PER_REQUEST = 10;
export const STARTUP_SEGMENTS_PER_REQUEST = 3;
export const MAX_INFLIGHT_FETCHES = 2;
export const MAX_CACHE_SIZE = 1000;
export const SEEK_PREFETCH_SEGMENTS = 4;
export const BACKGROUND_PRELOAD_SEGMENTS_PER_REQUEST = 8;
export const BACKGROUND_PRELOAD_DELAY_MS = 6000;

export const SOURCE_BUFFER_REMOVE_BEHIND_SECONDS = 15;
export const SEEK_SNAP_TOLERANCE = 0.05;
export const UNSTALL_OFFSET_SECONDS = 0.05;
