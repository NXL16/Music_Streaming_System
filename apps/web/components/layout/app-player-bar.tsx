"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useLayoutEffect,
  useMemo,
} from "react";
import {
  usePlayerStore,
  type PlayerSong,
} from "@/lib/player/use-player-store";
import { useFavoriteStore } from "@/lib/favorites/use-favorite-store";
import { useShallow } from "zustand/react/shallow";
import { useMsePlayback } from "@/lib/player/use-mse-playback";
import { usePersistentVolume } from "@/lib/player/use-persistent-volume";
import { resumeAudioContext } from "@/lib/player/audio-context";
import { syncPlaybackClock } from "@/lib/player/playback-clock";
import {
  flushQueuedListeningEvents,
  queueListeningEvent,
  sendListeningEvent,
} from "@/lib/recommendations/listening-events";
import { refillSongStation } from "@/lib/recommendations/song-station";
import { refillArtistStation } from "@/lib/recommendations/artist-station";
import { loadAutoplayTracks } from "@/lib/recommendations/autoplay";
import type {
  MediaArtwork,
  MediaCardProps,
} from "@/lib/media/media-card.types";
import { getCoverArtwork } from "@/lib/media/artwork-slots";
import { CompactPlayerBar } from "./player-bar/compact-player-bar";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  createAndHydrateMediaResourceCard,
  createMediaResourceCard,
} from "@/lib/media/normalize-media-resource";
import { getMediaEntity } from "@/lib/media/media-entity-store";
import { videoPlaybackController } from "@/lib/player/video-playback-controller";
import dynamic from "next/dynamic";

// Desktop-only queue drag/drop and the expanded player are substantial. Keep
// the audio/session shell interactive while this client chunk loads.
const DesktopPlayerBar = dynamic(
  () =>
    import("./player-bar/desktop-player-bar").then(
      (module) => module.DesktopPlayerBar,
    ),
  { ssr: false },
);

const LISTENING_QUALIFY_SECONDS = 3;
const LOCK_SCREEN_SEEK_SECONDS = 10;
const END_SEEK_TOLERANCE_SECONDS = 3;
const SONG_STATION_REFILL_THRESHOLD = 8;
const SONG_STATION_REFILL_RETRY_DELAY_MS = 15_000;
const AUTOPLAY_QUEUE_SIZE = 10;
const AUTOPLAY_REFILL_RETRY_DELAY_MS = 15_000;
const MEDIA_SESSION_POSITION_SYNC_INTERVAL_MS = 1_000;

function resetAudioToStart(audio: HTMLAudioElement | null): void {
  if (audio) {
    audio.currentTime = 0;
  }
}

/**
 * An MSE stream can still be at its terminal media timeline immediately after
 * assigning `currentTime = 0`. Calling play in that small window is ignored by
 * some browsers, leaving the UI at the start while the element remains ended.
 * Wait for its seek to settle before resuming. A short fallback keeps ordinary
 * media elements and browsers that omit `seeked` from getting stuck.
 */
function replayAudioFromStart(
  audio: HTMLAudioElement,
  vocal: HTMLAudioElement | null,
  waitForSeek: boolean,
  isCurrentPlayback: () => boolean,
  onReadyToPlay: () => void,
  onFailure: () => void,
): void {
  let started = false;
  let fallbackTimer: number | null = null;

  const startPlayback = () => {
    if (started) return;
    started = true;
    if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
    // A listener can skip to another track while the MSE seek is pending.
    // Never let that old request start (or pause) the newly selected track.
    if (!isCurrentPlayback()) return;

    onReadyToPlay();
    const plays = [audio.play()];
    if (vocal) plays.push(vocal.play());
    void Promise.all(plays).catch(onFailure);
  };

  if (waitForSeek) {
    audio.addEventListener("seeked", startPlayback, { once: true });
    fallbackTimer = window.setTimeout(startPlayback, 1_000);
    audio.currentTime = 0;
    resetAudioToStart(vocal);
    return;
  }

  audio.currentTime = 0;
  resetAudioToStart(vocal);
  startPlayback();
}

function getAbsoluteArtworkUrl(artworkUrl: string): string {
  try {
    return new URL(artworkUrl, window.location.origin).href;
  } catch {
    return artworkUrl;
  }
}

function recentlyPlayedCard(song: PlayerSong): MediaCardProps {
  if (song.sourceStation) {
    const station = song.sourceStation;
    return createAndHydrateMediaResourceCard(
      {
        id: station.id,
        type: "stations",
        name: station.name,
        artwork: { url: station.artworkUrl, bgColor: station.artworkBgColor },
      },
      {
        cardType: "station",
        imageUrl: station.artworkUrl,
        imageSrcSet: station.artworkSrcSet || station.artworkUrl,
      },
      "player",
    );
  }

  if (song.sourcePlaylist) {
    const playlist = song.sourcePlaylist;
    const favoriteArtwork =
      playlist.playlistKind === "favorite"
        ? (useFavoriteStore.getState().collection?.artwork as
            | MediaArtwork
            | undefined)
        : undefined;
    const favoriteCover = favoriteArtwork
      ? getCoverArtwork(favoriteArtwork, playlist.artworkUrl)
      : undefined;
    const imageUrl = favoriteCover?.imageUrl ?? playlist.artworkUrl;
    const imageSrcSet =
      favoriteCover?.imageSrcSet ??
      playlist.artworkSrcSet ??
      playlist.artworkUrl;

    return createAndHydrateMediaResourceCard(
      {
        id: playlist.id,
        type: "playlists",
        name: playlist.name,
        playlistKind: playlist.playlistKind,
        isUserPlaylist: playlist.isUserPlaylist,
        artwork: favoriteArtwork ?? {
          url: playlist.artworkUrl,
          bgColor: playlist.artworkBgColor,
        },
      },
      {
        cardType: "collection",
        subtitle: playlist.curatorName || "Musical",
        slug: playlist.href,
        imageUrl,
        imageSrcSet,
      },
      "player",
    );
  }

  if (!song.albumId) {
    return createAndHydrateMediaResourceCard(
      {
        id: song.id,
        type: "songs",
        name: song.title,
        artistName: song.artist,
        artwork: { url: song.artworkUrl },
      },
      {
        cardType: "collection",
        slug: song.url,
        imageUrl: song.artworkUrl,
        imageSrcSet: song.artworkSrcSet || song.artworkUrl,
        artists: song.artists?.flatMap((artist) =>
          artist.id && artist.url
            ? [{ id: artist.id, name: artist.name, url: artist.url }]
            : [],
        ),
      },
      "player",
    );
  }

  // A track must not overwrite the canonical metadata for its parent album.
  const fallback = createMediaResourceCard(
    {
      id: song.albumId,
      type: "albums",
      name: song.album || song.title,
      artistName: song.artist,
      artwork: { url: song.artworkUrl },
      contentRating: song.contentRating,
    },
    {
      cardType: "collection",
      slug: song.albumUrl,
      imageUrl: song.artworkUrl,
      imageSrcSet: song.artworkSrcSet || song.artworkUrl,
      artists: song.artists?.flatMap((artist) =>
        artist.id && artist.url
          ? [{ id: artist.id, name: artist.name, url: artist.url }]
          : [],
      ),
    },
  );
  const canonical = getMediaEntity(fallback);
  if (!canonical) return fallback;

  return createMediaResourceCard(
    {
      id: song.albumId,
      type: "albums",
      name: canonical.title || fallback.title,
      artistName: canonical.subtitle || fallback.subtitle,
      artwork: canonical.artwork ?? fallback.artwork,
      contentRating: canonical.contentRating ?? fallback.contentRating,
    },
    {
      cardType: "collection",
      slug: song.albumUrl,
      artists: canonical.artists ?? fallback.artists,
      description: canonical.description ?? fallback.description,
      typeTag: canonical.typeTag ?? fallback.typeTag,
    },
  );
}

function syncMediaSessionPosition(
  mediaSession: MediaSession,
  audio: HTMLAudioElement | null,
  fallbackDurationSeconds: number | undefined,
  playbackRate: number,
): void {
  if (typeof mediaSession.setPositionState !== "function") return;

  const elementDuration = audio?.duration;
  const duration =
    typeof elementDuration === "number" &&
    Number.isFinite(elementDuration) &&
    elementDuration > 0
      ? elementDuration
      : fallbackDurationSeconds;
  if (!Number.isFinite(duration) || !duration || duration <= 0) return;

  const position = Math.min(
    Math.max(0, audio?.currentTime ?? 0),
    duration,
  );
  try {
    mediaSession.setPositionState({
      duration,
      position,
      playbackRate: playbackRate > 0 ? playbackRate : 1,
    });
  } catch {
    // A transient MSE duration can be invalid while its source is attaching.
  }
}

function telemetryDurationSeconds(seconds: number | undefined): number {
  return Math.max(0, Math.floor(seconds ?? 0));
}

function playbackSessionKey(song: PlayerSong): string {
  // Queue/Station membership changes must not restart the same media file.
  // A Music Video of the same Song is nevertheless a new playback session:
  // it has a separate stream, clock and listening event.
  return [
    song.id,
    song.releaseTrackId ?? "",
    song.playbackKind ?? "audio",
    song.video?.id ?? "",
  ].join(":");
}

export function AppPlayerBar() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const vocalAudioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const vocalGainRef = useRef<GainNode | null>(null);
  const audioContextCloseTimerRef = useRef<number | null>(null);
  const playbackTimeSessionRef = useRef<string | undefined>(undefined);
  const lastMediaSessionPositionSyncRef = useRef(0);
  const {
    currentSong,
    queue,
    currentIndex,
    playing,
    shuffleEnabled,
    stationMode,
    autoplayEnabled,
    repeatMode,
    togglePlayback,
    toggleShuffle,
    cycleRepeatMode,
    toggleAutoplay,
    appendAutoplayTracks,
    pause,
    next,
    previous,
    setPlaybackTimeMs,
    playbackRate,
    setVideoPlayerOpen,
  } = usePlayerStore(
    useShallow((state) => ({
      currentSong: state.currentSong,
      queue: state.queue,
      currentIndex: state.currentIndex,
      playing: state.playing,
      shuffleEnabled: state.shuffleEnabled,
      stationMode: state.stationMode,
      autoplayEnabled: state.autoplayEnabled,
      repeatMode: state.repeatMode,
      togglePlayback: state.togglePlayback,
      toggleShuffle: state.toggleShuffle,
      cycleRepeatMode: state.cycleRepeatMode,
      toggleAutoplay: state.toggleAutoplay,
      appendAutoplayTracks: state.appendAutoplayTracks,
      pause: state.pause,
      next: state.next,
      previous: state.previous,
      setPlaybackTimeMs: state.setPlaybackTimeMs,
      playbackRate: state.playbackRate,
      setVideoPlayerOpen: state.setVideoPlayerOpen,
    })),
  );
  const { isMseActive, isStemActive } = useMsePlayback(audioRef, vocalAudioRef);
  const currentPlaybackSessionKey = currentSong
    ? playbackSessionKey(currentSong)
    : undefined;
  const isPlaying = Boolean(currentSong && playing);
  const isVideoPlayback = currentSong?.playbackKind === "video";
  const currentArtworkSrcSet =
    isVideoPlayback
      ? (currentSong?.video?.posterSrcSet ??
        currentSong?.video?.poster ??
        currentSong?.thumbnailArtworkSrcSet ??
        currentSong?.artworkSrcSet)
      : (currentSong?.thumbnailArtworkSrcSet ?? currentSong?.artworkSrcSet);
  const playableSongCount = useMemo(
    () => queue.filter((song) => song.playbackUrl).length,
    [queue],
  );
  const favoriteSongIds = useFavoriteStore((state) => state.songIds);
  const isCurrentSongFavorite = Boolean(
    currentSong && favoriteSongIds.has(currentSong.id),
  );

  const [isExpanded, setIsExpanded] = useState(false);
  const [isProgressExpanded, setIsProgressExpanded] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [vocalVolume, setVocalVolume] = useState(1);
  const [isVocalControlExpanded, setIsVocalControlExpanded] = useState(false);
  const [autoplayRetryNonce, setAutoplayRetryNonce] = useState(0);
  const useCompactPlayer = useMediaQuery("(max-width: 739px)");
  const { volume, lastAudibleVolume, setVolume } = usePersistentVolume();
  const trackedSongRef = useRef<string | null>(null);
  const pendingStationQualifiedPlayRef = useRef<{
    stationId: string;
    song: PlayerSong;
    elapsed: number;
  } | null>(null);
  const lastObservedPlaybackTimeRef = useRef(0);
  const listenedSecondsRef = useRef(0);
  const skippedToEndingRef = useRef(false);
  const songStationRefillRef = useRef<{
    stationId: string;
    inFlight: boolean;
    exhausted: boolean;
    retryAfter: number;
  } | null>(null);
  const autoplayRefillKeysRef = useRef(new Set<string>());
  const autoplayRetryTimerRef = useRef<number | null>(null);
  const autoplayGenerationRef = useRef(0);

  const previewVocalVolume = useCallback((nextVolume: number) => {
    const vocalGain = vocalGainRef.current;
    const audioContext = audioContextRef.current;
    if (!vocalGain || !audioContext) return;
    vocalGain.gain.setTargetAtTime(
      Math.min(1, Math.max(0, nextVolume)),
      audioContext.currentTime,
      0.015,
    );
  }, []);

  const handleTogglePlayback = useCallback(() => {
    if (isVideoPlayback) {
      if (!playing) setVideoPlayerOpen(true);
      togglePlayback();
      return;
    }
    resumeAudioContext(audioContextRef.current);

    const audio = audioRef.current;
    const hasReachedEnd =
      audio?.ended ||
      (audio &&
        Number.isFinite(audio.duration) &&
        audio.currentTime >= audio.duration);

    // The store stops at the end of a queue, but retains the same song and
    // MediaSource. A plain `play()` would therefore run with currentTime at
    // the end and immediately remain ended.
    if (hasReachedEnd && audio) {
      setPlaybackTimeMs(0);
      replayAudioFromStart(
        audio,
        isStemActive ? vocalAudioRef.current : null,
        isMseActive,
        () => playbackTimeSessionRef.current === currentPlaybackSessionKey,
        () => {
          if (!usePlayerStore.getState().playing) togglePlayback();
        },
        pause,
      );
      return;
    }

    togglePlayback();
  }, [
    isStemActive,
    isMseActive,
    isVideoPlayback,
    pause,
    playing,
    currentPlaybackSessionKey,
    setVideoPlayerOpen,
    setPlaybackTimeMs,
    togglePlayback,
  ]);

  const emitEvent = useCallback(
    (
      song: PlayerSong,
      eventType: "PLAY_START" | "PLAY_COMPLETE" | "PLAY_STOPPED" | "SKIP",
      elapsed?: number,
      deferDelivery = false,
    ) => {
      // A Song Station is only a valid Recently Played resource after its
      // dedicated artwork has been generated. This guards every PLAY_START
      // path, including a deferred event that outlives the player callback.
      if (eventType === "PLAY_START" && song.sourceStation?.artworkReady === false) {
        return;
      }
      // Media clocks can run a fraction past the catalog duration (notably
      // after MSE buffering or a delayed `ended` event). Keep telemetry within
      // the server-side validity invariant instead of losing the whole event.
      const totalSec = telemetryDurationSeconds(song.durationSec);
      const durationSec = telemetryDurationSeconds(elapsed);
      const payload = {
        songId: song.id,
        eventType,
        durationSec: totalSec > 0 ? Math.min(durationSec, totalSec) : durationSec,
        totalSec,
        songTitle: song.title,
        artistName: song.artist,
        albumName: song.album,
        albumId: song.albumId,
        playlistId: song.sourcePlaylist?.id,
        playlistName: song.sourcePlaylist?.name,
        playlistCuratorName: song.sourcePlaylist?.curatorName,
        playlistArtworkUrl: song.sourcePlaylist?.artworkUrl,
        playlistArtworkBgColor: song.sourcePlaylist?.artworkBgColor,
        stationId: song.sourceStation?.id,
        stationName: song.sourceStation?.name,
        stationArtworkUrl: song.sourceStation?.artworkUrl,
        stationArtworkBgColor: song.sourceStation?.artworkBgColor,
        recentlyPlayedItem:
          eventType === "PLAY_START" ? recentlyPlayedCard(song) : undefined,
      };
      if (deferDelivery) {
        queueListeningEvent(payload);
        return;
      }
      void sendListeningEvent(payload);
    },
    [],
  );

  useEffect(() => {
    void flushQueuedListeningEvents();
  }, []);

  const syncLockScreenPosition = useCallback(
    (force = false) => {
      if (
        isVideoPlayback ||
        !currentPlaybackSessionKey ||
        !("mediaSession" in navigator)
      ) {
        return;
      }

      const now = Date.now();
      if (
        !force &&
        now - lastMediaSessionPositionSyncRef.current <
          MEDIA_SESSION_POSITION_SYNC_INTERVAL_MS
      ) {
        return;
      }

      syncMediaSessionPosition(
        navigator.mediaSession,
        audioRef.current,
        currentSong?.durationSec,
        playbackRate,
      );
      lastMediaSessionPositionSyncRef.current = now;
    },
    [
      currentPlaybackSessionKey,
      currentSong?.durationSec,
      isVideoPlayback,
      playbackRate,
    ],
  );

  useEffect(() => {
    const handlePageHide = (event: PageTransitionEvent) => {
      if (event.persisted || !currentSong) return;
      if (trackedSongRef.current !== playbackSessionKey(currentSong)) return;

      const elapsed = listenedSecondsRef.current;
      if (elapsed <= 0) return;

      // Fetches with an Authorization header are not reliable while the page
      // closes. Persist a neutral terminal event and deliver it after the next
      // authenticated app load instead of misclassifying it as a skip.
      emitEvent(currentSong, "PLAY_STOPPED", elapsed, true);
      trackedSongRef.current = null;
      listenedSecondsRef.current = 0;
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [currentSong, emitEvent]);

  useEffect(() => {
    trackedSongRef.current = null;
    lastObservedPlaybackTimeRef.current = 0;
    listenedSecondsRef.current = 0;
    skippedToEndingRef.current = false;
  }, [
    currentSong?.id,
    currentSong?.playbackKind,
    currentSong?.video?.id,
    currentSong?.sourcePlaylist?.id,
    currentSong?.sourceStation?.id,
  ]);

  const markQualifiedPlay = useCallback(() => {
    if (!currentSong || !playing) return;
    if (skippedToEndingRef.current) return;
    if (trackedSongRef.current === playbackSessionKey(currentSong)) return;
    if (listenedSecondsRef.current < LISTENING_QUALIFY_SECONDS) return;
    if (currentSong.sourceStation?.artworkReady === false) {
      // The user has genuinely listened, but a Song Station must never enter
      // Recently Played with its seed-song cover. Keep this one qualified
      // play and publish it as soon as the generated Station artwork arrives.
      pendingStationQualifiedPlayRef.current = {
        stationId: currentSong.sourceStation.id,
        song: currentSong,
        elapsed: listenedSecondsRef.current,
      };
      return;
    }

    trackedSongRef.current = playbackSessionKey(currentSong);
    emitEvent(currentSong, "PLAY_START", listenedSecondsRef.current);
  }, [currentSong, emitEvent, playing]);

  useEffect(() => {
    return videoPlaybackController.subscribe((event) => {
      if (!isVideoPlayback || !currentSong || event.src !== currentSong.playbackUrl)
        return;
      if (event.type === "timeupdate") {
        const currentTime = Math.max(0, event.currentTime);
        const elapsedSinceLastObservation =
          currentTime - lastObservedPlaybackTimeRef.current;
        if (playing && elapsedSinceLastObservation >= 0) {
          listenedSecondsRef.current += elapsedSinceLastObservation;
        }
        lastObservedPlaybackTimeRef.current = currentTime;
        markQualifiedPlay();
        return;
      }

      markQualifiedPlay();
      if (
        !skippedToEndingRef.current &&
        trackedSongRef.current === playbackSessionKey(currentSong)
      ) {
        emitEvent(currentSong, "PLAY_COMPLETE", listenedSecondsRef.current);
      }
      trackedSongRef.current = null;
      listenedSecondsRef.current = 0;
      skippedToEndingRef.current = false;
    });
  }, [currentSong, emitEvent, isVideoPlayback, markQualifiedPlay, playing]);

  useEffect(() => {
    const pending = pendingStationQualifiedPlayRef.current;
    if (!pending) return;

    const stationSong = [currentSong, ...queue].find(
      (song): song is PlayerSong =>
        song?.sourceStation?.id === pending.stationId &&
        song.sourceStation.artworkReady === true,
    );
    if (!stationSong?.sourceStation) return;

    pendingStationQualifiedPlayRef.current = null;
    const qualifiedSong = {
      ...pending.song,
      sourceStation: stationSong.sourceStation,
    };
    trackedSongRef.current = playbackSessionKey(qualifiedSong);
    emitEvent(qualifiedSong, "PLAY_START", pending.elapsed);
  }, [currentSong, emitEvent, queue]);

  useEffect(() => {
    const station = currentSong?.sourceStation;
    const remainingTracks = queue.length - currentIndex - 1;
    if (
      !stationMode ||
      !station ||
      (!station.id.startsWith("song-station-") &&
        !station.id.startsWith("artist-station-") &&
        !station.id.startsWith("artist-play-station-")) ||
      remainingTracks > SONG_STATION_REFILL_THRESHOLD
    ) {
      return;
    }

    const previous = songStationRefillRef.current;
    const refill =
      previous?.stationId === station.id
        ? previous
        : {
            stationId: station.id,
            inFlight: false,
            exhausted: false,
            retryAfter: 0,
          };
    songStationRefillRef.current = refill;
    if (refill.inFlight || refill.exhausted || refill.retryAfter > Date.now()) {
      return;
    }

    refill.inFlight = true;
    const excludedSongIds = queue
      .filter((song) => song.sourceStation?.id === station.id)
      .map((song) => song.id);
    const isArtistStation =
      station.id.startsWith("artist-station-") ||
      station.id.startsWith("artist-play-station-");
    void (isArtistStation
      ? refillArtistStation(station, excludedSongIds)
      : refillSongStation(station, excludedSongIds))
      .then((addedTracks) => {
        refill.exhausted = addedTracks === 0;
      })
      .catch(() => {
        refill.retryAfter = Date.now() + SONG_STATION_REFILL_RETRY_DELAY_MS;
      })
      .finally(() => {
        refill.inFlight = false;
      });
  }, [currentIndex, currentSong?.sourceStation, queue, stationMode]);

  useEffect(() => {
    // A fresh toggle must never accept a response from an earlier Autoplay
    // session. Requests are intentionally not cached or reused.
    autoplayGenerationRef.current += 1;
    autoplayRefillKeysRef.current.clear();
    if (autoplayRetryTimerRef.current !== null) {
      window.clearTimeout(autoplayRetryTimerRef.current);
      autoplayRetryTimerRef.current = null;
    }
  }, [autoplayEnabled]);

  useEffect(() => {
    if (!autoplayEnabled || stationMode || !currentSong) return;

    const queuedAutoplaySongs = queue.filter((song, index) =>
      index > currentIndex && song.sourceAutoplay,
    );
    const needed = AUTOPLAY_QUEUE_SIZE - queuedAutoplaySongs.length;
    const seedKey = playbackSessionKey(currentSong);
    const generation = autoplayGenerationRef.current;
    const requestKey = `${generation}:${seedKey}`;
    if (needed <= 0 || autoplayRefillKeysRef.current.has(requestKey)) return;

    autoplayRefillKeysRef.current.add(requestKey);
    const excludedSongIds = [...new Set(queue.map((song) => song.id))];
    const scheduleRetry = () => {
      if (autoplayGenerationRef.current !== generation) return;
      if (autoplayRetryTimerRef.current !== null) return;
      autoplayRetryTimerRef.current = window.setTimeout(() => {
        autoplayRetryTimerRef.current = null;
        setAutoplayRetryNonce((value) => value + 1);
      }, AUTOPLAY_REFILL_RETRY_DELAY_MS);
    };
    void loadAutoplayTracks(currentSong, excludedSongIds, needed)
      .then((tracks) => {
        const player = usePlayerStore.getState();
        // Do not let a response seeded from a previously played song pollute
        // the recommendation block after the listener changes context.
        if (
          player.autoplayEnabled &&
          !player.stationMode &&
          autoplayGenerationRef.current === generation &&
          playbackSessionKey(player.currentSong ?? currentSong) === seedKey
        ) {
          appendAutoplayTracks(tracks);
        }
        if (!tracks.length) scheduleRetry();
      })
      // Autoplay is additive: a transient recommendation failure must never
      // interrupt playback or mutate the listener's manual queue.
      .catch(scheduleRetry)
      .finally(() => {
        autoplayRefillKeysRef.current.delete(requestKey);
      });
  }, [
    appendAutoplayTracks,
    autoplayEnabled,
    currentIndex,
    currentSong,
    queue,
    stationMode,
    autoplayRetryNonce,
  ]);

  useEffect(
    () => () => {
      if (autoplayRetryTimerRef.current !== null) {
        window.clearTimeout(autoplayRetryTimerRef.current);
      }
    },
    [],
  );

  useLayoutEffect(() => {
    playbackTimeSessionRef.current = currentPlaybackSessionKey;
    lastMediaSessionPositionSyncRef.current = 0;
    setPlaybackTimeMs(0);
    resetAudioToStart(audioRef.current);
    resetAudioToStart(vocalAudioRef.current);
  }, [currentPlaybackSessionKey, setPlaybackTimeMs]);

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentPlaybackSessionKey) return;

    playbackTimeSessionRef.current = currentPlaybackSessionKey;
    lastObservedPlaybackTimeRef.current = audio.currentTime;
    syncPlaybackClock(audio, setPlaybackTimeMs);
    syncLockScreenPosition(true);
  }, [currentPlaybackSessionKey, setPlaybackTimeMs, syncLockScreenPosition]);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || playbackTimeSessionRef.current !== currentPlaybackSessionKey)
      return;

    const elapsedSinceLastObservation =
      audio.currentTime - lastObservedPlaybackTimeRef.current;
    if (playing && elapsedSinceLastObservation >= 0) {
      listenedSecondsRef.current += elapsedSinceLastObservation;
    }
    lastObservedPlaybackTimeRef.current = audio.currentTime;
    syncPlaybackClock(audio, setPlaybackTimeMs);
    syncLockScreenPosition();
    markQualifiedPlay();
  }, [
    currentPlaybackSessionKey,
    markQualifiedPlay,
    playing,
    setPlaybackTimeMs,
    syncLockScreenPosition,
  ]);

  const handleSeeking = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || playbackTimeSessionRef.current !== currentPlaybackSessionKey)
      return;

    const jumpedForwardSeconds =
      audio.currentTime - lastObservedPlaybackTimeRef.current;
    const remainingSeconds = audio.duration - audio.currentTime;
    if (
      Number.isFinite(audio.duration) &&
      jumpedForwardSeconds >= LOCK_SCREEN_SEEK_SECONDS &&
      remainingSeconds <= END_SEEK_TOLERANCE_SECONDS
    ) {
      // Do not turn a scrub straight to the final seconds into a qualified
      // listen or a completion. There is no reliable evidence that the user
      // consumed the track, and it must not train their taste profile.
      skippedToEndingRef.current = true;
    }
    lastObservedPlaybackTimeRef.current = audio.currentTime;

    // `seeked` can arrive before the next `timeupdate`. Update the shared
    // clock here so progress, lyrics, and the audio element stay aligned
    // throughout a seek instead of briefly showing the old lyric line.
    syncPlaybackClock(audio, setPlaybackTimeMs);
    syncLockScreenPosition(true);
  }, [currentPlaybackSessionKey, setPlaybackTimeMs, syncLockScreenPosition]);

  useEffect(() => {
    if (audioContextCloseTimerRef.current !== null) {
      window.clearTimeout(audioContextCloseTimerRef.current);
      audioContextCloseTimerRef.current = null;
    }

    let context = audioContextRef.current;
    if (!context) {
      const instrumental = audioRef.current;
      const vocal = vocalAudioRef.current;
      if (!instrumental || !vocal) return;

      context = new AudioContext();
      const masterGain = context.createGain();
      const vocalGain = context.createGain();
      context.createMediaElementSource(instrumental).connect(masterGain);
      context
        .createMediaElementSource(vocal)
        .connect(vocalGain)
        .connect(masterGain);
      masterGain.connect(context.destination);
      audioContextRef.current = context;
      masterGainRef.current = masterGain;
      vocalGainRef.current = vocalGain;
    }

    return () => {
      // React Strict Mode temporarily remounts effects in development. Delaying
      // teardown lets that remount reuse the MediaElementSource nodes, while a
      // real unmount still closes the context and releases its audio resources.
      audioContextCloseTimerRef.current = window.setTimeout(() => {
        if (audioContextRef.current !== context) return;
        audioContextRef.current = null;
        masterGainRef.current = null;
        vocalGainRef.current = null;
        void context.close();
      }, 0);
    };
  }, []);

  useEffect(() => {
    const masterGain = masterGainRef.current;
    if (masterGain)
      masterGain.gain.setTargetAtTime(
        volume,
        audioContextRef.current!.currentTime,
        0.02,
      );
    else if (audioRef.current) audioRef.current.volume = volume;
    videoPlaybackController.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    const vocalGain = vocalGainRef.current;
    if (vocalGain && audioContextRef.current) {
      vocalGain.gain.setTargetAtTime(
        vocalVolume,
        audioContextRef.current.currentTime,
        0.02,
      );
    }
  }, [vocalVolume]);

  useEffect(() => {
    if (playing) resumeAudioContext(audioContextRef.current);
  }, [playing]);

  useEffect(() => {
    for (const audio of [audioRef.current, vocalAudioRef.current]) {
      if (!audio) continue;
      audio.playbackRate = playbackRate;
      audio.defaultPlaybackRate = playbackRate;
    }
    videoPlaybackController.setPlaybackRate(playbackRate);
  }, [playbackRate]);

  useEffect(() => {
    const seekFromEditor = (event: Event) => {
      const timeMs = (event as CustomEvent<{ timeMs?: number }>).detail?.timeMs;
      const audio = audioRef.current;
      if (!audio || !Number.isFinite(timeMs)) return;
      const maxTimeMs = Number.isFinite(audio.duration)
        ? Math.max(0, audio.duration * 1000)
        : Number.MAX_SAFE_INTEGER;
      const nextTimeMs = Math.min(Math.max(0, timeMs as number), maxTimeMs);
      audio.currentTime = nextTimeMs / 1000;
      syncPlaybackClock(audio, setPlaybackTimeMs);
    };

    window.addEventListener("musical:seek", seekFromEditor);
    return () => window.removeEventListener("musical:seek", seekFromEditor);
  }, [setPlaybackTimeMs]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || isMseActive) return;
    if (isVideoPlayback) {
      audio.pause();
      vocalAudioRef.current?.pause();
      return;
    }

    if (!currentSong?.playbackUrl || !playing) {
      audio.pause();
      return;
    }

    void audio.play().catch(() => {
      pause();
    });
  }, [
    currentPlaybackSessionKey,
    currentSong?.playbackUrl,
    pause,
    playing,
    isMseActive,
    isVideoPlayback,
  ]);

  const handleEnded = () => {
    const audio = audioRef.current;
    if (currentSong) {
      markQualifiedPlay();
      if (
        !skippedToEndingRef.current &&
        trackedSongRef.current === playbackSessionKey(currentSong)
      ) {
        emitEvent(currentSong, "PLAY_COMPLETE", listenedSecondsRef.current);
      }
      trackedSongRef.current = null;
      listenedSecondsRef.current = 0;
      skippedToEndingRef.current = false;
    }
    if (
      audio &&
      (repeatMode === 1 || (repeatMode === 2 && playableSongCount === 1))
    ) {
      setPlaybackTimeMs(0);
      const vocal = isStemActive ? vocalAudioRef.current : null;
      replayAudioFromStart(
        audio,
        vocal,
        isMseActive,
        () => playbackTimeSessionRef.current === currentPlaybackSessionKey,
        () => {
          const state = usePlayerStore.getState();
          if (!state.playing) state.togglePlayback();
        },
        pause,
      );
      return;
    }
    next(true);
  };

  const handleNext = useCallback(() => {
    const elapsed = listenedSecondsRef.current;
    const didChangeTrack = next();
    if (!didChangeTrack) return;

    if (currentSong && elapsed > 0) {
      emitEvent(currentSong, "SKIP", elapsed);
    }

    trackedSongRef.current = null;
    listenedSecondsRef.current = 0;
  }, [currentSong, emitEvent, next]);

  const handlePrevious = useCallback(() => {
    const elapsed = listenedSecondsRef.current;
    const didChangeTrack = previous();
    if (!didChangeTrack) return;

    if (currentSong && elapsed > 0) {
      emitEvent(currentSong, "SKIP", elapsed);
    }

    trackedSongRef.current = null;
    listenedSecondsRef.current = 0;
  }, [currentSong, emitEvent, previous]);

  useEffect(() => {
    if (
      !("mediaSession" in navigator) ||
      typeof MediaMetadata === "undefined"
    ) {
      return;
    }

    const mediaSession = navigator.mediaSession;
    const syncMediaSession = () => {
      const mediaSessionArtworkUrl = isVideoPlayback
        ? currentSong?.video?.poster ?? currentSong?.artworkUrl
        : currentSong?.mediaSessionArtworkUrl ?? currentSong?.artworkUrl;
      const isManagedArtwork = Boolean(
        !isVideoPlayback && currentSong?.mediaSessionArtworkUrl,
      );
      mediaSession.metadata = currentSong
        ? new MediaMetadata({
            title: currentSong.title,
            artist: currentSong.artist,
            album: currentSong.album,
            artwork: mediaSessionArtworkUrl
              ? [
                  {
                    src: getAbsoluteArtworkUrl(mediaSessionArtworkUrl),
                    // Desktop Chrome is more reliable when the rendition's
                    // dimensions and MIME type are explicit. Only declare it
                    // for our managed square WebP artwork, not video posters
                    // or external/library originals whose format is unknown.
                    ...(isManagedArtwork
                      ? { sizes: "632x632", type: "image/webp" }
                      : {}),
                  },
                ]
              : [],
          })
        : null;
      // A SING pair pauses both native media elements briefly while it seeks
      // or waits for one stem to buffer. Media Session must reflect the
      // player's intent, not that transient implementation detail; otherwise
      // the iPhone lock screen flickers from Pause to Play during recovery.
      mediaSession.playbackState = playing ? "playing" : "paused";
      syncLockScreenPosition(true);
    };

    syncMediaSession();

    const setAction = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null,
    ) => {
      try {
        mediaSession.setActionHandler(action, handler);
      } catch {
        // Safari may not implement every Media Session action.
      }
    };

    setAction("play", () => {
      if (isVideoPlayback) {
        const playerState = usePlayerStore.getState();
        if (!playerState.playing) playerState.togglePlayback();
        // Invoke play in the hardware/media-session gesture too. The normal
        // React effect remains the fallback while HLS is attaching.
        void videoPlaybackController.play();
        return;
      }
      const audio = audioRef.current;
      const vocal = isStemActive ? vocalAudioRef.current : null;
      const playerState = usePlayerStore.getState();
      if (!audio) return;

      resumeAudioContext(audioContextRef.current);

      const hasReachedEnd =
        audio.ended ||
        (Number.isFinite(audio.duration) &&
          audio.currentTime >= audio.duration);

      if (hasReachedEnd) {
        playerState.setPlaybackTimeMs(0);
        replayAudioFromStart(
          audio,
          vocal,
          isMseActive,
          () => playbackTimeSessionRef.current === currentPlaybackSessionKey,
          () => {
            const state = usePlayerStore.getState();
            if (!state.playing) state.togglePlayback();
          },
          () => usePlayerStore.getState().pause(),
        );
        return;
      }

      if (!playerState.playing) {
        playerState.togglePlayback();
      }

      // Invoke play from the Media Session action itself. Safari can defer the
      // React effect that normally calls play while the device is locked.
      if (audio.paused || hasReachedEnd) {
        const plays = [audio.play()];
        if (vocal) plays.push(vocal.play());
        void Promise.all(plays).catch(() => usePlayerStore.getState().pause());
      }
    });
    setAction("pause", () => {
      if (isVideoPlayback) videoPlaybackController.pause();
      usePlayerStore.getState().pause();
    });
    // iOS may choose either transport or seek icons on the lock screen. Keep
    // both handlers registered so every control the system presents works.
    setAction("nexttrack", handleNext);
    setAction("previoustrack", handlePrevious);
    setAction("seekbackward", () => {
      if (isVideoPlayback) {
        // The controller clamps to the active video's duration.
        const currentTimeMs = usePlayerStore.getState().playbackTimeMs;
        videoPlaybackController.seek(
          Math.max(0, currentTimeMs / 1000 - LOCK_SCREEN_SEEK_SECONDS),
        );
        return;
      }
      const audio = audioRef.current;
      if (audio) {
        const nextTime = Math.max(
          0,
          audio.currentTime - LOCK_SCREEN_SEEK_SECONDS,
        );
        audio.currentTime = nextTime;
        syncPlaybackClock(audio, usePlayerStore.getState().setPlaybackTimeMs);
        syncLockScreenPosition(true);
      }
    });
    setAction("seekforward", () => {
      if (isVideoPlayback) {
        const currentTimeMs = usePlayerStore.getState().playbackTimeMs;
        videoPlaybackController.seek(
          currentTimeMs / 1000 + LOCK_SCREEN_SEEK_SECONDS,
        );
        return;
      }
      const audio = audioRef.current;
      if (audio) {
        const nextTime = Math.min(
          audio.duration || Infinity,
          audio.currentTime + LOCK_SCREEN_SEEK_SECONDS,
        );
        audio.currentTime = nextTime;
        syncPlaybackClock(audio, usePlayerStore.getState().setPlaybackTimeMs);
        syncLockScreenPosition(true);
      }
    });
    setAction("seekto", (details) => {
      if (isVideoPlayback && typeof details.seekTime === "number") {
        videoPlaybackController.seek(details.seekTime);
        return;
      }
      const audio = audioRef.current;
      if (audio && typeof details.seekTime === "number") {
        audio.currentTime = details.seekTime;
        syncPlaybackClock(audio, usePlayerStore.getState().setPlaybackTimeMs);
        syncLockScreenPosition(true);
      }
    });

    const audio = audioRef.current;
    // iOS can replace the lock-screen metadata while a MediaSource URL is
    // attached. Reapply it when the media element is actually ready or starts.
    audio?.addEventListener("loadedmetadata", syncMediaSession);
    audio?.addEventListener("playing", syncMediaSession);
    audio?.addEventListener("pause", syncMediaSession);
    audio?.addEventListener("ended", syncMediaSession);

    return () => {
      audio?.removeEventListener("loadedmetadata", syncMediaSession);
      audio?.removeEventListener("playing", syncMediaSession);
      audio?.removeEventListener("pause", syncMediaSession);
      audio?.removeEventListener("ended", syncMediaSession);
      for (const action of [
        "play",
        "pause",
        "nexttrack",
        "previoustrack",
        "seekbackward",
        "seekforward",
        "seekto",
      ] as const) {
        setAction(action, null);
      }
    };
  }, [
    currentPlaybackSessionKey,
    currentSong,
    handleNext,
    handlePrevious,
    isStemActive,
    isMseActive,
    isVideoPlayback,
    playbackRate,
    playing,
    syncLockScreenPosition,
  ]);

  const toggleMute = () => {
    if (!isExpanded) {
      setIsExpanded(true);
      return;
    }

    if (volume > 0) {
      setVolume(0);
    } else {
      setVolume(lastAudibleVolume);
    }
  };

  return (
    <div
      className={`bottom-0 shrink-0 h-13.5 w-full inset-e-0 fixed z-[calc(var(--z-web-chrome)-1)] min-[484px]:self-end min-[484px]:[grid-area:structure-main-section] min-[484px]:inset-s-[unset] min-[484px]:mb-5 min-[484px]:ps-5 min-[484px]:sticky min-[484px]:max-[999px]:[--contextMenuPosition:fixed] max-[483px]:h-15.25 min-[484px]:w-[calc(100vw-var(--web-navigation-width))] motion-safe:[transition:padding-inline-end_0.3s_cubic-bezier(0.215,0.61,0.355,1)] will-change-[padding-inline-end] ${isSidebarOpen ? "min-[484px]:pe-80" : "min-[484px]:pe-5"}`}
    >
      <audio
        ref={audioRef}
        src={
          isMseActive || isVideoPlayback
            ? undefined
            : currentSong?.playbackUrl || undefined
        }
        preload="metadata"
        onEnded={handleEnded}
        onError={() => {
          if (!isVideoPlayback) pause();
        }}
        onLoadedMetadata={handleLoadedMetadata}
        onSeeking={handleSeeking}
        onTimeUpdate={handleTimeUpdate}
      />
      <audio ref={vocalAudioRef} preload="metadata" aria-hidden />
      {useCompactPlayer ? (
        <CompactPlayerBar
          currentSong={currentSong}
          currentArtworkSrcSet={currentArtworkSrcSet}
          isPlaying={isPlaying}
          isVideoPlayback={isVideoPlayback}
          onOpenVideoPlayer={() => setVideoPlayerOpen(true)}
          onTogglePlayback={handleTogglePlayback}
          onNext={handleNext}
        />
      ) : (
        <DesktopPlayerBar
          audioRef={audioRef}
          currentSong={currentSong}
          queue={queue}
          currentIndex={currentIndex}
          isPlaying={isPlaying}
          shuffleEnabled={shuffleEnabled}
          stationMode={stationMode}
          autoplayEnabled={autoplayEnabled}
          repeatMode={repeatMode}
          isCurrentSongFavorite={isCurrentSongFavorite}
          isExpanded={isExpanded}
          setIsExpanded={setIsExpanded}
          isProgressExpanded={isProgressExpanded}
          setIsProgressExpanded={setIsProgressExpanded}
          volume={volume}
          onSetVolume={setVolume}
          onToggleMute={toggleMute}
          onTogglePlayback={handleTogglePlayback}
          onToggleShuffle={toggleShuffle}
          onCycleRepeatMode={cycleRepeatMode}
          onToggleAutoplay={toggleAutoplay}
          onNext={handleNext}
          onPrevious={handlePrevious}
          onDrawerOpenChange={setIsSidebarOpen}
          isStemActive={isStemActive}
          vocalVolume={vocalVolume}
          isVocalControlExpanded={isVocalControlExpanded}
          onVocalControlExpandedChange={setIsVocalControlExpanded}
          onSetVocalVolume={setVocalVolume}
          onPreviewVocalVolume={previewVocalVolume}
          isVideoPlayback={isVideoPlayback}
          onOpenVideoPlayer={() => setVideoPlayerOpen(true)}
        />
      )}
    </div>
  );
}
