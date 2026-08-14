import { http } from "@/lib/api/http";
import type { MediaCardProps } from "@/components/media/media-card.types";
import { prependRecentlyPlayedSnapshot } from "./recently-played-snapshot";
import { useAuthStore } from "@/lib/auth/auth-store";

export type ListeningEventType = "PLAY_START" | "PLAY_COMPLETE" | "SKIP";
export const RECENTLY_PLAYED_ITEM_EVENT = "recently-played:item";
export const RECENTLY_PLAYED_ITEM_REJECTED_EVENT =
  "recently-played:item-rejected";
const RECENTLY_PLAYED_SYNC_CHANNEL = "recently-played";
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

type ListeningEventPayload = {
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
  recentlyPlayedItem?: MediaCardProps;
};

export async function sendListeningEvent(payload: ListeningEventPayload) {
  if (
    payload.eventType === "PLAY_START" &&
    payload.recentlyPlayedItem &&
    typeof window !== "undefined"
  ) {
    publishRecentlyPlayedItem(payload.recentlyPlayedItem);
  }

  try {
    await http.post("/me/recommendations/listening-events", payload);
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
    if (payload.eventType === "PLAY_START" && payload.recentlyPlayedItem) {
      window.dispatchEvent(
        new CustomEvent<MediaCardProps>(RECENTLY_PLAYED_ITEM_REJECTED_EVENT, {
          detail: payload.recentlyPlayedItem,
        }),
      );
    }
  }
}
