import { create } from "zustand";

export type PlayerArtist = {
  id?: string;
  name: string;
  url?: string;
};

export type PlayerSong = {
  id: string;
  title: string;
  url?: string;
  artist: string;
  artists?: PlayerArtist[];
  album: string;
  albumId?: string;
  albumUrl?: string;
  durationSec: number;
  artworkUrl: string;
  artworkSrcSet?: string;
  thumbnailArtworkSrcSet?: string;
  artworkBgColor?: string;
  releaseDate?: string;
  playbackUrl: string;
  contentRating?: string;
  sourcePlaylist?: {
    id: string;
    name: string;
    artworkUrl: string;
    artworkSrcSet?: string;
    artworkBgColor?: string;
  };
  sourceStation?: {
    id: string;
    name: string;
    artworkUrl: string;
    artworkSrcSet?: string;
    artworkBgColor?: string;
  };
};

export type RepeatMode = 0 | 1 | 2;

type PlayerState = {
  currentSong: PlayerSong | null;
  queue: PlayerSong[];
  originalQueue: PlayerSong[];
  currentIndex: number;
  playing: boolean;
  shuffleEnabled: boolean;
  stationMode: boolean;
  repeatMode: RepeatMode;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  setSong: (song: PlayerSong) => void;
  setQueue: (songs: PlayerSong[], startIndex?: number) => void;
  startStation: (songs: PlayerSong[]) => void;
  togglePlayback: () => void;
  toggleShuffle: () => void;
  cycleRepeatMode: () => void;
  pause: () => void;
  next: (stopAtEnd?: boolean) => void;
  previous: () => void;
  clear: () => void;
};

function findPlayableIndex(
  songs: PlayerSong[],
  startIndex: number,
  direction: 1 | -1,
) {
  for (
    let index = startIndex;
    index >= 0 && index < songs.length;
    index += direction
  ) {
    if (songs[index]?.playbackUrl) return index;
  }
  return -1;
}

function shuffleQueue(songs: PlayerSong[], currentSongId: string) {
  const remaining = songs.filter((song) => song.id !== currentSongId);
  for (let index = remaining.length - 1; index > 0; index -= 1) {
    const targetIndex = Math.floor(Math.random() * (index + 1));
    [remaining[index], remaining[targetIndex]] = [
      remaining[targetIndex],
      remaining[index],
    ];
  }

  const currentSong = songs.find((song) => song.id === currentSongId);
  return currentSong ? [currentSong, ...remaining] : remaining;
}

function shuffleAllSongs(songs: PlayerSong[]) {
  const shuffled = [...songs];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const targetIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[targetIndex]] = [
      shuffled[targetIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  currentSong: null,
  queue: [],
  originalQueue: [],
  currentIndex: -1,
  playing: false,
  shuffleEnabled: false,
  stationMode: false,
  repeatMode: 0,
  drawerOpen: false,
  setDrawerOpen: (open) => set({ drawerOpen: open }),
  setSong: (song) =>
    set({
      currentSong: song,
      queue: [song],
      originalQueue: [song],
      currentIndex: 0,
      playing: Boolean(song.playbackUrl),
      shuffleEnabled: false,
      stationMode: false,
      repeatMode: 0,
    }),
  setQueue: (songs, startIndex = 0) =>
    set(() => {
      const requestedIndex =
        songs.length === 0
          ? -1
          : Math.min(Math.max(startIndex, 0), songs.length - 1);
      const nextPlayableIndex =
        requestedIndex < 0
          ? -1
          : findPlayableIndex(songs, requestedIndex, 1);
      const normalizedIndex =
        requestedIndex < 0
          ? -1
          : nextPlayableIndex >= 0
            ? nextPlayableIndex
            : findPlayableIndex(songs, requestedIndex - 1, -1);
      const selectedSong =
        normalizedIndex >= 0 ? songs[normalizedIndex] : null;

      return {
        queue: songs,
        originalQueue: songs,
        currentIndex: normalizedIndex,
        currentSong: selectedSong,
        playing: Boolean(selectedSong),
        shuffleEnabled: false,
        stationMode: false,
        repeatMode: 0,
      };
    }),
  startStation: (songs) =>
    set(() => {
      // A Station is shuffled once, then consumed in order. This guarantees a
      // track cannot repeat until the listener explicitly starts the station again.
      const queue = shuffleAllSongs(songs);
      const currentIndex = findPlayableIndex(queue, 0, 1);
      const currentSong = currentIndex >= 0 ? queue[currentIndex] : null;

      return {
        currentSong,
        queue,
        originalQueue: queue,
        currentIndex,
        playing: Boolean(currentSong),
        shuffleEnabled: true,
        stationMode: true,
        repeatMode: 0,
      };
    }),
  togglePlayback: () =>
    set((state) => ({ playing: state.currentSong ? !state.playing : false })),
  toggleShuffle: () =>
    set((state) => {
      if (state.stationMode) return state;
      if (!state.currentSong || state.originalQueue.length < 2) return state;

      if (state.shuffleEnabled) {
        const restoredIndex = state.originalQueue.findIndex(
          (song) => song.id === state.currentSong?.id,
        );
        return {
          shuffleEnabled: false,
          queue: state.originalQueue,
          currentIndex: restoredIndex,
        };
      }

      return {
        shuffleEnabled: true,
        queue: shuffleQueue(state.originalQueue, state.currentSong.id),
        currentIndex: 0,
      };
    }),
  cycleRepeatMode: () =>
    set((state) => {
      if (state.stationMode) return state;
      return {
        repeatMode:
          state.repeatMode === 0 ? 2 : state.repeatMode === 2 ? 1 : 0,
      };
    }),
  pause: () => set({ playing: false }),
  next: (stopAtEnd = false) =>
    set((state) => {
      if (state.stationMode) {
        const stationIndex = findPlayableIndex(
          state.queue,
          state.currentIndex + 1,
          1,
        );
        if (stationIndex < 0) {
          return { playing: false };
        }
        return {
          currentIndex: stationIndex,
          currentSong: state.queue[stationIndex],
          playing: true,
        };
      }

      let nextIndex = findPlayableIndex(
        state.queue,
        state.currentIndex + 1,
        1,
      );
      if (nextIndex < 0 && state.repeatMode === 2) {
        nextIndex = findPlayableIndex(state.queue, 0, 1);
      }
      if (nextIndex < 0) {
        return stopAtEnd ? { playing: false } : state;
      }
      return {
        currentIndex: nextIndex,
        currentSong: state.queue[nextIndex],
        playing: true,
      };
    }),
  previous: () =>
    set((state) => {
      if (state.stationMode) {
        const stationIndex = findPlayableIndex(
          state.queue,
          state.currentIndex - 1,
          -1,
        );
        if (stationIndex < 0) return state;
        return {
          currentIndex: stationIndex,
          currentSong: state.queue[stationIndex],
          playing: true,
        };
      }
      let previousIndex = findPlayableIndex(
        state.queue,
        state.currentIndex - 1,
        -1,
      );
      if (previousIndex < 0 && state.repeatMode === 2) {
        previousIndex = findPlayableIndex(
          state.queue,
          state.queue.length - 1,
          -1,
        );
      }
      if (previousIndex < 0) return state;
      return {
        currentIndex: previousIndex,
        currentSong: state.queue[previousIndex],
        playing: true,
      };
    }),
  clear: () =>
    set({
      currentSong: null,
      queue: [],
      originalQueue: [],
      currentIndex: -1,
      playing: false,
      shuffleEnabled: false,
      stationMode: false,
      repeatMode: 0,
      drawerOpen: false,
    }),
}));
