import { create } from "zustand";

export type Song = {
  id: string;
  title: string;
  artist: string;
  coverUrl: string;
  duration: number;
};

type PlayerState = {
  // State
  currentSong: Song | null;
  isPlaying: boolean;
  progress: number; // 0-100
  duration: number; // giây
  volume: number; // 0-1
  streamUrl: string | null;

  // Actions
  playSong: (song: Song, streamUrl: string) => void;
  togglePlay: () => void;
  setProgress: (progress: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  reset: () => void;
};

export const usePlayerStore = create<PlayerState>((set) => ({
  currentSong: null,
  isPlaying: false,
  progress: 0,
  duration: 0,
  volume: 1,
  streamUrl: null,

  playSong: (song, streamUrl) =>
    set({ currentSong: song, streamUrl, isPlaying: true, progress: 0 }),

  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),

  setProgress: (progress) => set({ progress }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => set({ volume }),

  reset: () =>
    set({
      currentSong: null,
      isPlaying: false,
      progress: 0,
      duration: 0,
      streamUrl: null,
    }),
}));
