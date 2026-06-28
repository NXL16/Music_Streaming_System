import { create } from "zustand";

export type PlayerSong = {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationSec: number;
};

type PlayerState = {
  currentSong: PlayerSong | null;
  playing: boolean;
  setSong: (song: PlayerSong) => void;
  togglePlayback: () => void;
  pause: () => void;
  clear: () => void;
};

export const usePlayerStore = create<PlayerState>((set) => ({
  currentSong: null,
  playing: false,
  setSong: (song) => set({ currentSong: song, playing: true }),
  togglePlayback: () =>
    set((state) => ({ playing: state.currentSong ? !state.playing : false })),
  pause: () => set({ playing: false }),
  clear: () => set({ currentSong: null, playing: false }),
}));
