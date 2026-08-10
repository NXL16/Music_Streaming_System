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
    playlistKind?: "catalog" | "favorite" | "user";
    isUserPlaylist?: boolean;
    curatorName?: string;
    href?: string;
    artworkUrl: string;
    artworkSrcSet?: string;
    artworkBgColor?: string;
  };
  sourceStation?: {
    id: string;
    name: string;
    description?: string;
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
  playbackTimeMs: number;
  playbackRate: number;
  setDrawerOpen: (open: boolean) => void;
  setPlaybackTimeMs: (timeMs: number) => void;
  setPlaybackRate: (rate: number) => void;
  setSong: (song: PlayerSong) => void;
  setQueue: (songs: PlayerSong[], startIndex?: number) => void;
  reorderUpcomingQueue: (activeSongId: string, overSongId: string) => void;
  removeUpcomingSong: (songId: string) => void;
  removePlaylistSong: (playlistId: string, songId: string) => void;
  clearUpcomingQueue: () => void;
  playShuffledQueue: (songs: PlayerSong[]) => void;
  startStation: (songs: PlayerSong[]) => void;
  togglePlayback: () => void;
  toggleShuffle: () => void;
  cycleRepeatMode: () => void;
  pause: () => void;
  next: (stopAtEnd?: boolean) => boolean;
  previous: () => boolean;
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
  playbackTimeMs: 0,
  playbackRate: 1,
  setDrawerOpen: (open) => set({ drawerOpen: open }),
  setPlaybackTimeMs: (timeMs) => set({ playbackTimeMs: Math.max(0, timeMs) }),
  setPlaybackRate: (rate) =>
    set({
      playbackRate: Number.isFinite(rate)
        ? Math.min(2, Math.max(0.5, rate))
        : 1,
    }),
  setSong: (song) =>
    set({
      currentSong: song,
      queue: [song],
      originalQueue: [song],
      currentIndex: 0,
      playbackTimeMs: 0,
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
        requestedIndex < 0 ? -1 : findPlayableIndex(songs, requestedIndex, 1);
      const normalizedIndex =
        requestedIndex < 0
          ? -1
          : nextPlayableIndex >= 0
            ? nextPlayableIndex
            : findPlayableIndex(songs, requestedIndex - 1, -1);
      const selectedSong = normalizedIndex >= 0 ? songs[normalizedIndex] : null;

      return {
        queue: songs,
        originalQueue: songs,
        currentIndex: normalizedIndex,
        currentSong: selectedSong,
        playbackTimeMs: 0,
        playing: Boolean(selectedSong),
        shuffleEnabled: false,
        stationMode: false,
        repeatMode: 0,
      };
    }),
  reorderUpcomingQueue: (activeSongId, overSongId) =>
    set((state) => {
      if (
        state.stationMode ||
        state.currentIndex < 0 ||
        activeSongId === overSongId
      ) {
        return state;
      }

      const upcomingSongs = state.queue.slice(state.currentIndex + 1);
      const activeIndex = upcomingSongs.findIndex(
        (song) => song.id === activeSongId,
      );
      const overIndex = upcomingSongs.findIndex(
        (song) => song.id === overSongId,
      );

      if (activeIndex < 0 || overIndex < 0) return state;

      const reorderedUpcomingSongs = [...upcomingSongs];
      const [activeSong] = reorderedUpcomingSongs.splice(activeIndex, 1);
      reorderedUpcomingSongs.splice(overIndex, 0, activeSong);

      const reorderById = (songs: PlayerSong[]) => {
        const fromIndex = songs.findIndex((song) => song.id === activeSongId);
        const toIndex = songs.findIndex((song) => song.id === overSongId);
        if (fromIndex < 0 || toIndex < 0) return songs;

        const reorderedSongs = [...songs];
        const [song] = reorderedSongs.splice(fromIndex, 1);
        reorderedSongs.splice(toIndex, 0, song);
        return reorderedSongs;
      };

      const queue = [
        ...state.queue.slice(0, state.currentIndex + 1),
        ...reorderedUpcomingSongs,
      ];

      return {
        queue,
        originalQueue: state.shuffleEnabled
          ? reorderById(state.originalQueue)
          : queue,
      };
    }),
  removeUpcomingSong: (songId) =>
    set((state) => {
      if (state.stationMode || state.currentIndex < 0) return state;

      const songIndex = state.queue.findIndex((song) => song.id === songId);
      if (songIndex <= state.currentIndex) return state;

      const queue = state.queue.filter((song) => song.id !== songId);
      return {
        queue,
        originalQueue: state.shuffleEnabled
          ? state.originalQueue.filter((song) => song.id !== songId)
          : queue,
      };
    }),
  removePlaylistSong: (playlistId, songId) =>
    set((state) => {
      const belongsToPlaylist = (song: PlayerSong) =>
        song.id === songId && song.sourcePlaylist?.id === playlistId;
      const currentSongIsRemoved =
        state.currentSong !== null && belongsToPlaylist(state.currentSong);
      const queue = state.queue.filter((song) => !belongsToPlaylist(song));
      const originalQueue = state.originalQueue.filter(
        (song) => !belongsToPlaylist(song),
      );

      if (!currentSongIsRemoved) {
        const currentIndex = state.currentSong
          ? queue.findIndex((song) => song.id === state.currentSong?.id)
          : -1;
        return {
          queue,
          originalQueue,
          currentIndex,
        };
      }

      const nextSong = state.queue
        .slice(state.currentIndex + 1)
        .find((song) => song.sourcePlaylist?.id === playlistId && song.playbackUrl);

      if (!nextSong) {
        return {
          queue,
          originalQueue,
          currentSong: null,
          currentIndex: -1,
          playbackTimeMs: 0,
          playing: false,
        };
      }

      return {
        queue,
        originalQueue,
        currentSong: nextSong,
        currentIndex: queue.findIndex((song) => song.id === nextSong.id),
        playbackTimeMs: 0,
        playing: true,
      };
    }),
  clearUpcomingQueue: () =>
    set((state) => {
      if (state.stationMode || state.currentIndex < 0) return state;

      const queue = state.queue.slice(0, state.currentIndex + 1);
      if (queue.length === state.queue.length) return state;

      const upcomingSongIds = new Set(
        state.queue.slice(state.currentIndex + 1).map((song) => song.id),
      );
      return {
        queue,
        originalQueue: state.shuffleEnabled
          ? state.originalQueue.filter((song) => !upcomingSongIds.has(song.id))
          : queue,
      };
    }),
  playShuffledQueue: (songs) =>
    set(() => {
      const queue = shuffleAllSongs(songs);
      const currentIndex = findPlayableIndex(queue, 0, 1);
      const currentSong = currentIndex >= 0 ? queue[currentIndex] : null;

      return {
        currentSong,
        playbackTimeMs: 0,
        queue,
        originalQueue: songs,
        currentIndex,
        playing: Boolean(currentSong),
        shuffleEnabled: true,
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
        playbackTimeMs: 0,
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
        repeatMode: state.repeatMode === 0 ? 2 : state.repeatMode === 2 ? 1 : 0,
      };
    }),
  pause: () => set({ playing: false }),
  next: (stopAtEnd = false) => {
    let didChangeTrack = false;

    set((state) => {
      if (state.stationMode) {
        const stationIndex = findPlayableIndex(
          state.queue,
          state.currentIndex + 1,
          1,
        );

        if (stationIndex < 0) return stopAtEnd ? { playing: false } : state;
        if (stationIndex === state.currentIndex) return state;

        didChangeTrack = true;

        return {
          currentIndex: stationIndex,
          currentSong: state.queue[stationIndex],
          playing: true,
        };
      }

      let nextIndex = findPlayableIndex(state.queue, state.currentIndex + 1, 1);

      if (nextIndex < 0 && state.repeatMode === 2)
        nextIndex = findPlayableIndex(state.queue, 0, 1);
      if (nextIndex < 0) return stopAtEnd ? { playing: false } : state;
      if (nextIndex === state.currentIndex) return state;

      didChangeTrack = true;

      return {
        currentIndex: nextIndex,
        currentSong: state.queue[nextIndex],
        playing: true,
      };
    });

    return didChangeTrack;
  },

  previous: () => {
    let didChangeTrack = false;

    set((state) => {
      if (state.stationMode) {
        const stationIndex = findPlayableIndex(
          state.queue,
          state.currentIndex - 1,
          -1,
        );

        if (stationIndex < 0 || stationIndex === state.currentIndex)
          return state;

        didChangeTrack = true;
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

      if (previousIndex < 0 || previousIndex === state.currentIndex)
        return state;

      didChangeTrack = true;
      return {
        currentIndex: previousIndex,
        currentSong: state.queue[previousIndex],
        playing: true,
      };
    });

    return didChangeTrack;
  },

  clear: () =>
    set({
      currentSong: null,
      playbackTimeMs: 0,
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
