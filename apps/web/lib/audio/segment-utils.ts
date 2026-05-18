import type { StreamDataResponse } from "@/lib/api";

export function getSegmentIndexForTime(
  meta: StreamDataResponse,
  targetTimeSec: number,
): number {
  let targetSegmentIndex = 0;
  let tsAcc = 0;

  const targetTs = targetTimeSec * Math.max(1, meta.timescale);

  for (let i = 0; i < meta.segments.length; i += 1) {
    if (tsAcc <= targetTs) {
      targetSegmentIndex = i;
    } else {
      break;
    }

    tsAcc += meta.segments[i].duration;
  }

  return targetSegmentIndex;
}

export function getSegmentRange(
  meta: StreamDataResponse,
  index: number,
): { start: number; end: number } {
  if (index < 0 || index >= meta.segments.length) {
    const start = Math.max(0, meta.offset || meta.encryptionStartOffset);

    return {
      start,
      end: start,
    };
  }

  const segment = meta.segments[index];
  const start = segment.startByte;
  const end = start + Math.max(1, segment.size) - 1;

  return {
    start,
    end: Math.max(start, end),
  };
}
