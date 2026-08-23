import { preloadCache } from "./mse/preload-cache";

const MSE_PREFIX = "mse:";

type PlaybackTarget = {
  id: string;
  playbackUrl?: string;
};

function getSongId(target: PlaybackTarget): string | null {
  return target.playbackUrl?.startsWith(MSE_PREFIX) ? target.id : null;
}

/**
 * Event handlers for a track's primary play control. Hover/focus waits briefly
 * before downloading; pointer-down starts immediately so touch users benefit
 * without speculative list-wide preloading.
 */
export function playbackIntentProps(target: PlaybackTarget) {
  const songId = getSongId(target);
  if (!songId) return {};

  return {
    onPointerEnter: () => preloadCache.scheduleIntent(songId),
    onPointerLeave: () => preloadCache.cancelIntent(songId),
    onFocus: () => preloadCache.scheduleIntent(songId),
    onBlur: () => preloadCache.cancelIntent(songId),
    onPointerDown: () => preloadCache.warmImmediately(songId),
  };
}
