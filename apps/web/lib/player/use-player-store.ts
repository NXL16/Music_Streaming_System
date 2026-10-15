import { create } from "zustand";

export type PlayerArtist = {
  id?: string;
  name: string;
  url?: string;
};

export type PlayerSongCredit = PlayerArtist & {
  role: string;
  position: number;
  /** Only main billed artists may render in the song header. */
  isPrimary?: boolean;
  /** Optional catalog artist artwork used by the song-credit avatar. */
  artworkUrl?: string;
};

export type PlayerSong = {
  id: string;
  /** Public identity of this song inside the release currently being viewed. */
  releaseTrackId?: string;
  title: string;
  url?: string;
  artist: string;
  /** Raw `songs.artistName`; unlike `artist`, this is never replaced by album context. */
  songArtistName?: string;
  artists?: PlayerArtist[];
  credits?: PlayerSongCredit[];
  album: string;
  albumId?: string;
  albumUrl?: string;
  albumVideoSrc?: string;
  hasLyrics?: boolean;
  durationSec: number;
  artworkUrl: string;
  /** High-resolution artwork reserved for the OS/Media Session surface. */
  mediaSessionArtworkUrl?: string;
  artworkSrcSet?: string;
  thumbnailArtworkSrcSet?: string;
  artworkBgColor?: string;
  releaseDate?: string;
  playbackUrl: string;
  /** The same Song can be played from its audio or Music Video entry point. */
  playbackKind?: "audio" | "video";
  /** Present only while this Song is being played through its Music Video. */
  video?: {
    id: string;
    poster?: string;
    posterSrcSet?: string;
  };
  audioMode?: "STANDARD" | "SING";
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
    artworkReady?: boolean;
  };
  /** Added by the continuous Autoplay recommendation queue. */
  sourceAutoplay?: boolean;
};

export type RepeatMode = 0 | 1 | 2;
export type QueueInsertionPosition = "next" | "last";

const AUTOPLAY_PREFERENCE_STORAGE_KEY = "autoplayMode";

function readAutoplayPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.localStorage.getItem(AUTOPLAY_PREFERENCE_STORAGE_KEY) === "true"
    );
  } catch {
    return false;
  }
}

function saveAutoplayPreference(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      AUTOPLAY_PREFERENCE_STORAGE_KEY,
      String(enabled),
    );
  } catch {
    // Storage can be unavailable in private browsing; playback still works.
  }
}

type PlayerState = {
  currentSong: PlayerSong | null;
  queue: PlayerSong[];
  originalQueue: PlayerSong[];
  currentIndex: number;
  playing: boolean;
  shuffleEnabled: boolean;
  stationMode: boolean;
  autoplayEnabled: boolean;
  repeatMode: RepeatMode;
  drawerOpen: boolean;
  playbackTimeMs: number;
  playbackRate: number;
  videoPlayerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  setPlaybackTimeMs: (timeMs: number) => void;
  setPlaybackRate: (rate: number) => void;
  setVideoPlayerOpen: (open: boolean) => void;
  setSong: (song: PlayerSong) => void;
  replaceCurrentSong: (song: PlayerSong) => void;
  setQueue: (songs: PlayerSong[], startIndex?: number) => void;
  enqueue: (songs: PlayerSong[], position: QueueInsertionPosition) => void;
  reorderUpcomingQueue: (activeSongId: string, overSongId: string) => void;
  removeUpcomingSong: (songId: string) => void;
  removePlaylistSong: (playlistId: string, songId: string) => void;
  clearUpcomingQueue: () => void;
  playShuffledQueue: (songs: PlayerSong[]) => void;
  startStation: (
    songs: PlayerSong[],
    seedSongId?: string,
    preserveSeedPlayback?: boolean,
  ) => void;
  appendStationTracks: (stationId: string, songs: PlayerSong[]) => void;
  appendAutoplayTracks: (songs: PlayerSong[]) => void;
  updateStationArtwork: (
    stationId: string,
    artwork: { url: string; bgColor: string },
  ) => void;
  togglePlayback: () => void;
  toggleShuffle: () => void;
  cycleRepeatMode: () => void;
  toggleAutoplay: () => void;
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

function findNextQueuedIndex(
  state: Pick<
    PlayerState,
    "currentIndex" | "queue" | "repeatMode" | "stationMode"
  >,
) {
  if (state.stationMode) {
    return findPlayableIndex(state.queue, state.currentIndex + 1, 1);
  }

  let nextIndex = findPlayableIndex(
    state.queue,
    state.currentIndex < 0 ? 0 : state.currentIndex + 1,
    1,
  );
  if (nextIndex < 0 && state.repeatMode === 2) {
    nextIndex = findPlayableIndex(state.queue, 0, 1);
  }
  return nextIndex;
}

export function getNextQueuedSong(
  state: Pick<
    PlayerState,
    "currentIndex" | "queue" | "repeatMode" | "stationMode"
  >,
) {
  const nextIndex = findNextQueuedIndex(state);
  return nextIndex >= 0 && nextIndex !== state.currentIndex
    ? (state.queue[nextIndex] ?? null)
    : null;
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

function samePlayback(left: PlayerSong, right: PlayerSong | null) {
  return Boolean(
    right &&
    left.id === right.id &&
    left.releaseTrackId === right.releaseTrackId &&
    left.playbackKind === right.playbackKind &&
    left.video?.id === right.video?.id,
  );
}

export function countShuffleableManualSongs(
  songs: PlayerSong[],
  startIndex: number,
) {
  return songs
    .slice(Math.max(0, startIndex))
    .filter((song) => !song.sourceAutoplay && Boolean(song.playbackUrl)).length;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  currentSong: null,
  queue: [],
  originalQueue: [],
  currentIndex: -1,
  playing: false,
  shuffleEnabled: false,
  stationMode: false,
  autoplayEnabled: readAutoplayPreference(),
  repeatMode: 0,
  drawerOpen: false,
  playbackTimeMs: 0,
  playbackRate: 1,
  videoPlayerOpen: false,
  setDrawerOpen: (open) => set({ drawerOpen: open }),
  setPlaybackTimeMs: (timeMs) => set({ playbackTimeMs: Math.max(0, timeMs) }),
  setPlaybackRate: (rate) =>
    set({
      playbackRate: Number.isFinite(rate)
        ? Math.min(2, Math.max(0.5, rate))
        : 1,
    }),
  setVideoPlayerOpen: (open) => set({ videoPlayerOpen: open }),
  setSong: (song) =>
    set((state) => ({
      currentSong: song,
      queue: [song],
      originalQueue: [song],
      currentIndex: 0,
      playbackTimeMs: 0,
      playing: Boolean(song.playbackUrl),
      shuffleEnabled: false,
      stationMode: false,
      autoplayEnabled: state.autoplayEnabled,
      repeatMode: 0,
      videoPlayerOpen: false,
    })),
  replaceCurrentSong: (song) =>
    set((state) => {
      const currentSong = state.currentSong;
      if (
        !currentSong ||
        currentSong.id !== song.id ||
        currentSong.playbackKind !== song.playbackKind ||
        currentSong.video?.id !== song.video?.id
      ) {
        return state;
      }

      const isCurrentPlayback = (item: PlayerSong) =>
        item.id === currentSong.id &&
        item.playbackKind === currentSong.playbackKind &&
        item.video?.id === currentSong.video?.id;
      // `originalQueue` can be in a different order when shuffle is enabled;
      // replacing by index would update an unrelated track in that case.
      const replaceCurrentPlayback = (items: PlayerSong[]) =>
        items.map((item) => (isCurrentPlayback(item) ? song : item));
      return {
        currentSong: song,
        queue: replaceCurrentPlayback(state.queue),
        originalQueue: replaceCurrentPlayback(state.originalQueue),
      };
    }),
  setQueue: (songs, startIndex = 0) =>
    set((state) => {
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
        autoplayEnabled: state.autoplayEnabled,
        repeatMode: 0,
        videoPlayerOpen: false,
      };
    }),
  enqueue: (songs, position) =>
    set((state) => {
      const activeSongId = state.currentSong?.id ?? null;
      const hasActiveSong = activeSongId !== null && state.currentIndex >= 0;
      const requestedSongIds = new Set<string>();
      const queuedSongs: PlayerSong[] = [];

      for (const song of songs) {
        // Keep the actively playing track fixed. Every other existing queue
        // entry is removed then inserted at the requested position below.
        if (
          !song.playbackUrl ||
          song.id === activeSongId ||
          requestedSongIds.has(song.id)
        ) {
          continue;
        }
        requestedSongIds.add(song.id);
        queuedSongs.push(song);
      }
      if (!queuedSongs.length) return state;

      // Queue rows and drag-and-drop identify a track by song id. Removing
      // existing targets first both prevents duplicate keys and lets repeated
      // Play Next/Last calls reposition already queued tracks.
      const withoutRequestedSongs = (queue: PlayerSong[]) =>
        queue.filter((song) => !requestedSongIds.has(song.id));
      const queueWithoutRequested = withoutRequestedSongs(state.queue);
      const originalQueueWithoutRequested = withoutRequestedSongs(
        state.originalQueue,
      );

      // A queue can be prepared before playback begins. The first queued song
      // is selected only when the listener presses Play.
      if (!hasActiveSong) {
        const queue =
          position === "next"
            ? [...queuedSongs, ...queueWithoutRequested]
            : [...queueWithoutRequested, ...queuedSongs];
        const originalQueue =
          position === "next"
            ? [...queuedSongs, ...originalQueueWithoutRequested]
            : [...originalQueueWithoutRequested, ...queuedSongs];

        return {
          queue,
          originalQueue,
          currentSong: null,
          currentIndex: -1,
          playing: false,
          shuffleEnabled: false,
          stationMode: false,
          repeatMode: 0,
        };
      }

      const currentIndex = queueWithoutRequested.findIndex(
        (song) => song.id === activeSongId,
      );
      const insertionBeforeAutoplay = (
        songs: PlayerSong[],
        activeIndex: number,
      ) => {
        const firstUpcomingAutoplay = songs.findIndex(
          (song, index) => index > activeIndex && song.sourceAutoplay,
        );
        return firstUpcomingAutoplay < 0
          ? songs.length
          : firstUpcomingAutoplay;
      };
      const queueInsertionIndex =
        position === "next" && currentIndex >= 0
          ? currentIndex + 1
          : insertionBeforeAutoplay(queueWithoutRequested, currentIndex);
      const queue = [...queueWithoutRequested];
      queue.splice(queueInsertionIndex, 0, ...queuedSongs);

      const originalQueue = [...originalQueueWithoutRequested];
      const originalCurrentIndex = originalQueue.findIndex(
        (song) => song.id === activeSongId,
      );
      const originalInsertionIndex =
        position === "next" && originalCurrentIndex >= 0
          ? originalCurrentIndex + 1
          : insertionBeforeAutoplay(originalQueue, originalCurrentIndex);
      originalQueue.splice(originalInsertionIndex, 0, ...queuedSongs);

      return {
        queue,
        originalQueue,
        currentIndex,
        stationMode: false,
      };
    }),
  reorderUpcomingQueue: (activeSongId, overSongId) =>
    set((state) => {
      if (state.stationMode || activeSongId === overSongId) {
        return state;
      }

      const upcomingStartIndex = Math.max(0, state.currentIndex + 1);
      const upcomingSongs = state.queue.slice(upcomingStartIndex);
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
        ...state.queue.slice(0, upcomingStartIndex),
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
      if (state.stationMode) return state;

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
        .find(
          (song) => song.sourcePlaylist?.id === playlistId && song.playbackUrl,
        );

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
      if (state.stationMode) return state;

      if (state.currentIndex < 0) {
        if (!state.queue.length) return state;
        return {
          queue: [],
          originalQueue: [],
          currentSong: null,
          currentIndex: -1,
          playing: false,
        };
      }

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
        videoPlayerOpen: false,
      };
    }),
  startStation: (songs, seedSongId, preserveSeedPlayback = false) =>
    set((state) => {
      // A Station is shuffled once, then consumed in order. This guarantees a
      // track cannot repeat until the listener explicitly starts the station again.
      const seed = seedSongId
        ? songs.find((song) => song.id === seedSongId)
        : undefined;
      const queue = seed
        ? [
            seed,
            ...shuffleAllSongs(songs.filter((song) => song.id !== seedSongId)),
          ]
        : shuffleAllSongs(songs);
      const currentIndex = findPlayableIndex(queue, 0, 1);
      const currentSong = currentIndex >= 0 ? queue[currentIndex] : null;
      const continuesCurrentSeed =
        preserveSeedPlayback &&
        currentSong?.id === state.currentSong?.id &&
        currentSong?.releaseTrackId === state.currentSong?.releaseTrackId;

      return {
        currentSong,
        playbackTimeMs: continuesCurrentSeed ? state.playbackTimeMs : 0,
        queue,
        originalQueue: queue,
        currentIndex,
        playing: Boolean(currentSong),
        shuffleEnabled: true,
        stationMode: true,
        autoplayEnabled: false,
        repeatMode: 0,
      };
    }),
  appendStationTracks: (stationId, songs) =>
    set((state) => {
      if (
        !state.stationMode ||
        state.currentSong?.sourceStation?.id !== stationId
      ) {
        return state;
      }
      const existingSongIds = new Set(state.queue.map((song) => song.id));
      const additions = shuffleAllSongs(
        songs.filter(
          (song) =>
            Boolean(song.playbackUrl) &&
            song.sourceStation?.id === stationId &&
            !existingSongIds.has(song.id),
        ),
      );
      if (!additions.length) return state;

      return {
        queue: [...state.queue, ...additions],
        originalQueue: [...state.originalQueue, ...additions],
      };
    }),
  appendAutoplayTracks: (songs) =>
    set((state) => {
      if (!state.autoplayEnabled || state.stationMode) return state;

      const existingSongIds = new Set(state.queue.map((song) => song.id));
      const additions = songs.filter(
        (song) => Boolean(song.playbackUrl) && !existingSongIds.has(song.id),
      );
      if (!additions.length) return state;

      const appendAutoplayTracksToQueue = (queue: PlayerSong[]) => {
        // Manual additions are always inserted before this block. Therefore
        // appending here preserves recommendation order and keeps Autoplay last.
        return [
          ...queue,
          ...additions.map((song) => ({ ...song, sourceAutoplay: true })),
        ];
      };

      return {
        queue: appendAutoplayTracksToQueue(state.queue),
        originalQueue: appendAutoplayTracksToQueue(state.originalQueue),
      };
    }),
  updateStationArtwork: (stationId, artwork) =>
    set((state) => {
      const updateSong = (song: PlayerSong) =>
        song.sourceStation?.id === stationId
          ? {
              ...song,
              sourceStation: {
                ...song.sourceStation,
                artworkUrl: artwork.url,
                artworkBgColor: artwork.bgColor,
                artworkReady: true,
              },
            }
          : song;
      return {
        currentSong: state.currentSong ? updateSong(state.currentSong) : null,
        queue: state.queue.map(updateSong),
        originalQueue: state.originalQueue.map(updateSong),
      };
    }),
  togglePlayback: () =>
    set((state) => {
      if (state.currentSong) return { playing: !state.playing };

      const firstPlayableIndex = findPlayableIndex(state.queue, 0, 1);
      if (firstPlayableIndex < 0) return state;

      return {
        currentSong: state.queue[firstPlayableIndex],
        currentIndex: firstPlayableIndex,
        playbackTimeMs: 0,
        playing: true,
      };
    }),
  toggleShuffle: () =>
    set((state) => {
      if (state.stationMode || state.currentSong?.sourceAutoplay) return state;
      if (
        !state.currentSong ||
        countShuffleableManualSongs(state.queue, state.currentIndex) < 2
      ) {
        return state;
      }

      const autoplaySongs = state.queue.filter((song) => song.sourceAutoplay);
      const manualQueue = state.originalQueue.filter(
        (song) => !song.sourceAutoplay,
      );

      if (state.shuffleEnabled) {
        const restoredIndex = manualQueue.findIndex(
          (song) => song.id === state.currentSong?.id,
        );
        return {
          shuffleEnabled: false,
          queue: [...manualQueue, ...autoplaySongs],
          currentIndex: restoredIndex,
        };
      }

      return {
        shuffleEnabled: true,
        queue: [
          ...shuffleQueue(manualQueue, state.currentSong.id),
          ...autoplaySongs,
        ],
        currentIndex: 0,
      };
    }),
  cycleRepeatMode: () =>
    set((state) => {
      if (state.stationMode || state.currentSong?.sourceAutoplay) return state;
      const queue = state.autoplayEnabled
        ? state.queue.filter(
            (song) =>
              !song.sourceAutoplay || samePlayback(song, state.currentSong),
          )
        : state.queue;
      const originalQueue = state.autoplayEnabled
        ? state.originalQueue.filter(
            (song) =>
              !song.sourceAutoplay || samePlayback(song, state.currentSong),
          )
        : state.originalQueue;
      return {
        repeatMode: state.repeatMode === 0 ? 2 : state.repeatMode === 2 ? 1 : 0,
        autoplayEnabled: false,
        queue,
        originalQueue,
        currentIndex: queue.findIndex((song) =>
          samePlayback(song, state.currentSong),
        ),
      };
    }),
  toggleAutoplay: () =>
    set((state) => {
      if (state.stationMode || !state.currentSong) return state;
      if (state.autoplayEnabled) {
        const queue = state.queue.filter(
          (song) =>
            !song.sourceAutoplay || samePlayback(song, state.currentSong),
        );
        const originalQueue = state.originalQueue.filter(
          (song) =>
            !song.sourceAutoplay || samePlayback(song, state.currentSong),
        );
        return {
          autoplayEnabled: false,
          queue,
          originalQueue,
          currentIndex: queue.findIndex((song) =>
            samePlayback(song, state.currentSong),
          ),
        };
      }
      // Autoplay begins after the manual queue in its original order. Do not
      // carry an already-active Shuffle mode into that flow.
      const queue = state.shuffleEnabled ? state.originalQueue : state.queue;
      return {
        autoplayEnabled: true,
        shuffleEnabled: false,
        repeatMode: 0,
        queue,
        currentIndex: queue.findIndex((song) =>
          samePlayback(song, state.currentSong),
        ),
      };
    }),
  pause: () => set({ playing: false }),
  next: (stopAtEnd = false) => {
    let didChangeTrack = false;

    set((state) => {
      const nextIndex = findNextQueuedIndex(state);
      if (nextIndex < 0) return stopAtEnd ? { playing: false } : state;
      if (nextIndex === state.currentIndex) return state;

      didChangeTrack = true;

      return {
        currentIndex: nextIndex,
        currentSong: state.queue[nextIndex],
        playbackTimeMs: 0,
        playing: true,
        // Autoplay always owns its recommendation order. If the listener
        // reaches this section from a shuffled manual queue, clear Shuffle
        // before the Autoplay track begins (Repeat is reset defensively too).
        ...(!state.stationMode && state.queue[nextIndex].sourceAutoplay
          ? { shuffleEnabled: false, repeatMode: 0 as RepeatMode }
          : {}),
        videoPlayerOpen:
          state.videoPlayerOpen &&
          state.currentSong?.playbackKind === "video" &&
          state.queue[nextIndex]?.playbackKind === "video",
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
          playbackTimeMs: 0,
          playing: true,
          videoPlayerOpen:
            state.videoPlayerOpen &&
            state.currentSong?.playbackKind === "video" &&
            state.queue[stationIndex]?.playbackKind === "video",
        };
      }

      let previousIndex = findPlayableIndex(
        state.queue,
        state.currentIndex < 0 ? 0 : state.currentIndex - 1,
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
        playbackTimeMs: 0,
        playing: true,
        ...(state.queue[previousIndex].sourceAutoplay
          ? { shuffleEnabled: false, repeatMode: 0 as RepeatMode }
          : {}),
        videoPlayerOpen:
          state.videoPlayerOpen &&
          state.currentSong?.playbackKind === "video" &&
          state.queue[previousIndex]?.playbackKind === "video",
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
      autoplayEnabled: false,
      repeatMode: 0,
      drawerOpen: false,
    }),
}));

// Persist only the listener's toggle. Queue entries and playback position stay
// in memory, so enabling Autoplay always builds a fresh recommendation block.
if (typeof window !== "undefined") {
  usePlayerStore.subscribe((state, previousState) => {
    if (state.autoplayEnabled !== previousState.autoplayEnabled) {
      saveAutoplayPreference(state.autoplayEnabled);
    }
  });
}
