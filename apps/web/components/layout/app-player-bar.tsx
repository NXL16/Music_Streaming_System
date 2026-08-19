"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useLayoutEffect,
  useMemo,
} from "react";
import { usePlayerStore, type PlayerSong } from "@/lib/player/use-player-store";
import { useFavoriteStore } from "@/lib/favorites/use-favorite-store";
import { useShallow } from "zustand/react/shallow";
import { useMsePlayback } from "@/lib/player/use-mse-playback";
import { usePersistentVolume } from "@/lib/player/use-persistent-volume";
import { sendListeningEvent } from "@/lib/recommendations/listening-events";
import type {
  MediaArtwork,
  MediaCardProps,
} from "@/lib/media/media-card.types";
import { getCoverArtwork } from "@/lib/media/artwork-slots";
import { CompactPlayerBar } from "./player-bar/compact-player-bar";
import { useMediaQuery } from "@/hooks/use-media-query";
import { createAndHydrateMediaResourceCard } from "@/lib/media/normalize-media-resource";
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
        subtitle: station.description || "Musical Station",
        description: station.description || "Musical Station",
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

  const resourceType = song.albumId ? "albums" : "songs";
  const resourceId = song.albumId ?? song.id;
  const title = song.albumId ? song.album || song.title : song.title;

  return createAndHydrateMediaResourceCard(
    {
      id: resourceId,
      type: resourceType,
      name: title,
      artistName: song.artist,
      artwork: { url: song.artworkUrl },
      contentRating: song.albumId ? song.contentRating : undefined,
    },
    {
      cardType: "collection",
      slug: song.albumId ? song.albumUrl : song.url,
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

export function AppPlayerBar() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playbackTimeSongIdRef = useRef<string | undefined>(undefined);
  const {
    currentSong,
    queue,
    currentIndex,
    playing,
    shuffleEnabled,
    stationMode,
    repeatMode,
    togglePlayback,
    toggleShuffle,
    cycleRepeatMode,
    pause,
    next,
    previous,
    setPlaybackTimeMs,
    playbackRate,
  } = usePlayerStore(
    useShallow((state) => ({
      currentSong: state.currentSong,
      queue: state.queue,
      currentIndex: state.currentIndex,
      playing: state.playing,
      shuffleEnabled: state.shuffleEnabled,
      stationMode: state.stationMode,
      repeatMode: state.repeatMode,
      togglePlayback: state.togglePlayback,
      toggleShuffle: state.toggleShuffle,
      cycleRepeatMode: state.cycleRepeatMode,
      pause: state.pause,
      next: state.next,
      previous: state.previous,
      setPlaybackTimeMs: state.setPlaybackTimeMs,
      playbackRate: state.playbackRate,
    })),
  );
  const { isMseActive } = useMsePlayback(audioRef);
  const isPlaying = Boolean(currentSong && playing);
  const currentArtworkSrcSet =
    currentSong?.thumbnailArtworkSrcSet ?? currentSong?.artworkSrcSet;
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
  const useCompactPlayer = useMediaQuery("(max-width: 739px)");
  const { volume, lastAudibleVolume, setVolume } = usePersistentVolume();
  const trackedSongRef = useRef<string | null>(null);

  const emitEvent = useCallback(
    (
      song: PlayerSong,
      eventType: "PLAY_START" | "PLAY_COMPLETE" | "SKIP",
      elapsed?: number,
    ) => {
      void sendListeningEvent({
        songId: song.id,
        eventType,
        durationSec: elapsed ?? 0,
        totalSec: song.durationSec ?? 0,
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
      });
    },
    [],
  );

  useEffect(() => {
    trackedSongRef.current = null;
  }, [currentSong?.id]);

  const markQualifiedPlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong || !playing) return;
    if (trackedSongRef.current === currentSong.id) return;
    if (audio.currentTime < LISTENING_QUALIFY_SECONDS) return;

    trackedSongRef.current = currentSong.id;
    emitEvent(currentSong, "PLAY_START", audio.currentTime);
  }, [currentSong, emitEvent, playing]);

  useLayoutEffect(() => {
    playbackTimeSongIdRef.current = undefined;
    setPlaybackTimeMs(0);
  }, [currentSong?.id, setPlaybackTimeMs]);

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    const songId = currentSong?.id;
    if (!audio || !songId) return;

    playbackTimeSongIdRef.current = songId;
    setPlaybackTimeMs(Math.floor(audio.currentTime * 1000));
  }, [currentSong?.id, setPlaybackTimeMs]);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || playbackTimeSongIdRef.current !== currentSong?.id) return;

    setPlaybackTimeMs(Math.floor(audio.currentTime * 1000));
    markQualifiedPlay();
  }, [currentSong?.id, markQualifiedPlay, setPlaybackTimeMs]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.defaultPlaybackRate = playbackRate;
    }
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
      setPlaybackTimeMs(Math.round(nextTimeMs));
    };

    window.addEventListener("musical:seek", seekFromEditor);
    return () => window.removeEventListener("musical:seek", seekFromEditor);
  }, [setPlaybackTimeMs]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || isMseActive) return;

    if (!currentSong?.playbackUrl || !playing) {
      audio.pause();
      return;
    }

    void audio.play().catch(() => {
      pause();
    });
  }, [currentSong?.id, currentSong?.playbackUrl, pause, playing, isMseActive]);

  const handleEnded = () => {
    const audio = audioRef.current;
    if (currentSong) {
      markQualifiedPlay();
      if (trackedSongRef.current === currentSong.id) {
        emitEvent(currentSong, "PLAY_COMPLETE", audio?.currentTime);
      }
      trackedSongRef.current = null;
    }
    if (
      audio &&
      (repeatMode === 1 || (repeatMode === 2 && playableSongCount === 1))
    ) {
      audio.currentTime = 0;
      void audio.play().catch(pause);
      return;
    }
    next(true);
  };

  const handleNext = useCallback(() => {
    const didChangeTrack = next();
    if (!didChangeTrack) return;

    if (currentSong && trackedSongRef.current === currentSong.id) {
      emitEvent(currentSong, "SKIP", audioRef.current?.currentTime);
    }

    trackedSongRef.current = null;
  }, [currentSong, emitEvent, next]);

  const handlePrevious = useCallback(() => {
    const didChangeTrack = previous();
    if (!didChangeTrack) return;

    if (currentSong && trackedSongRef.current === currentSong.id) {
      emitEvent(currentSong, "SKIP", audioRef.current?.currentTime);
    }

    trackedSongRef.current = null;
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
      mediaSession.metadata = currentSong
        ? new MediaMetadata({
            title: currentSong.title,
            artist: currentSong.artist,
            album: currentSong.album,
            artwork: currentSong.artworkUrl
              ? [
                  {
                    src: getAbsoluteArtworkUrl(currentSong.artworkUrl),
                  },
                ]
              : [],
          })
        : null;
      mediaSession.playbackState =
        audioRef.current?.paused || audioRef.current?.ended
          ? "paused"
          : "playing";
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
      const audio = audioRef.current;
      const playerState = usePlayerStore.getState();
      if (!audio) return;

      const hasReachedEnd =
        audio.ended ||
        (Number.isFinite(audio.duration) &&
          audio.currentTime >= audio.duration);
      if (hasReachedEnd) {
        audio.currentTime = 0;
      }

      if (!playerState.playing) {
        playerState.togglePlayback();
      }

      // Invoke play from the Media Session action itself. Safari can defer the
      // React effect that normally calls play while the device is locked.
      if (audio.paused || hasReachedEnd) {
        void audio.play().catch(() => usePlayerStore.getState().pause());
      }
    });
    setAction("pause", () => usePlayerStore.getState().pause());
    setAction("nexttrack", handleNext);
    setAction("previoustrack", handlePrevious);
    setAction("seekbackward", () => {
      const audio = audioRef.current;
      if (audio)
        audio.currentTime = Math.max(
          0,
          audio.currentTime - LOCK_SCREEN_SEEK_SECONDS,
        );
    });
    setAction("seekforward", () => {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = Math.min(
          audio.duration || Infinity,
          audio.currentTime + LOCK_SCREEN_SEEK_SECONDS,
        );
      }
    });
    setAction("seekto", (details) => {
      const audio = audioRef.current;
      if (audio && typeof details.seekTime === "number") {
        audio.currentTime = details.seekTime;
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
  }, [currentSong, handleNext, handlePrevious, playing]);

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
        src={isMseActive ? undefined : currentSong?.playbackUrl || undefined}
        preload="metadata"
        onEnded={handleEnded}
        onError={pause}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
      />
      {useCompactPlayer ? (
        <CompactPlayerBar
          currentSong={currentSong}
          currentArtworkSrcSet={currentArtworkSrcSet}
          isPlaying={isPlaying}
          onTogglePlayback={togglePlayback}
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
          repeatMode={repeatMode}
          playableSongCount={playableSongCount}
          isCurrentSongFavorite={isCurrentSongFavorite}
          isExpanded={isExpanded}
          setIsExpanded={setIsExpanded}
          isProgressExpanded={isProgressExpanded}
          setIsProgressExpanded={setIsProgressExpanded}
          volume={volume}
          onSetVolume={setVolume}
          onToggleMute={toggleMute}
          onTogglePlayback={togglePlayback}
          onToggleShuffle={toggleShuffle}
          onCycleRepeatMode={cycleRepeatMode}
          onNext={handleNext}
          onPrevious={handlePrevious}
          onDrawerOpenChange={setIsSidebarOpen}
        />
      )}
    </div>
  );
}
