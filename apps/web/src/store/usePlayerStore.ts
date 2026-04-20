import { create } from "zustand";

// Định nghĩa kiểu dữ liệu bài hát khớp với Backend
export interface Song {
  _id: string;
  title: string;
  artistId: string;
  hlsMasterPath: string;
  thumbnails?: { large: string };
  duration: number;
}

interface PlayerState {
  currentSong: Song | null;
  isPlaying: boolean;
  volume: number; // Từ 0.0 đến 1.0

  // Các hành động (Actions)
  playSong: (song: Song) => void;
  togglePlay: () => void;
  setVolume: (volume: number) => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  currentSong: null,
  isPlaying: false,
  volume: 1,

  // Bấm vào bài nào là gắn bài đó vào currentSong và tự động Play
  playSong: (song) => set({ currentSong: song, isPlaying: true }),

  // Bật/Tắt nhạc
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),

  // Chỉnh âm lượng
  setVolume: (volume) => set({ volume }),
}));
