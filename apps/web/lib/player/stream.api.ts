import { http } from "@/lib/api/http";
import type { PlaybackManifest } from "./mse/types";

export async function getPlaybackManifest(
  songId: string,
  signal?: AbortSignal,
): Promise<PlaybackManifest> {
  const response = await http.get<PlaybackManifest>(
    `/stream/${encodeURIComponent(songId)}/playback`,
    { signal },
  );
  return response.data;
}
