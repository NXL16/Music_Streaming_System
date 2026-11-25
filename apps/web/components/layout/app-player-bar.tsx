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
  playerSongKey,
  usePlayerStore,
  type PlayerSong,
} from "@/lib/player/use-player-store";
import { useFavoriteStore } from "@/lib/favorites/use-favorite-store";
import { useShallow } from "zustand/react/shallow";
import { useWebAudioPlayback } from "@/lib/player/use-web-audio-playback";
import type { PlaybackAudio } from "@/lib/player/playback-audio";
import { usePersistentVolume } from "@/lib/player/use-persistent-volume";
import { syncPlaybackClock } from "@/lib/player/playback-clock";
import { bindAudioMediaSession } from "@/lib/player/audio-media-session";
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
const FORWARD_END_SEEK_THRESHOLD_SECONDS = 10;
const END_SEEK_TOLERANCE_SECONDS = 3;
const SONG_STATION_REFILL_THRESHOLD = 8;
const SONG_STATION_REFILL_RETRY_DELAY_MS = 15_000;
const AUTOPLAY_QUEUE_SIZE = 10;
const AUTOPLAY_REFILL_RETRY_DELAY_MS = 15_000;

function getAbsoluteArtworkUrl(artworkUrl: string): string {
  try {
    return new URL(artworkUrl, window.location.origin).href;
  } catch {
    return artworkUrl;
  }
}

function recentlyPlayedCard(song: PlayerSong): MediaCardProps {
  const sourceAlbumId = song.sourceAlbumId ?? song.albumId;

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

  if (!sourceAlbumId) {
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
      id: sourceAlbumId,
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
      id: sourceAlbumId,
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
  const [vocalVolume, setVocalVolume] = useState(1);
  const { volume, lastAudibleVolume, setVolume } = usePersistentVolume();
  const playbackTimeSessionRef = useRef<string | undefined>(undefined);
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
  const { transport, isStemActive } = useWebAudioPlayback(volume, vocalVolume);
  const audioRef = useMemo<React.RefObject<PlaybackAudio | null>>(
    () => ({ current: transport }),
    [transport],
  );
  const getPlaybackAudio = useCallback(
    (): PlaybackAudio | null => transport,
    [transport],
  );
  const currentPlaybackSessionKey = currentSong
    ? playbackSessionKey(currentSong)
    : undefined;
  const isPlaying = Boolean(currentSong && playing);
  const isVideoPlayback = currentSong?.playbackKind === "video";
  const currentArtworkSrcSet = isVideoPlayback
    ? (currentSong?.video?.posterSrcSet ??
      currentSong?.video?.poster ??
      currentSong?.thumbnailArtworkSrcSet ??
      currentSong?.artworkSrcSet)
    : (currentSong?.thumbnailArtworkSrcSet ?? currentSong?.artworkSrcSet);
  const playableSongCount = useMemo(
    () => queue.filter((song) => song.playbackUrl).length,
    [queue],
  );
  const favoriteSongKeys = useFavoriteStore((state) => state.songKeys);
  const isCurrentSongFavorite = Boolean(
    currentSong && favoriteSongKeys.has(playerSongKey(currentSong)),
  );

  const [isExpanded, setIsExpanded] = useState(false);
  const [isProgressExpanded, setIsProgressExpanded] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isVocalControlExpanded, setIsVocalControlExpanded] = useState(false);
  const [autoplayRetryNonce, setAutoplayRetryNonce] = useState(0);
  const useCompactPlayer = useMediaQuery("(max-width: 739px)");
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

  const previewVocalVolume = useCallback(
    (nextVolume: number) => transport?.setVocalVolume(nextVolume),
    [transport],
  );

  const handleSetVolume = useCallback(
    (nextVolume: number) => {
      const normalizedVolume = Math.min(1, Math.max(0, nextVolume));
      const audio = getPlaybackAudio();
      if (audio) audio.volume = normalizedVolume;
      videoPlaybackController.setVolume(normalizedVolume);
      setVolume(normalizedVolume);
    },
    [setVolume, getPlaybackAudio],
  );

  const handleTogglePlayback = useCallback(() => {
    if (isVideoPlayback && !playing) setVideoPlayerOpen(true);
    if (transport?.ended) setPlaybackTimeMs(0);
    togglePlayback();
  }, [
    isVideoPlayback,
    playing,
    transport,
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
      if (
        eventType === "PLAY_START" &&
        song.sourceStation?.artworkReady === false
      ) {
        return;
      }
      // Media clocks can run a fraction past the catalog duration (notably
      // after buffering or a delayed `ended` event). Keep telemetry within
      // the server-side validity invariant instead of losing the whole event.
      const totalSec = telemetryDurationSeconds(song.durationSec);
      const durationSec = telemetryDurationSeconds(elapsed);
      const payload = {
        songId: song.id,
        eventType,
        durationSec:
          totalSec > 0 ? Math.min(durationSec, totalSec) : durationSec,
        totalSec,
        songTitle: song.title,
        artistName: song.artist,
        albumName: song.album,
        albumId: song.sourceAlbumId ?? song.albumId,
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
      if (
        !isVideoPlayback ||
        !currentSong ||
        event.src !== currentSong.playbackUrl
      )
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
    void (
      isArtistStation
        ? refillArtistStation(station, excludedSongIds)
        : refillSongStation(station, excludedSongIds)
    )
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

    const queuedAutoplaySongs = queue.filter(
      (song, index) => index > currentIndex && song.sourceAutoplay,
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
    setPlaybackTimeMs(0);
  }, [currentPlaybackSessionKey, setPlaybackTimeMs]);

  const handleLoadedMetadata = useCallback(() => {
    const audio = getPlaybackAudio();
    if (!audio || !currentPlaybackSessionKey) return;

    playbackTimeSessionRef.current = currentPlaybackSessionKey;
    lastObservedPlaybackTimeRef.current = audio.currentTime;
    syncPlaybackClock(audio, setPlaybackTimeMs);
  }, [currentPlaybackSessionKey, setPlaybackTimeMs, getPlaybackAudio]);

  const handleTimeUpdate = useCallback(() => {
    const audio = getPlaybackAudio();
    if (!audio || playbackTimeSessionRef.current !== currentPlaybackSessionKey)
      return;

    const elapsedSinceLastObservation =
      audio.currentTime - lastObservedPlaybackTimeRef.current;
    if (playing && elapsedSinceLastObservation >= 0) {
      listenedSecondsRef.current += elapsedSinceLastObservation;
    }
    lastObservedPlaybackTimeRef.current = audio.currentTime;
    syncPlaybackClock(audio, setPlaybackTimeMs);
    markQualifiedPlay();
  }, [
    currentPlaybackSessionKey,
    markQualifiedPlay,
    playing,
    setPlaybackTimeMs,
    getPlaybackAudio,
  ]);

  const handleSeeking = useCallback(() => {
    const audio = getPlaybackAudio();
    if (!audio || playbackTimeSessionRef.current !== currentPlaybackSessionKey)
      return;

    const jumpedForwardSeconds =
      audio.currentTime - lastObservedPlaybackTimeRef.current;
    const remainingSeconds = audio.duration - audio.currentTime;
    if (
      Number.isFinite(audio.duration) &&
      jumpedForwardSeconds >= FORWARD_END_SEEK_THRESHOLD_SECONDS &&
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
  }, [currentPlaybackSessionKey, setPlaybackTimeMs, getPlaybackAudio]);

  useEffect(() => {
    videoPlaybackController.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    videoPlaybackController.setPlaybackRate(playbackRate);
  }, [playbackRate]);

  useEffect(() => {
    const seekFromEditor = (event: Event) => {
      const timeMs = (event as CustomEvent<{ timeMs?: number }>).detail?.timeMs;
      const audio = getPlaybackAudio();
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
  }, [setPlaybackTimeMs, getPlaybackAudio]);

  const handleEnded = useCallback(() => {
    const audio = getPlaybackAudio();
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
      audio.currentTime = 0;
      const state = usePlayerStore.getState();
      if (!state.playing) state.togglePlayback();
      else void audio.play().catch(pause);
      return;
    }
    next(true);
  }, [
    getPlaybackAudio,
    currentSong,
    markQualifiedPlay,
    emitEvent,
    repeatMode,
    playableSongCount,
    setPlaybackTimeMs,
    pause,
    next,
  ]);

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
    const audio = getPlaybackAudio();
    if (!audio) return;
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("seeking", handleSeeking);
    audio.addEventListener("ended", handleEnded);
    if (audio.duration > 0) handleLoadedMetadata();
    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("seeking", handleSeeking);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [
    getPlaybackAudio,
    handleLoadedMetadata,
    handleTimeUpdate,
    handleSeeking,
    handleEnded,
  ]);

  useEffect(() => {
    if (
      !("mediaSession" in navigator) ||
      typeof MediaMetadata === "undefined"
    ) {
      return;
    }

    const mediaSession = navigator.mediaSession;
    const mediaSessionArtworkUrl = isVideoPlayback
      ? (currentSong?.video?.poster ?? currentSong?.artworkUrl)
      : (currentSong?.mediaSessionArtworkUrl ?? currentSong?.artworkUrl);
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

    const hardwarePlay = () => {
      if (isVideoPlayback) {
        const playerState = usePlayerStore.getState();
        if (!playerState.playing) playerState.togglePlayback();
        // Invoke play in the hardware/media-session gesture too. The normal
        // React effect remains the fallback while HLS is attaching.
        void videoPlaybackController.play();
        return;
      }
      const audio = getPlaybackAudio();
      if (!audio) return;
      const state = usePlayerStore.getState();
      if (!state.playing) state.togglePlayback();
      else
        void audio.play().catch(() => {
          if (audio === getPlaybackAudio()) usePlayerStore.getState().pause();
        });
    };
    const hardwarePause = () => {
      usePlayerStore.getState().pause();
      if (isVideoPlayback) videoPlaybackController.pause();
    };
    setAction("play", hardwarePlay);
    setAction("pause", hardwarePause);
    setAction("nexttrack", handleNext);
    setAction("previoustrack", handlePrevious);
    for (const action of ["seekto", "seekbackward", "seekforward"] as const)
      setAction(action, null);
    const audio = isVideoPlayback ? null : getPlaybackAudio();
    const audioSession = audio
      ? bindAudioMediaSession(mediaSession, audio, {
          isPlaying: () => usePlayerStore.getState().playing,
        })
      : undefined;
    const syncState = () => {
      if (audioSession) audioSession.sync();
      else
        mediaSession.playbackState = usePlayerStore.getState().playing
          ? "playing"
          : "paused";
    };
    const unsubscribeState = usePlayerStore.subscribe((state, previous) => {
      const nextSession = state.currentSong
        ? playbackSessionKey(state.currentSong)
        : undefined;
      const previousSession = previous.currentSong
        ? playbackSessionKey(previous.currentSong)
        : undefined;
      if (
        nextSession !== previousSession ||
        state.currentSong?.playbackUrl !== previous.currentSong?.playbackUrl
      ) {
        audioSession?.dispose();
        return;
      }
      if (state.playing !== previous.playing) syncState();
    });
    syncState();
    const unsubscribeVideo = isVideoPlayback
      ? videoPlaybackController.subscribe((event) => {
          if (
            event.type !== "timeupdate" ||
            event.src !== currentSong?.playbackUrl ||
            !Number.isFinite(event.duration) ||
            event.duration <= 0 ||
            !Number.isFinite(event.currentTime)
          )
            return;
          try {
            mediaSession.setPositionState?.({
              duration: event.duration,
              position: Math.max(
                0,
                Math.min(event.currentTime, event.duration),
              ),
              playbackRate: usePlayerStore.getState().playbackRate,
            });
          } catch {
            /* Position reporting is optional. */
          }
        })
      : undefined;
    return () => {
      unsubscribeState();
      unsubscribeVideo?.();
      audioSession?.dispose();
      for (const action of [
        "play",
        "pause",
        "nexttrack",
        "previoustrack",
      ] as const)
        setAction(action, null);
    };
  }, [
    currentPlaybackSessionKey,
    currentSong,
    handleNext,
    handlePrevious,
    isVideoPlayback,
    getPlaybackAudio,
  ]);

  const toggleMute = () => {
    if (!isExpanded) {
      setIsExpanded(true);
      return;
    }

    if (volume > 0) {
      handleSetVolume(0);
    } else {
      handleSetVolume(lastAudibleVolume);
    }
  };

  return (
    <div
      className={`bottom-0 shrink-0 h-13.5 w-full inset-e-0 fixed z-[calc(var(--z-web-chrome)-1)] min-[484px]:self-end min-[484px]:[grid-area:structure-main-section] min-[484px]:inset-s-[unset] min-[484px]:mb-5 min-[484px]:ps-5 min-[484px]:sticky min-[484px]:max-[999px]:[--contextMenuPosition:fixed] max-[483px]:h-15.25 min-[484px]:w-[calc(100vw-var(--web-navigation-width))] motion-safe:[transition:padding-inline-end_0.3s_cubic-bezier(0.215,0.61,0.355,1)] will-change-[padding-inline-end] ${isSidebarOpen ? "min-[484px]:pe-80" : "min-[484px]:pe-5"}`}
    >
      {useCompactPlayer ? (
        <CompactPlayerBar
          audioRef={audioRef}
          currentSong={currentSong}
          currentArtworkSrcSet={currentArtworkSrcSet}
          isPlaying={isPlaying}
          isVideoPlayback={isVideoPlayback}
          volume={volume}
          onSetVolume={handleSetVolume}
          onOpenVideoPlayer={() => setVideoPlayerOpen(true)}
          onTogglePlayback={handleTogglePlayback}
          onPrevious={handlePrevious}
          onNext={handleNext}
          isStemActive={isStemActive}
          vocalVolume={vocalVolume}
          isVocalControlExpanded={isVocalControlExpanded}
          onVocalControlExpandedChange={setIsVocalControlExpanded}
          onSetVocalVolume={setVocalVolume}
          onPreviewVocalVolume={previewVocalVolume}
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
          onSetVolume={handleSetVolume}
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
