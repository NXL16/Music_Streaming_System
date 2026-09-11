import { http } from '@/lib/api/http';

const QUEUEABLE_RESOURCE_TYPES = new Set([
  'songs',
  'albums',
  'playlists',
  'stations',
]);

/**
 * Queueing must feel instant. This is intentionally fire-and-forget: playback
 * is already updated locally and a telemetry failure must never undo it.
 */
export function recordQueueIntent(resourceType: string, resourceId: string) {
  if (!QUEUEABLE_RESOURCE_TYPES.has(resourceType) || !resourceId) return;

  void http
    .post('/me/recommendations/queue-intent', { resourceType, resourceId })
    .catch(() => undefined);
}
