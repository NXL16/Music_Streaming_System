"use client";

import {
  type CSSProperties,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  type DragEndEvent,
  type Modifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import AmpPlayPauseButton from "@/components/custom-elements/AmpPlayPauseButton";
import AmpRepeatButton from "@/components/custom-elements/AmpRepeatButton";
import AmpShuffleButton from "@/components/custom-elements/AmpShuffleButton";
import AmpSkipButton from "@/components/custom-elements/AmpSkipButton";
import ExpansionButton from "@/components/custom-elements/ExpansionButton";
import ResponsiveArtwork from "@/components/media/common/responsive-artwork";
import { PlayerBarMarquee } from "../player-bar-marquee";
import { FavoriteSongButton } from "@/components/songs/favorite-song-button";
import Link from "next/link";
import AmpContextMenuButton from "@/components/custom-elements/AmpContextMenuButton";
import AmpPlaybackControlsProgress from "@/components/custom-elements/AmpPlaybackControlsProgress";
import Logo from "@/components/custom-elements/Logo";
import AmpLyrics from "@/components/custom-elements/AmpLyrics";
import {
  usePlayerStore,
  type PlayerSong,
  type RepeatMode,
} from "@/lib/player/use-player-store";
import { ArtistLinks } from "@/components/media/artist-links";
import { formatDuration } from "@/lib/format/duration";
import { useTrackRowSelection } from "@/lib/player/use-track-row-selection";
import { ExplicitBadgeIcon } from "@/components/icons/explicit-badge-icon";
import VolumeControl from "@/components/custom-elements/VolumeControl";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useFavoriteStore } from "@/lib/favorites/use-favorite-store";
import { getSongLyrics } from "@/lib/lyrics/song-lyrics.api";

// The detail modal owns the Pixi lyrics scene. It is only needed after the
// listener opens the expanded player, so keep it out of the desktop controls
// chunk used on every authenticated route.
const MusicPlayDetail = dynamic(() => import("./music-played-detail"), {
  ssr: false,
});

const restrictQueueToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});

function PlayerSongArtwork({ song }: { song: PlayerSong }) {
  return (
    <div
      className="bg-(--override-placeholder-bg-color,var(--placeholder-bg-color,var(--genericJoeColor))) rounded-[inherit] box-border contain-content h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0px) min-w-(--artwork-override-min-width,0px) overflow-hidden relative w-(--artwork-override-width,100%) z-(--z-default) after:content-[''] after:block after:absolute after:top-0 after:w-full after:h-0 after:min-h-full after:min-w-full after:max-h-full after:max-w-full after:rounded-(--afterShadowBorderRadius,inherit) after:shadow-(--artworkShadowInset) after:opacity-(--containerInnerStrokeAlpha,0.25) after:pointer-events-none after:z-[calc(var(--z-default)+1)]"
      style={
        {
          "--aspect-ratio": "1",
          "--placeholder-bg-color": "transparent",
        } as CSSProperties
      }
    >
      <ResponsiveArtwork
        alt=""
        className="block h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0px) min-w-(--artwork-override-min-width,0px) [object-fit:var(--artwork-override-object-fit,fill)] object-(--artwork-override-object-position,center) w-(--artwork-override-width,100%) rounded-[inherit] transition-(--global-transition,opacity_.1s_ease-in)"
        height={40}
        pictureClassName="block size-full"
        role="presentation"
        sizes="40px"
        src="/assets/artwork/1x1.gif"
        srcSet={song.thumbnailArtworkSrcSet ?? song.artworkSrcSet}
        style={{ opacity: 1 }}
        width={40}
      />
    </div>
  );
}

type SortableQueueSongProps = {
  song: PlayerSong;
  userId?: string;
  isFavorite: boolean;
  draggable: boolean;
  selected: boolean;
  active: boolean;
  selectedRowRef: RefObject<HTMLLIElement | null>;
  onSelect: (songId: string) => void;
};

type MarqueeTrackState = {
  songId: string | null;
  active: boolean;
  animating: boolean;
};

function useMarqueeTrackState(currentSongId: string | null) {
  const [state, setState] = useState<MarqueeTrackState>({
    songId: null,
    active: false,
    animating: false,
  });

  const handleOverflowChange = useCallback(
    (active: boolean) => {
      setState({
        songId: currentSongId,
        active,
        animating: false,
      });
    },
    [currentSongId],
  );

  const handleAnimatingChange = useCallback(
    (animating: boolean) => {
      setState((previousState) => ({
        songId: currentSongId,
        active:
          previousState.songId === currentSongId ? previousState.active : false,
        animating,
      }));
    },
    [currentSongId],
  );

  return {
    isActive: state.songId === currentSongId && state.active,
    isAnimating: state.songId === currentSongId && state.animating,
    handleOverflowChange,
    handleAnimatingChange,
  };
}

function SortableQueueSong({
  song,
  userId,
  isFavorite,
  draggable,
  selected,
  active,
  selectedRowRef,
  onSelect,
}: SortableQueueSongProps) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: song.id, disabled: !draggable });

  return (
    <li
      ref={(node) => {
        setNodeRef(node);
        if (selected) selectedRowRef.current = node;
      }}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      onClick={() => onSelect(song.id)}
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
      className={`group ${draggable ? "cursor-grab active:cursor-grabbing" : ""} ${selected ? "selected bg-(--systemQuaternary) [--queueKeylineColor:transparent] [&+_.group]:[--queueKeylineColor:transparent]" : ""} ${active ? "active [--selectionColor:rgba(31,31,31,.04)]! [--selectedTextColor:inherit]! [--contextMenuEllipsisFillOverride:inherit]! bg-(--selectionColor)! dark:[--selectionColor:hsla(0,0%,100%,.05)]!" : ""} ${isDragging ? "opacity-40 z-[calc(var(--z-default)+3)]" : ""} [--artwork-override-height:auto] [--artwork-override-max-width:40px] [--artwork-override-max-height:40px] [--artwork-override-width:40px] [--queueKeylineColor:var(--labelDivider)] items-center rounded-md gap-x-3 grid grid-cols-[[left-edge]_40px_[artwork-edge]_calc(100%-104px)_[title-edge]_40px_[right-edge]] grid-rows-[55px] [outline:none] px-2.5 before:self-start before:[border-top:.5px_solid_var(--queueKeylineColor)] before:content-[''] before:col-[artwork-edge/right-edge] before:row-span-full before:h-0 first:before:col-[left-edge/right-edge] [&.selected]:before:border-t-transparent`}
    >
      <div className="rounded-[3px] col-[left-edge/artwork-edge] row-span-full relative">
        <PlayerSongArtwork song={song} />
      </div>

      <div className="col-[artwork-edge/title-edge] row-span-full overflow-hidden">
        <div className="text-(--selectedTextColor,var(--systemPrimary)) overflow-hidden text-ellipsis whitespace-nowrap">
          {song.title}
        </div>
        <div className="text-(--selectedTextColor,var(--systemSecondary)) mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap">
          {song.artist}
        </div>
      </div>

      <div className="[--controlsOpacity:0] [--timeOpacity:calc(1-var(--controlsOpacity))] items-center grid col-[title-edge/right-edge] row-span-full [grid-template-areas:'time-and-controls'] justify-end group-hover:[--controlsOpacity:1]">
        <div className="text-(--selectedTextColor,var(--systemSecondary)) font-features-['tnum'] [font-variant-numeric:tabular-nums] [grid-area:time-and-controls] opacity-(--timeOpacity,1) z-[calc(var(--z-default)+1)]">
          {formatDuration(song.durationSec)}
        </div>

        <div className="controls">
          <AmpContextMenuButton
            id={`up-next-song-${song.id}`}
            context={{
              kind: "song",
              songId: song.id,
              title: song.title,
              userId,
              isFavorite,
              queueItemId: song.id,
            }}
          />
        </div>
      </div>
    </li>
  );
}

type DesktopPlayerBarProps = {
  audioRef: RefObject<HTMLAudioElement | null>;
  currentSong: PlayerSong | null;
  queue: PlayerSong[];
  currentIndex: number;
  isPlaying: boolean;
  shuffleEnabled: boolean;
  stationMode: boolean;
  repeatMode: RepeatMode;
  playableSongCount: number;
  isCurrentSongFavorite: boolean;
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
  isProgressExpanded: boolean;
  setIsProgressExpanded: (expanded: boolean) => void;
  volume: number;
  onSetVolume: (volume: number) => void;
  onToggleMute: () => void;
  onTogglePlayback: () => void;
  onToggleShuffle: () => void;
  onCycleRepeatMode: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onDrawerOpenChange: (open: boolean) => void;
};

export function DesktopPlayerBar({
  audioRef,
  currentSong,
  queue,
  currentIndex,
  isPlaying,
  shuffleEnabled,
  stationMode,
  repeatMode,
  playableSongCount,
  isCurrentSongFavorite,
  isExpanded,
  setIsExpanded,
  isProgressExpanded,
  setIsProgressExpanded,
  volume,
  onSetVolume,
  onToggleMute,
  onTogglePlayback,
  onToggleShuffle,
  onCycleRepeatMode,
  onNext,
  onPrevious,
  onDrawerOpenChange,
}: DesktopPlayerBarProps) {
  const userId = useAuthStore((state) => state.user?.userId);
  const favoriteSongs = useFavoriteStore((state) => state.songs);
  const favoriteSongIds = useMemo(
    () => new Set(favoriteSongs.map((song) => song.id)),
    [favoriteSongs],
  );
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyricsMounted, setLyricsMounted] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [queueMounted, setQueueMounted] = useState(false);
  const [isOpenMusicPlayer, setIsOpenMusicPlayer] = useState(false);
  const [openMusicPlayerWithLyrics, setOpenMusicPlayerWithLyrics] =
    useState(false);

  const openMusicPlayer = async () => {
    const songId = currentSong?.id;
    let hasLyrics = false;

    if (songId) {
      try {
        hasLyrics = (await getSongLyrics(songId)).length > 0;
      } catch {
        hasLyrics = false;
      }
    }

    if (usePlayerStore.getState().currentSong?.id !== songId) return;
    setOpenMusicPlayerWithLyrics(hasLyrics);
    setIsOpenMusicPlayer(true);
  };
  const {
    activeTrackId: activeQueueSongId,
    clearActiveTrack: clearActiveQueueSong,
    listRef: queueListRef,
    selectTrack: selectQueueSong,
    selectedTrackId: selectedQueueSongId,
  } = useTrackRowSelection<HTMLUListElement>();
  const [stationVisibleQueueIds, setStationVisibleQueueIds] = useState<
    string[]
  >([]);
  const lyricsUnmountTimerRef = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);
  const queueUnmountTimerRef = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);
  const previousStationIndexRef = useRef<number | null>(null);
  const previousStationQueueRef = useRef<PlayerSong[] | null>(null);
  const selectedQueueRowRef = useRef<HTMLLIElement | null>(null);
  const setDrawerOpen = usePlayerStore((state) => state.setDrawerOpen);
  const reorderUpcomingQueue = usePlayerStore(
    (state) => state.reorderUpcomingQueue,
  );
  const clearUpcomingQueue = usePlayerStore(
    (state) => state.clearUpcomingQueue,
  );
  const queueSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    const clearActiveQueueSongOnOutsideSelectedRow = (event: PointerEvent) => {
      if (!selectedQueueRowRef.current?.contains(event.target as Node)) {
        clearActiveQueueSong();
      }
    };

    document.addEventListener(
      "pointerdown",
      clearActiveQueueSongOnOutsideSelectedRow,
    );
    return () =>
      document.removeEventListener(
        "pointerdown",
        clearActiveQueueSongOnOutsideSelectedRow,
      );
  }, [clearActiveQueueSong]);

  useEffect(() => {
    const previousIndex = previousStationIndexRef.current;
    const queueChanged = previousStationQueueRef.current !== queue;
    previousStationIndexRef.current = currentIndex;
    previousStationQueueRef.current = queue;

    const frame = requestAnimationFrame(() => {
      if (!stationMode || currentIndex < 0) {
        setStationVisibleQueueIds([]);
        return;
      }

      const remainingSongs = queue.slice(currentIndex + 1);
      const nextSong = remainingSongs.find((song) => song.playbackUrl);
      const remainingSongIds = new Set(remainingSongs.map((song) => song.id));

      if (
        !queueChanged &&
        previousIndex !== null &&
        currentIndex < previousIndex
      ) {
        const revisitedSongs = queue
          .slice(currentIndex + 1, previousIndex + 1)
          .filter((song) => song.playbackUrl);

        setStationVisibleQueueIds((visibleIds) => [
          ...new Set([
            ...revisitedSongs.map((song) => song.id),
            ...visibleIds.filter((id) => remainingSongIds.has(id)),
          ]),
        ]);
        return;
      }

      setStationVisibleQueueIds((visibleIds) => {
        const remainingVisibleIds = visibleIds.filter((id) =>
          remainingSongIds.has(id),
        );
        return remainingVisibleIds.length > 0
          ? remainingVisibleIds
          : nextSong
            ? [nextSong.id]
            : [];
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [currentIndex, queue, stationMode]);

  const upcomingSongs = useMemo(() => {
    // Play Next/Last may build a queue before the listener starts playback.
    // In that state every queued track is upcoming and must remain visible.
    if (currentIndex < 0) return stationMode ? [] : queue;

    const remainingSongs = queue.slice(currentIndex + 1);
    if (!stationMode) return remainingSongs;

    const songsById = new Map(remainingSongs.map((song) => [song.id, song]));
    const visibleSongs = stationVisibleQueueIds.flatMap((id) => {
      const song = songsById.get(id);
      return song?.playbackUrl ? [song] : [];
    });

    if (visibleSongs.length > 0) return visibleSongs;

    const nextStationSong = remainingSongs.find((song) => song.playbackUrl);
    return nextStationSong ? [nextStationSong] : [];
  }, [currentIndex, queue, stationMode, stationVisibleQueueIds]);

  useEffect(
    () => () => {
      if (lyricsUnmountTimerRef.current)
        clearTimeout(lyricsUnmountTimerRef.current);
      if (queueUnmountTimerRef.current)
        clearTimeout(queueUnmountTimerRef.current);
      setDrawerOpen(false);
      onDrawerOpenChange(false);
    },
    [onDrawerOpenChange, setDrawerOpen],
  );

  const unmountLyricsAfterTransition = () => {
    if (lyricsUnmountTimerRef.current) {
      clearTimeout(lyricsUnmountTimerRef.current);
    }
    lyricsUnmountTimerRef.current = setTimeout(() => {
      setLyricsMounted(false);
      lyricsUnmountTimerRef.current = undefined;
    }, 300);
  };

  const unmountQueueAfterTransition = () => {
    if (queueUnmountTimerRef.current) {
      clearTimeout(queueUnmountTimerRef.current);
    }
    queueUnmountTimerRef.current = setTimeout(() => {
      setQueueMounted(false);
      queueUnmountTimerRef.current = undefined;
    }, 300);
  };

  const toggleLyrics = () => {
    if (!showLyrics) {
      onDrawerOpenChange(true);
      setDrawerOpen(true);
      setLyricsMounted(true);
      if (lyricsUnmountTimerRef.current) {
        clearTimeout(lyricsUnmountTimerRef.current);
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setShowLyrics(true);
          setShowQueue(false);
          if (queueMounted) unmountQueueAfterTransition();
        });
      });
    } else {
      onDrawerOpenChange(false);
      setDrawerOpen(false);
      setShowLyrics(false);
      unmountLyricsAfterTransition();
    }
  };

  const toggleQueue = () => {
    if (!showQueue) {
      onDrawerOpenChange(true);
      setDrawerOpen(true);
      setQueueMounted(true);
      if (queueUnmountTimerRef.current) {
        clearTimeout(queueUnmountTimerRef.current);
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setShowQueue(true);
          setShowLyrics(false);
          if (lyricsMounted) unmountLyricsAfterTransition();
        });
      });
    } else {
      onDrawerOpenChange(false);
      setDrawerOpen(false);
      setShowQueue(false);
      unmountQueueAfterTransition();
    }
  };

  const isExplicit = currentSong?.contentRating === "explicit";
  const currentSongId = currentSong?.id ?? null;
  const titleMarquee = useMarqueeTrackState(currentSongId);
  const secondaryMarquee = useMarqueeTrackState(currentSongId);

  const handleQueueDragEnd = ({ active, over }: DragEndEvent) => {
    if (stationMode || !over || active.id === over.id) return;
    reorderUpcomingQueue(String(active.id), String(over.id));
  };

  return (
    <div className="block">
      <div className="rounded-[1000px] grid grid-cols-[auto_1fr_auto] h-14 max-w-167 px-4 place-items-center relative mx-auto before:backdrop-saturate-220 before:backdrop-blur-lg before:bg-(--glassMaterialBackground) before:rounded-[1000px] before:shadow-[0_10px_40px_var(--glassMaterialShadowColor)] before:content-[''] before:inset-0 before:absolute before:z-(--z-default) after:content-[''] after:block after:h-0 after:min-w-full after:min-h-full after:max-w-full after:max-h-full after:pointer-events-none after:absolute after:top-0 after:w-full after:z-[calc(var(--z-default)+1)] after:rounded-[1000px] after:shadow-[inset_.5px_.5px_var(--glassMaterialInnerStroke),inset_.5px_-.5px_var(--glassMaterialInnerStroke),inset_-.5px_.5px_var(--glassMaterialInnerStroke),inset_-.5px_-.5px_var(--glassMaterialInnerStroke)] after:opacity-10 dark:after:opacity-25">
        <div className="z-[calc(var(--z-default)+1)]">
          <div className="flex gap-2 [--playback-control-button-width:24px] [--playback-control-button-height:24px] [--playback-control-icon-width:30px] [--playback-controls-play-color:var(--systemPrimary)] [--shuffle-repeat-button-width:24px] [--shuffle-repeat-button-height:24px] [--skip-control-color:var(--systemPrimary)] [--skip-icon-width:28px]">
            <AmpShuffleButton
              shuffled={shuffleEnabled && !stationMode}
              disabled={playableSongCount < 2 || stationMode}
              onToggle={onToggleShuffle}
            />

            <div className="flex gap-2 [--playback-control-icon-width:34px] [--playback-control-icon-height:34px] [--playback-controls-play-color:var(--systemPrimary)]">
              <AmpSkipButton
                direction="previous"
                onClick={onPrevious}
                disabled={
                  !currentSong && !queue.some((song) => song.playbackUrl)
                }
              />

              <AmpPlayPauseButton
                mode={!isPlaying ? "play" : "pause"}
                onClick={onTogglePlayback}
                disabled={
                  !currentSong?.playbackUrl &&
                  !queue.some((song) => song.playbackUrl)
                }
              />

              <AmpSkipButton
                direction="next"
                onClick={onNext}
                disabled={
                  !currentSong && !queue.some((song) => song.playbackUrl)
                }
              />
            </div>

            <AmpRepeatButton
              mode={stationMode ? 0 : repeatMode}
              disabled={!currentSong || stationMode}
              onCycle={onCycleRepeatMode}
            />
          </div>
        </div>

        <div className="[--lcd-marquee-offset:0px] [--marquee-line-padding:28px] px-4 [place-self:center_stretch] z-[calc(var(--z-default)+1)]">
          <div slot="lcd">
            <div
              className={`grid [grid-template-areas:'artwork_metadata_after-metadata''progress_progress_progress'] grid-rows-[34px_auto] h-14 place-content-center relative z-(--z-default) ${!currentSong ? "text-(--systemTertiary) gap-0 grid-cols-1 pt-0 place-items-center" : "gap-x-2 grid-cols-[auto_minmax(0,1fr)_auto] pt-2"}`}
            >
              {currentSong ? (
                <>
                  <div
                    className={`aspect-square rounded-md [grid-area:artwork] scale-100 transition-transform duration-150 ease-out hover:scale-110 ${isProgressExpanded ? "opacity-50" : ""}`}
                  >
                    <PlayerSongArtwork song={currentSong} />

                    <button
                      type="button"
                      onClick={() => void openMusicPlayer()}
                      className="bg-[rgba(51,51,51,0.3)] rounded-[inherit] text-white grid inset-0 opacity-0 place-items-center absolute transition-opacity duration-150 ease-out z-(--z-default) hover:opacity-100"
                    >
                      <ExpansionButton />
                    </button>

                    {isOpenMusicPlayer && (
                      <MusicPlayDetail
                        audioRef={audioRef}
                        currentSong={currentSong}
                        initialLyricOpen={openMusicPlayerWithLyrics}
                        onClose={setIsOpenMusicPlayer}
                        volume={volume}
                        onSetVolume={onSetVolume}
                      />
                    )}
                  </div>

                  <div
                    className={`[--lcd-height:100%] [--lcd-justify-text:start] [--lcd-line-padding:0] self-center [grid-area:metadata] group/metadata ${isProgressExpanded ? "opacity-50" : ""} ${isCurrentSongFavorite ? "[--favoriteButtonStarOutline:var(--keyColor)]" : "hover:[--favoriteButtonStarOutline:var(--systemTertiary)]"}`}
                  >
                    <div className="[--favoriteIconSize:11px] [--favoriteButtonSize:16px] [--menu-position-shift:0px]">
                      <div className="[align-items:var(--lcd-justify-text,center)] flex flex-col grow h-[calc(var(--lcd-height,44px)-3px)] justify-center max-w-full overflow-hidden relative">
                        <div className="max-w-full w-full">
                          <div className="w-full text-(--lcd-primary-text-color,var(--systemPrimary)) [--paddle-controls-offset-inline-end:52px] [font:var(--body-emphasized)]">
                            <div>
                              <div
                                className={`items-center box-border flex flex-row [justify-content:var(--lcd-justify-text,center)] overflow-clip relative [text-align:var(--lcd-justify-text,center)] [text-overflow:none] whitespace-nowrap w-full ${titleMarquee.isActive ? "active grow shrink pe-1" : "inactive"} ${titleMarquee.isAnimating ? "is-animating" : ""}`}
                              >
                                <div className="w-auto min-w-0 in-[.inactive]:relative in-[.inactive]:pe-0 in-[.active]:p-(--lcd-line-padding,0_10px)">
                                  <PlayerBarMarquee
                                    key={`title-${currentSong.id}`}
                                    className="w-full h-[calc(var(--body-line-height)*1em)] in-[.active]:[mask:var(--primary-paddle-controls-mask-hover,var(--stopped-marquee-mask,linear-gradient(270deg,transparent_var(--lcd-marquee-offset,35px),#000_calc(var(--lcd-marquee-offset,35px)+15px))))] in-[.active.is-animating]:[mask:var(--primary-paddle-controls-mask-hover,var(--animated-marquee-mask,linear-gradient(90deg,transparent_0,#000_var(--lcd-fade-length-start,15px),#000_calc(100%-15px-var(--lcd-marquee-offset,35px)),transparent_calc(100%-var(--lcd-marquee-offset,35px)))))]"
                                    isPlaybackActive={isPlaying}
                                    onOverflowChange={
                                      titleMarquee.handleOverflowChange
                                    }
                                    onAnimatingChange={
                                      titleMarquee.handleAnimatingChange
                                    }
                                  >
                                    <span className="flex items-center gap-[0.333em]">
                                      <span
                                        className={`[text-decoration:none] text-inherit ${isExplicit ? "" : "pr-0.75"}`}
                                      >
                                        {currentSong.title}
                                      </span>

                                      {isExplicit && (
                                        <span
                                          aria-label="Explicit"
                                          className="text-inherit [text-decoration:none] items-center flex [--explicitBadgeSize:12px] pr-0.75"
                                        >
                                          <ExplicitBadgeIcon />
                                        </span>
                                      )}
                                    </span>
                                  </PlayerBarMarquee>

                                  <div className="max-h-4 absolute -top-px in-[.inactive]:inset-s-[calc(100%+4px)] in-[.active]:inset-e-(--menu-position-shift,26px)">
                                    <div
                                      className={`-ms-1 relative z-[calc(var(--z-default)+1)] transition-opacity duration-120 ${isCurrentSongFavorite ? "opacity-100" : "opacity-0 group-hover/metadata:opacity-100"}`}
                                    >
                                      <FavoriteSongButton
                                        compact
                                        songId={currentSong.id}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="text-(--lcd-secondary-text-color,var(--systemSecondary)) min-h-3.25 relative [transition:color_.1s_ease-in] w-(--lcd-secondary-width,100%) [font:var(--callout-medium)] mt-0.5">
                          <div className="h-5.25 absolute -top-1.25 w-full">
                            <div
                              className={`items-center box-border flex flex-row [justify-content:var(--lcd-justify-text,center)] overflow-clip relative [text-align:var(--lcd-justify-text,center)] [text-overflow:none] whitespace-nowrap w-full ${secondaryMarquee.isActive ? "active grow shrink pe-1 justify-end" : "inactive"} ${secondaryMarquee.isAnimating ? "is-animating" : ""}`}
                            >
                              <div className="min-w-0 w-auto in-[.active]:p-(--lcd-line-padding,0_10px) in-[.inactive]:pe-0 in-[.inactive]:relative">
                                <PlayerBarMarquee
                                  key={`metadata-${currentSong.id}`}
                                  className="w-full box-border h-5.25 p-[3px_0_2px] in-[.active]:[mask:var(--secondary-mask-hover,var(--stopped-marquee-mask,linear-gradient(270deg,transparent_var(--lcd-marquee-offset,35px),#000_calc(var(--lcd-marquee-offset,35px)+15px))))] in-[.active.is-animating]:[mask:var(--secondary-mask-hover,var(--animated-marquee-mask-small,linear-gradient(90deg,transparent_0,#000_var(--lcd-fade-length-start,15px),#000_calc(100%-15px-var(--lcd-marquee-offset,35px)),transparent_calc(100%-var(--lcd-marquee-offset,35px)))))]"
                                  isPlaybackActive={isPlaying}
                                  onOverflowChange={
                                    secondaryMarquee.handleOverflowChange
                                  }
                                  onAnimatingChange={
                                    secondaryMarquee.handleAnimatingChange
                                  }
                                >
                                  <span className="flex items-center gap-[.333em]">
                                    <span className="text-inherit no-underline">
                                      <ArtistLinks
                                        artists={currentSong.artists}
                                        fallbackText={currentSong.artist}
                                        linkClassName="hover:text-(--keyColor) hover:underline"
                                      />
                                    </span>
                                    <span className="text-inherit no-underline">
                                      —
                                    </span>
                                    <span className="text-inherit no-underline">
                                      {currentSong.albumUrl ? (
                                        <Link
                                          href={currentSong.albumUrl}
                                          className="hover:text-(--keyColor) hover:underline"
                                        >
                                          {currentSong.album}
                                        </Link>
                                      ) : (
                                        <span>{currentSong.album}</span>
                                      )}
                                    </span>
                                  </span>
                                </PlayerBarMarquee>
                              </div>
                              <div className="absolute top-0 max-h-4 inset-e-(--menu-position-shift,26px)"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    className={`self-center [grid-area:after-metadata] ${isProgressExpanded ? "opacity-50" : ""}`}
                  >
                    <div className="[--contextMenuEllipsisFillOverride:var(--systemPrimary)] [--contextMenuButtonSize:32px] flex items-center gap-1 pe-1">
                      <AmpContextMenuButton
                        id={`song-${currentSong.id}`}
                        context={{
                          kind: "song",
                          songId: currentSong.id,
                          title: currentSong.title,
                          userId,
                          isFavorite: isCurrentSongFavorite,
                        }}
                      />
                    </div>
                  </div>

                  <div
                    onMouseEnter={() => setIsProgressExpanded(true)}
                    onMouseLeave={() => setIsProgressExpanded(false)}
                    className="[grid-area:progress] py-1 w-full"
                  >
                    <div
                      className={`relative before:content-[''] before:pointer-events-none before:transition-opacity before:duration-260 ${isProgressExpanded ? "before:opacity-100 before:absolute before:h-14 before:-bottom-1.75 before:-inset-x-2 before:backdrop-blur-xs" : "before:opacity-0"}`}
                    >
                      <AmpPlaybackControlsProgress
                        audioRef={audioRef}
                        isProgressExpanded={isProgressExpanded}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <Logo />
              )}
            </div>
          </div>
        </div>

        <div className="z-[calc(var(--z-default)+1)]">
          <div className="flex gap-3.5">
            <div className="flex [--playerPlatterButtonBGFill:transparent] [--playerPlatterButtonIconFill:var(--keyColor)] [--player-action-button-width:24px] text-(--systemPrimary) gap-2.25 -me-1">
              <div className="max-[999px]:hidden">
                <button
                  className={`flex justify-center items-center rounded-sm h-7 relative w-(--player-action-button-width,32px) z-(--z-default) ${showLyrics ? "text-(--keyColor)" : ""}`}
                  onClick={toggleLyrics}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    fill="currentColor"
                    fillRule="evenodd"
                    strokeLinejoin="round"
                    strokeMiterlimit="2"
                    clipRule="evenodd"
                    xmlSpace="preserve"
                  >
                    <path d="m9.67 13.982-2.43 2.474c-.472.471-.79.675-1.145.675-.479 0-.623-.314-.623-1.012v-2.137H5.26c-1.406 0-1.915-.146-2.429-.42a2.877 2.877 0 0 1-1.192-1.192c-.274-.514-.421-1.024-.421-2.429V6.464c0-1.405.147-1.915.421-2.428a2.872 2.872 0 0 1 1.192-1.192c.514-.275 1.023-.421 2.429-.421h7.68c1.406 0 1.915.146 2.429.421a2.86 2.86 0 0 1 1.192 1.192c.274.513.421 1.023.421 2.428v3.477c0 1.405-.147 1.915-.421 2.429a2.866 2.866 0 0 1-1.192 1.192c-.514.274-1.023.42-2.429.42H9.67Zm-.974-.957c.257-.261.608-.408.974-.408h3.27c1.076 0 1.426-.068 1.785-.26.276-.147.484-.356.631-.632.192-.358.26-.709.26-1.784V6.464c0-1.075-.068-1.426-.26-1.784a1.49 1.49 0 0 0-.631-.631c-.359-.192-.709-.26-1.785-.26H5.26c-1.075 0-1.425.068-1.785.26a1.5 1.5 0 0 0-.631.631c-.192.358-.26.709-.26 1.784v3.477c0 1.075.068 1.426.26 1.784.148.276.356.485.631.632.36.192.71.26 1.785.26h.212c.754 0 1.365.611 1.365 1.365v.934l1.859-1.891ZM5.422 8.01c0-.821.67-1.383 1.554-1.383.976 0 1.599.726 1.599 1.634 0 1.73-1.46 2.084-2.242 2.084-.222 0-.381-.148-.381-.329 0-.173.084-.294.372-.364.502-.12 1.005.028 1.274-.491h-.056c-.185.208-.483.242-.771.242-.837 0-1.349-.614-1.349-1.393Zm4.204 0c0-.821.669-1.383 1.553-1.383.976 0 1.6.726 1.6 1.634 0 1.73-1.46 2.084-2.242 2.084-.223 0-.381-.148-.381-.329 0-.173.084-.294.372-.364.502-.12 1.004.028 1.274-.491h-.056c-.186.208-.483.242-.772.242-.837 0-1.348-.614-1.348-1.393Z"></path>
                  </svg>
                </button>
              </div>

              {lyricsMounted &&
                createPortal(
                  <div
                    data-player-drawer
                    className={`min-[1000px]:backdrop-saturate-220 min-[1000px]:backdrop-blur-lg min-[1000px]:bg-(--glassMaterialBackground) min-[1000px]:shadow-[0_10px_40px_var(--glassMaterialShadowColor)] min-[1000px]:h-screen min-[1000px]:overflow-y-hidden min-[1000px]:top-0 border-s-[0.5px] border-s-(--systemQuaternary) bottom-0 inset-e-0 overflow-x-hidden fixed scroll-pt-14.5 top-13.5 w-75 z-[calc(var(--z-web-chrome)+1)] [--side-panel-horizontal-padding:20px] transition-transform duration-300 ease-[cubic-bezier(.215,.61,.355,1)] ${showLyrics ? "translate-x-0" : "translate-x-full"}`}
                  >
                    <div className="h-[calc(100dvh-58px)] overflow-y-auto">
                      <div className="group [--lyrics-linear-gradient:linear-gradient(180deg,#000,transparent)]">
                        <div className="group-hover:opacity-100 [--lyrics-toggle-button-size:26px] bg-(--lyrics-bg) text-[0] my-2.5 mx-4 opacity-0 p-1.25 absolute right-0 align-top z-(--z-default)">
                          <button
                            type="button"
                            onClick={() => void openMusicPlayer()}
                            className="backdrop-blur-[60px] bg-(--systemQuaternary) rounded-lg p-1 relative z-(--z-default)"
                          >
                            <svg
                              className="block h-5 w-5 fill-(--systemSecondary)"
                              xmlns="http://www.w3.org/2000/svg"
                              width="18"
                              height="18"
                              viewBox="0 0 64 64"
                            >
                              <path d="M4.857 27.117c1.247 0 2.15-.935 2.15-2.213v-5.173L6.51 9.196l9.412 9.693L26.02 29.081a2.1 2.1 0 0 0 1.496.623c1.34 0 2.307-.873 2.307-2.213a2.34 2.34 0 0 0-.624-1.62L19.007 15.71 9.314 6.328l10.565.53h5.174c1.247 0 2.244-.873 2.244-2.15 0-1.279-.966-2.182-2.244-2.182H6.478c-2.37 0-3.803 1.433-3.803 3.833v18.544c0 1.247.904 2.213 2.182 2.213ZM39.14 61.432h18.576c2.4 0 3.803-1.434 3.803-3.834V39.054c0-1.246-.874-2.213-2.15-2.213-1.28 0-2.183.935-2.183 2.213v5.205l.53 10.503-9.444-9.693-10.098-10.16c-.405-.436-.935-.623-1.496-.623-1.34 0-2.306.872-2.306 2.212 0 .593.218 1.154.654 1.59l10.16 10.16 9.694 9.382-10.566-.53H39.14c-1.246 0-2.212.872-2.244 2.15 0 1.278.967 2.182 2.244 2.182Z"></path>
                            </svg>
                          </button>
                        </div>

                        <AmpLyrics
                          songId={currentSong?.id}
                          audioRef={audioRef}
                        />
                      </div>
                    </div>
                  </div>,
                  document.body,
                )}

              <button
                onClick={toggleQueue}
                className={`max-[999px]:hidden flex items-center justify-center rounded h-7 relative w-(--player-action-button-width,32px) z-(--z-default) ${showQueue ? "text-(--keyColor)" : ""}`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="currentColor"
                >
                  <path d="M2.634 5.537a.906.906 0 1 0 0-1.813.906.906 0 1 0 0 1.813zm3.192-.325h9.865a.576.576 0 0 0 .585-.578.578.578 0 0 0-.585-.585H5.826a.574.574 0 0 0-.585.585c0 .325.253.578.585.578zM2.634 9.906c.506 0 .91-.404.91-.91a.906.906 0 0 0-.91-.91.906.906 0 0 0-.91.91c0 .506.405.91.91.91zm3.192-.325h9.865a.582.582 0 1 0 0-1.162H5.826a.572.572 0 0 0-.585.577c0 .325.253.585.585.585zm-3.192 4.694a.91.91 0 1 0-.001-1.82.91.91 0 0 0 0 1.82zm3.192-.332h9.865a.576.576 0 0 0 .585-.577.578.578 0 0 0-.585-.585H5.826a.574.574 0 0 0-.585.585c0 .324.253.577.585.577z"></path>
                </svg>
              </button>

              {queueMounted &&
                createPortal(
                  <div
                    data-player-drawer
                    className={`[--side-panel-horizontal-padding:20px] min-[1000px]:[backdrop-filter:saturate(220%)_blur(16px)] min-[1000px]:bg-(--glassMaterialBackground) min-[1000px]:shadow-[0_10px_40px_var(--glassMaterialShadowColor)] min-[1000px]:h-screen min-[1000px]:overflow-y-hidden min-[1000px]:top-0 border-s-[0.5px] border-s-(--systemQuaternary) bottom-0 inset-e-0 overflow-x-hidden fixed scroll-pt-14.5 top-13.5 w-75 z-[calc(var(--z-web-chrome)+1)] transition-transform duration-300 ease-[cubic-bezier(.215,.61,.355,1)] ${showQueue ? "translate-x-0" : "translate-x-full"}`}
                  >
                    <div className="[backdrop-filter:none] bg-transparent flex flex-col pb-3 pe-5 pt-5.75 ps-5 sticky top-0 z-[calc(var(--z-default)+6)]">
                      <div className="flex justify-between text-(--systemPrimary)">
                        <h3 className="pe-2.5 [font:var(--title-2-emphasized)]">
                          Up next
                        </h3>
                        <div className="flex items-center">
                          {!stationMode && upcomingSongs.length > 0 && (
                            <button
                              onClick={clearUpcomingQueue}
                              className="text-(--keyColor) [font:var(--title-3)] px-2.5"
                            >
                              Clear
                            </button>
                          )}
                          <div className="pe-2.5">{/* something */}</div>
                        </div>
                      </div>
                    </div>

                    {upcomingSongs.length > 0 ? (
                      <div className="h-[calc(100dvh-58px)] overflow-y-auto">
                        <div className="px-2.5 min-h-full">
                          <DndContext
                            collisionDetection={closestCenter}
                            modifiers={[restrictQueueToVerticalAxis]}
                            onDragEnd={handleQueueDragEnd}
                            sensors={queueSensors}
                          >
                            <SortableContext
                              items={upcomingSongs.map((song) => song.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              <ul ref={queueListRef}>
                                {upcomingSongs.map((song) => (
                                  <SortableQueueSong
                                    key={song.id}
                                    song={song}
                                    userId={userId}
                                    isFavorite={favoriteSongIds.has(song.id)}
                                    draggable={!stationMode}
                                    selected={selectedQueueSongId === song.id}
                                    active={activeQueueSongId === song.id}
                                    selectedRowRef={selectedQueueRowRef}
                                    onSelect={selectQueueSong}
                                  />
                                ))}
                              </ul>
                            </SortableContext>
                          </DndContext>
                        </div>
                      </div>
                    ) : (
                      <div className="items-center bottom-0 flex [font:var(--callout)] size-full inset-x-0 justify-center m-auto absolute text-center top-0 z-1 min-[1000px]:z-[calc(var(--z-default)+4)] min-[1000px]:absolute">
                        <div
                          slot="empty"
                          className="items-center flex size-full justify-center text-center px-(--side-panel-horizontal-padding,0px)"
                        >
                          No upcoming songs
                        </div>
                      </div>
                    )}
                  </div>,
                  document.body,
                )}

              <VolumeControl
                volume={volume}
                isExpanded={isExpanded}
                setIsExpanded={setIsExpanded}
                onSetVolume={onSetVolume}
                onToggleMute={onToggleMute}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
