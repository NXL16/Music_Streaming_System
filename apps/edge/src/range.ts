export interface NormalizedRange {
  start: number;
  end: number;
  chunkIndex: number;
}

export const CHUNK_SIZE = 128 * 1024;

export function normalizeRange(rangeHeader: string | null): NormalizedRange {
  if (!rangeHeader) {
    return { start: 0, end: CHUNK_SIZE - 1, chunkIndex: 0 };
  }

  // Hỗ trợ cả 3 dạng: "bytes=123-456", "bytes=123-", "bytes=-500"
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);

  if (!match) {
    return { start: 0, end: CHUNK_SIZE - 1, chunkIndex: 0 };
  }

  const prefix = match[1]; // số trước dấu -
  const suffix = match[2]; // số sau dấu -

  // "bytes=-500" → lấy 500 byte cuối
  if (!prefix && suffix) {
    // Không biết file size ở đây, nên trả chunk 0
    // R2 sẽ tự cắt đúng range thực tế
    return { start: 0, end: CHUNK_SIZE - 1, chunkIndex: 0 };
  }

  // "bytes=123-456" hoặc "bytes=123-"
  const requestedStart = parseInt(prefix, 10) || 0;

  // Xác định chunkIndex chứa requestedStart
  const chunkIndex = Math.floor(requestedStart / CHUNK_SIZE);

  const start = chunkIndex * CHUNK_SIZE;
  const end = start + CHUNK_SIZE - 1;

  return { start, end, chunkIndex };
}
