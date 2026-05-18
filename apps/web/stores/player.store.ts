import { create } from "zustand";

export type Song = {
  id: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  duration: number;
};

type PlayerState = {
  // State
  currentSong: Song | null;
  isPlaying: boolean;
  progress: number; // 0-100
  duration: number; // seconds
  volume: number; // 0-1
  streamUrl: string | null;

  // Actions
  playSong: (song: Song, streamUrl: string) => void;
  setStreamUrlForSong: (songId: string, streamUrl: string) => void;
  togglePlay: () => void;
  setProgress: (progress: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
};

export const usePlayerStore = create<PlayerState>((set) => ({
  currentSong: null,
  isPlaying: false,
  progress: 0,
  duration: 0,
  volume: 1,
  streamUrl: null,

  playSong: (song, streamUrl) =>
    set({
      currentSong: song,
      streamUrl,
      isPlaying: true,
      progress: 0,
      duration: song.duration || 0,
    }),

  setStreamUrlForSong: (songId, streamUrl) =>
    set((state) =>
      state.currentSong?.id === songId ? { streamUrl } : state,
    ),

  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),

  setProgress: (progress) => set({ progress }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => set({ volume }),

}));
