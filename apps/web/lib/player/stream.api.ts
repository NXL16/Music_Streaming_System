import { http } from "@/lib/api/http";
import type { HighPlaybackManifest, PlaybackManifest } from "./mse/types";

// A high rendition is optional. Waiting longer than this harms tap-to-play
// more than the extra bitrate helps, so slow networks fall back to 128.
const HIGH_MANIFEST_TIMEOUT_MS = 1_000;

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

export async function getHighPlaybackManifest(
  songId: string,
  signal?: AbortSignal,
): Promise<HighPlaybackManifest> {
  const response = await http.get<HighPlaybackManifest>(
    `/stream/${encodeURIComponent(songId)}/playback/high`,
    { signal },
  );
  return response.data;
}

export async function getHighPlaybackManifestWithTimeout(
  songId: string,
  signal?: AbortSignal,
): Promise<HighPlaybackManifest> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, HIGH_MANIFEST_TIMEOUT_MS);
  try {
    return await getHighPlaybackManifest(songId, controller.signal);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
