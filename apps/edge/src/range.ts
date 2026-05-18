export interface NormalizedRange {
  start: number;
  end: number;
  isSuffix: boolean;
  suffixLength: number;
  isValid: boolean;
}

export const CHUNK_SIZE = 128 * 1024;

function defaultRange(): NormalizedRange {
  return {
    start: 0,
    end: CHUNK_SIZE - 1,
    isSuffix: false,
    suffixLength: 0,
    isValid: true,
  };
}

export function normalizeRange(rangeHeader: string | null): NormalizedRange {
  if (!rangeHeader) return defaultRange();

  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return { ...defaultRange(), isValid: false };

  const prefix = match[1];
  const suffix = match[2];

  if (!prefix && suffix) {
    const suffixLength = Number.parseInt(suffix, 10);
    if (Number.isNaN(suffixLength) || suffixLength <= 0) {
      return { ...defaultRange(), isValid: false };
    }
    return {
      ...defaultRange(),
      isSuffix: true,
      suffixLength,
    };
  }

  const start = Number.parseInt(prefix, 10);
  if (Number.isNaN(start) || start < 0) return { ...defaultRange(), isValid: false };

  const end = suffix ? Number.parseInt(suffix, 10) : start + CHUNK_SIZE - 1;
  if (!Number.isNaN(end) && end < start) return { ...defaultRange(), isValid: false };

  return {
    start,
    end: Number.isNaN(end) ? start + CHUNK_SIZE - 1 : end,
    isSuffix: false,
    suffixLength: 0,
    isValid: true,
  };
}

export function resolveSuffixRange(
  range: NormalizedRange,
  fileSize: number,
): NormalizedRange {
  if (!range.isSuffix) return range;
  const start = Math.max(0, fileSize - range.suffixLength);
  return {
    start,
    end: fileSize - 1,
    isSuffix: false,
    suffixLength: 0,
    isValid: true,
  };
}
