import { MAX_CACHE_SIZE } from "./audio-constants";
import { LRUCache } from "./lru-cache";

export const sharedInitCache = new LRUCache<string, ArrayBuffer>(20);
export const sharedSegmentCache = new LRUCache<string, ArrayBuffer>(
  MAX_CACHE_SIZE,
);

export function getInitCacheKey(
  songId: string,
  initStart: number,
  initEnd: number,
): string {
  return `${songId}:init:${initStart}-${initEnd}`;
}

export function getInitBufferKey(songId: string): string {
  return `${songId}:init-buffer`;
}

export function getSegmentCacheKey(
  songId: string,
  index: number,
  start: number,
  end: number,
): string {
  return `${songId}:seg:${index}:${start}-${end}`;
}
