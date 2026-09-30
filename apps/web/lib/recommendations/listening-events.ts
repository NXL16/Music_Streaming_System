import { http } from "@/lib/api/http";
import type { MediaCardProps } from "@/components/media/media-card.types";
import { prependRecentlyPlayedSnapshot } from "./recently-played-snapshot";
import { invalidateRecommendationSectionCache } from "./recommendation.api";
import { RECENTLY_PLAYED_SHELF_ID } from "./recently-played-presentation";
import { useAuthStore } from "@/lib/auth/auth-store";

export type ListeningEventType =
  | "PLAY_START"
  | "PLAY_COMPLETE"
  | "PLAY_STOPPED"
  | "SKIP";
export const RECENTLY_PLAYED_ITEM_EVENT = "recently-played:item";
export const RECENTLY_PLAYED_ITEM_REJECTED_EVENT =
  "recently-played:item-rejected";
const RECENTLY_PLAYED_SYNC_CHANNEL = "recently-played";
const LISTENING_EVENT_OUTBOX_KEY = "listening-event-outbox:v1";
const MAX_QUEUED_LISTENING_EVENTS = 20;
const recentlyPlayedSyncChannel =
  typeof window !== "undefined" && "BroadcastChannel" in window
    ? new BroadcastChannel(RECENTLY_PLAYED_SYNC_CHANNEL)
    : null;

type RecentlyPlayedSyncMessage = {
  userId: string;
  item: MediaCardProps;
};

function publishRecentlyPlayedItem(item: MediaCardProps) {
  prependRecentlyPlayedSnapshot(item);
  window.dispatchEvent(
    new CustomEvent<MediaCardProps>(RECENTLY_PLAYED_ITEM_EVENT, {
      detail: item,
    }),
  );
}

if (recentlyPlayedSyncChannel) {
  recentlyPlayedSyncChannel.onmessage = (
    event: MessageEvent<RecentlyPlayedSyncMessage>,
  ) => {
    const message = event.data;
    if (
      !message?.item ||
      !message.userId ||
      useAuthStore.getState().user?.userId !== message.userId
    ) {
      return;
    }
    publishRecentlyPlayedItem(message.item);
  };
}

export type ListeningEventPayload = {
  songId: string;
  eventType: ListeningEventType;
  durationSec?: number;
  totalSec?: number;
  songTitle?: string;
  artistName?: string;
  albumName?: string;
  albumId?: string;
  playlistId?: string;
  playlistName?: string;
  playlistCuratorName?: string;
  playlistArtworkUrl?: string;
  playlistArtworkBgColor?: string;
  stationId?: string;
  stationName?: string;
  stationArtworkUrl?: string;
  stationArtworkBgColor?: string;
  /** Stable across delivery retries for one telemetry event. */
  eventId?: string;
  recentlyPlayedItem?: MediaCardProps;
};

type QueuedListeningEvent = {
  userId: string;
  payload: ListeningEventPayload;
};

function telemetrySeconds(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value ?? 0)) : 0;
}

/**
 * This is deliberately applied at the delivery boundary as well as in the
 * player. It repairs terminal events saved by an older browser bundle in the
 * localStorage outbox, and keeps any future caller from poisoning taste data.
 */
function normalizeListeningEventPayload(
  payload: ListeningEventPayload,
): ListeningEventPayload {
  const totalSec = telemetrySeconds(payload.totalSec);
  const durationSec = telemetrySeconds(payload.durationSec);
  return {
    ...payload,
    totalSec,
    durationSec: totalSec > 0 ? Math.min(durationSec, totalSec) : durationSec,
  };
}

function withEventId(payload: ListeningEventPayload): ListeningEventPayload {
  return {
    ...payload,
    eventId:
      payload.eventId ??
      (typeof crypto === "undefined" ||
      typeof crypto.randomUUID !== "function"
        ? undefined
        : crypto.randomUUID()),
  };
}

function readQueuedListeningEvents(): QueuedListeningEvent[] {
  if (typeof window === "undefined") return [];

  try {
    const value = JSON.parse(
      window.localStorage.getItem(LISTENING_EVENT_OUTBOX_KEY) ?? "[]",
    );
    return Array.isArray(value) ? (value as QueuedListeningEvent[]) : [];
  } catch {
    return [];
  }
}

function writeQueuedListeningEvents(events: QueuedListeningEvent[]) {
  if (typeof window === "undefined") return;

  try {
    if (events.length === 0) {
      window.localStorage.removeItem(LISTENING_EVENT_OUTBOX_KEY);
      return;
    }
    window.localStorage.setItem(LISTENING_EVENT_OUTBOX_KEY, JSON.stringify(events));
  } catch {
    // Storage can be unavailable in private contexts. The player must never
    // be blocked merely because a telemetry event cannot be retained.
  }
}

/** Queue a terminal event during page shutdown; delivery resumes next load. */
export function queueListeningEvent(payload: ListeningEventPayload) {
  const userId = useAuthStore.getState().user?.userId;
  if (!userId) return;

  const events = readQueuedListeningEvents();
  events.push({
    userId,
    payload: withEventId(normalizeListeningEventPayload(payload)),
  });
  writeQueuedListeningEvents(events.slice(-MAX_QUEUED_LISTENING_EVENTS));
}

export async function flushQueuedListeningEvents() {
  const userId = useAuthStore.getState().user?.userId;
  if (!userId) return;

  const queued = readQueuedListeningEvents();
  if (queued.length === 0) return;

  const retained = queued.filter((event) => event.userId !== userId);
  for (const event of queued) {
    if (event.userId !== userId) continue;
    try {
      const payload = normalizeListeningEventPayload(event.payload);
      const response = await http.post<{ success?: boolean }>(
        "/me/recommendations/listening-events",
        payload,
      );
      if (response.data.success === false) throw new Error("LISTENING_EVENT_REJECTED");
      if (
        payload.eventType === "PLAY_START" &&
        payload.recentlyPlayedItem
      ) {
        invalidateRecommendationSectionCache(RECENTLY_PLAYED_SHELF_ID);
        publishRecentlyPlayedItem(payload.recentlyPlayedItem);
      }
    } catch {
      retained.push(event);
    }
  }
  writeQueuedListeningEvents(retained.slice(-MAX_QUEUED_LISTENING_EVENTS));
}

export async function sendListeningEvent(payload: ListeningEventPayload) {
  const requestPayload = withEventId(normalizeListeningEventPayload(payload));

  if (
    payload.eventType === "PLAY_START" &&
    payload.recentlyPlayedItem &&
    typeof window !== "undefined"
  ) {
    publishRecentlyPlayedItem(payload.recentlyPlayedItem);
  }

  try {
    const response = await http.post<{ success?: boolean }>(
      "/me/recommendations/listening-events",
      requestPayload,
    );
    if (response.data.success === false) throw new Error("LISTENING_EVENT_REJECTED");
    // Recently Played is updated locally. Behavioural telemetry deliberately
    // does not invalidate or refetch the full Home: a listener must not see
    // shelves flicker or switch from Global to personal Home mid-session.
    if (payload.eventType === "PLAY_START") {
      invalidateRecommendationSectionCache(RECENTLY_PLAYED_SHELF_ID);
    }
    const userId = useAuthStore.getState().user?.userId;
    if (
      payload.eventType === "PLAY_START" &&
      payload.recentlyPlayedItem &&
      userId
    ) {
      recentlyPlayedSyncChannel?.postMessage({
        userId,
        item: payload.recentlyPlayedItem,
      });
    }
  } catch {
    // A normal playback event can fail just as a page-close event can. Keep
    // the same idempotent payload so the next authenticated app load can
    // deliver it without losing taste data or double-counting a retry.
    queueListeningEvent(requestPayload);
    if (payload.eventType === "PLAY_START" && payload.recentlyPlayedItem) {
      window.dispatchEvent(
        new CustomEvent<MediaCardProps>(RECENTLY_PLAYED_ITEM_REJECTED_EVENT, {
          detail: payload.recentlyPlayedItem,
        }),
      );
    }
  }
}
