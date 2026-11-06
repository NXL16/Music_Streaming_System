import type { PlayerSong } from "./use-player-store";
import { usePlayerStore } from "./use-player-store";

/** Starts one Song as a standalone queue while preserving its release context. */
export function playSong(song: PlayerSong) {
  if (!song.playbackUrl) return;
  usePlayerStore.getState().setQueue([song]);
}
