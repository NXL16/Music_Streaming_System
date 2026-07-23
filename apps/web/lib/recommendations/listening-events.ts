import { http } from "@/lib/api/http";
import type { MediaCardProps } from "@/components/media/media-card.types";

export type ListeningEventType = "PLAY_START" | "PLAY_COMPLETE" | "SKIP";
export const RECENTLY_PLAYED_ITEM_EVENT = "recently-played:item";

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
    window.dispatchEvent(
      new CustomEvent<MediaCardProps>(RECENTLY_PLAYED_ITEM_EVENT, {
        detail: payload.recentlyPlayedItem,
      }),
    );
  }

  try {
    await http.post("/me/recommendations/listening-events", payload);
  } catch {}
}
