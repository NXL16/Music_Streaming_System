"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  useSyncExternalStore,
} from "react";
import { usePlayerStore, type PlayerSong } from "@/lib/player/use-player-store";
import { useFavoriteStore } from "@/lib/favorites/use-favorite-store";
import { useShallow } from "zustand/react/shallow";
import { useMsePlayback } from "@/lib/player/use-mse-playback";
import { usePersistentVolume } from "@/lib/player/use-persistent-volume";
import { sendListeningEvent } from "@/lib/recommendations/listening-events";
import type { MediaCardProps } from "@/components/media/media-card.types";
import { useFormattedArtists } from "@/lib/media/use-formatted-artists";
import { DesktopPlayerBar } from "./player-bar/desktop-player-bar";
import { CompactPlayerBar } from "./player-bar/compact-player-bar";

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
    return {
      id: `stations-${station.id}`,
      resourceId: station.id,
      resourceType: "stations",
      cardType: "station",
      title: station.name,
      subtitle: station.description || "Musical Station",
      description: station.description || "Musical Station",
      imageUrl: station.artworkUrl,
      imageSrcSet: station.artworkSrcSet || station.artworkUrl,
      artworkColors: {
        bg: station.artworkBgColor || "#2c2c2e",
        main: station.artworkBgColor || "#2c2c2e",
      },
      altText: station.name,
    };
  }

  if (song.sourcePlaylist) {
    const playlist = song.sourcePlaylist;
    return {
      id: `playlists-${playlist.id}`,
      resourceId: playlist.id,
      resourceType: "playlists",
      cardType: "collection",
      title: playlist.name,
      subtitle: "Musical",
      imageUrl: playlist.artworkUrl,
      imageSrcSet: playlist.artworkSrcSet || playlist.artworkUrl,
      artworkColors: {
        bg: playlist.artworkBgColor || "#2c2c2e",
        main: playlist.artworkBgColor || "#2c2c2e",
      },
      slug: `/playlist/${encodeURIComponent(playlist.id)}`,
      altText: playlist.name,
    };
  }

  const resourceType = song.albumId ? "albums" : "songs";
  const resourceId = song.albumId ?? song.id;

  return {
    id: `${resourceType}-${resourceId}`,
    resourceId,
    resourceType,
    cardType: "collection",
    title: song.albumId ? song.album || song.title : song.title,
    subtitle: song.artist,
    imageUrl: song.artworkUrl,
    imageSrcSet: song.artworkSrcSet || song.artworkUrl,
    artworkColors: {
      bg: "#2c2c2e",
      main: "#2c2c2e",
    },
    slug: song.albumUrl,
    altText: song.albumId ? song.album || song.title : song.title,
    artists: song.artists?.flatMap((artist) =>
      artist.id && artist.url
        ? [{ id: artist.id, name: artist.name, url: artist.url }]
        : [],
    ),
  };
}

export function AppPlayerBar() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const {
    currentSong,
    queue,
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
  } = usePlayerStore(
    useShallow((state) => ({
      currentSong: state.currentSong,
      queue: state.queue,
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
  const currentArtists = useFormattedArtists({
    artists: currentSong?.artists,
    fallbackText: currentSong?.artist,
  });
  const favoriteSongs = useFavoriteStore((state) => state.songs);
  const isCurrentSongFavorite = Boolean(
    currentSong && favoriteSongs.some((song) => song.id === currentSong.id),
  );

  const [isExpanded, setIsExpanded] = useState(false);
  const [isProgressExpanded, setIsProgressExpanded] = useState(false);
  const [isSecondaryMarqueeActive, setIsSecondaryMarqueeActive] =
    useState(false);
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

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

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
    if (!currentSong) return;

    const didChangeTrack = next();
    if (!didChangeTrack) return;

    if (trackedSongRef.current === currentSong.id) {
      emitEvent(currentSong, "SKIP", audioRef.current?.currentTime);
    }

    trackedSongRef.current = null;
  }, [currentSong, emitEvent, next]);

  const handlePrevious = useCallback(() => {
    if (!currentSong) return;

    const didChangeTrack = previous();
    if (!didChangeTrack) return;

    if (trackedSongRef.current === currentSong.id) {
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

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  function useMediaQuery(query: string) {
    const subscribe = useCallback(
      (onStoreChange: () => void) => {
        const media = window.matchMedia(query);

        media.addEventListener("change", onStoreChange);
        return () => media.removeEventListener("change", onStoreChange);
      },
      [query],
    );

    const getSnapshot = useCallback(
      () => window.matchMedia(query).matches,
      [query],
    );

    return useSyncExternalStore(subscribe, getSnapshot, () => false);
  }

  const useCompactPlayer = useMediaQuery("(max-width: 739px)");

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
        onTimeUpdate={markQualifiedPlay}
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
          currentArtworkSrcSet={currentArtworkSrcSet}
          currentArtists={currentArtists}
          queue={queue}
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
          isSecondaryMarqueeActive={isSecondaryMarqueeActive}
          setIsSecondaryMarqueeActive={setIsSecondaryMarqueeActive}
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
