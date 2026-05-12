// ─── Types ────────────────────────────────────────────────────────────────────

export interface NormalizedRange {
  start: number;
  end: number;
  chunkIndex: number;
  requestedStart: number;
  isSuffix: boolean;
  suffixLength: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const CHUNK_SIZE = 128 * 1024; // 128 KB

// ─── Helpers ──────────────────────────────────────────────────────────────────

function chunkBoundary(byteOffset: number): {
  start: number;
  end: number;
  chunkIndex: number;
} {
  const chunkIndex = Math.floor(byteOffset / CHUNK_SIZE);
  const start = chunkIndex * CHUNK_SIZE;
  const end = start + CHUNK_SIZE - 1;
  return { start, end, chunkIndex };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse Range header theo RFC 7233.
 *
 * "bytes=123-456" / "bytes=123-" → snap về chunk boundary chứa byte 123
 * "bytes=-500"                   → suffix range, resolve sau khi biết fileSize
 */
export function normalizeRange(rangeHeader: string | null): NormalizedRange {
  if (!rangeHeader) {
    return {
      start: 0,
      end: CHUNK_SIZE - 1,
      chunkIndex: 0,
      requestedStart: 0,
      isSuffix: false,
      suffixLength: 0,
    };
  }

  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) {
    return {
      start: 0,
      end: CHUNK_SIZE - 1,
      chunkIndex: 0,
      requestedStart: 0,
      isSuffix: false,
      suffixLength: 0,
    };
  }

  const prefix = match[1];
  const suffix = match[2];

  // Suffix range: "bytes=-500"
  if (!prefix && suffix) {
    const suffixLength = parseInt(suffix, 10);
    return {
      start: 0,
      end: CHUNK_SIZE - 1,
      chunkIndex: 0,
      requestedStart: 0,
      isSuffix: true,
      suffixLength: isNaN(suffixLength) ? CHUNK_SIZE : suffixLength,
    };
  }

  const requestedStart = parseInt(prefix, 10) || 0;
  const { start, end, chunkIndex } = chunkBoundary(requestedStart);
  return {
    start,
    end,
    chunkIndex,
    requestedStart,
    isSuffix: false,
    suffixLength: 0,
  };
}

/**
 * Resolve suffix range sau khi biết fileSize từ Content-Range của R2.
 */
export function resolveSuffixRange(
  range: NormalizedRange,
  fileSize: number,
): NormalizedRange {
  if (!range.isSuffix) return range;
  const requestedStart = Math.max(0, fileSize - range.suffixLength);
  const { start, end, chunkIndex } = chunkBoundary(requestedStart);
  return {
    start,
    end,
    chunkIndex,
    requestedStart,
    isSuffix: false,
    suffixLength: 0,
  };
}
