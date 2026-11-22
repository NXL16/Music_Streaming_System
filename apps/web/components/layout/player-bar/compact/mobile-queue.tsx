import AmpShuffleButton from "@/components/custom-elements/AmpShuffleButton";
import NowPlaying from "./now-playing";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  countShuffleableManualSongs,
  playerSongKey,
  usePlayerStore,
  type PlayerSong,
} from "@/lib/player/use-player-store";
import AmpRepeatButton from "@/components/custom-elements/AmpRepeatButton";
import M404AutoPlay from "@/components/custom-elements/m404-playback-controls-autoplay";
import SortableQueueSong from "../queue-song-row";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useFavoriteStore } from "@/lib/favorites/use-favorite-store";
import { bindNativePullToDismiss } from "@/lib/gestures/native-pull-to-dismiss";
import AutoPlayIcon from "@/components/icons/auto-play-icon";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  type DragEndEvent,
  type Modifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

type MobileQueueProps = Omit<
  ComponentProps<typeof NowPlaying>,
  "containerClassName" | "style" | "onTogglePlayback"
> & {
  onPullDown: (offset: number) => void;
  onPullEnd: () => void;
};

const REPEAT_ALL_MASK_PATH =
  "M3.325 33.616c1.847 0 3.293-1.456 3.293-3.325v-2.406c0-4.968 3.339-8.08 8.667-8.08H37.13v6.48c0 1.538.914 2.441 2.44 2.441.721 0 1.33-.254 1.833-.669l11.475-9.596c1.168-.986 1.2-2.564 0-3.557L41.403 5.297a2.8 2.8 0 0 0-1.834-.665c-1.525 0-2.439.9-2.439 2.441v6.252H15.715C6.079 13.325 0 18.558 0 27.15v3.141a3.29 3.29 0 0 0 3.325 3.325m57.35-3.244c-1.864 0-3.314 1.457-3.314 3.326v2.406c0 4.968-3.339 8.08-8.646 8.08h-21.84v-6.47c0-1.537-.936-2.44-2.466-2.44-.7 0-1.327.254-1.829.669L11.1 45.539c-1.167 1.007-1.178 2.564 0 3.557l11.48 9.607a2.87 2.87 0 0 0 1.83.665c1.529 0 2.464-.9 2.464-2.441v-6.263H48.29c9.636 0 15.71-5.234 15.71-13.825v-3.141c0-1.87-1.457-3.326-3.325-3.326";

const REPEAT_ONE_MASK_PATH =
  "M3.32 33.913c1.93 0 3.29-1.36 3.29-3.32v-2.404c0-4.96 3.333-8.069 8.654-8.069h14.337v6.472c0 1.536.913 2.437 2.436 2.437.72 0 1.33-.254 1.83-.667l11.465-9.584c1.183-1.006 1.194-2.56 0-3.552L33.868 5.632a2.8 2.8 0 0 0-1.831-.664c-1.523 0-2.436.898-2.436 2.438v6.243H15.694C6.07 13.649 0 18.875 0 27.455v3.137c0 1.95 1.374 3.321 3.32 3.321m57.272-3.24c-1.946 0-3.31 1.36-3.31 3.321v2.403c0 4.961-3.333 8.069-8.633 8.069H26.838v-6.46c0-1.536-.935-2.438-2.462-2.438-.699 0-1.325.254-1.826.668L11.085 45.82c-1.165 1.007-1.176 2.561 0 3.553l11.465 9.594c.5.41 1.127.663 1.826.663 1.527 0 2.462-.897 2.462-2.437v-6.255h21.386c9.623 0 15.69-5.226 15.69-13.806v-3.137c0-1.95-1.37-3.32-3.322-3.32zm.128-5.696c1.998 0 3.28-1.138 3.28-3.344V8.216c0-2.306-1.58-3.845-3.853-3.845-1.8 0-2.968.568-4.34 1.618l-3.799 2.85c-.95.703-1.24 1.262-1.24 2.092 0 1.208.906 2.04 2.15 2.04.572 0 1.042-.168 1.527-.538l2.717-2.15h.268v11.35c0 2.206 1.285 3.344 3.29 3.344";

const SHUFFLE_MASK_PATH =
  "M0 46.153c0 1.707 1.328 2.952 3.111 2.952h6.317c4.623 0 7.384-1.397 10.43-5.03l16.316-19.62c2.305-2.762 4.11-3.725 7.288-3.725h5.19v5.66c0 1.423.858 2.276 2.269 2.276.646 0 1.228-.235 1.67-.617l10.605-8.871c1.077-.89 1.067-2.325 0-3.265L52.592 7.036a2.64 2.64 0 0 0-1.671-.597c-1.411 0-2.27.833-2.27 2.251v6.137h-5.048c-4.87 0-7.993 1.319-11.495 5.538l-15.83 19.091c-2.267 2.694-4.198 3.765-7.285 3.765H3.111C1.336 43.221 0 44.477 0 46.153m0-28.37c0 1.675 1.336 2.951 3.111 2.951h5.59c3.105 0 5.33 1.06 7.576 3.745l16.104 19.394c3.219 3.848 6.566 5.235 11.193 5.235h5.077v6.202c0 1.418.859 2.251 2.27 2.251.646 0 1.228-.234 1.67-.597l10.605-8.87c1.077-.91 1.067-2.346 0-3.286l-10.604-8.857a2.54 2.54 0 0 0-1.671-.617c-1.411 0-2.27.833-2.27 2.255v5.636h-4.935c-3.236 0-5.335-1.09-7.58-3.775L19.858 19.86c-3.047-3.633-6.1-5.03-10.724-5.03H3.111C1.328 14.83 0 16.076 0 17.783";

const AUTOPLAY_MASK_PATH =
  "M0 32c0 9.048 5.805 14.99 14.353 14.99 4.485 0 8.308-1.888 12.313-5.766l5.336-5.167 5.332 5.167c4.008 3.878 7.828 5.766 12.313 5.766C58.195 46.99 64 41.048 64 32s-5.805-14.99-14.353-14.99c-4.485 0-8.305 1.888-12.313 5.766l-5.332 5.167-5.336-5.167c-4.005-3.878-7.828-5.766-12.313-5.766C5.805 17.01 0 22.952 0 32m5.928 0c0-5.521 3.41-9.058 8.425-9.058 2.803 0 5.304 1.357 8.163 4.056L27.824 32l-5.311 5.002c-2.859 2.699-5.36 4.056-8.16 4.056-5.015 0-8.425-3.537-8.425-9.058m30.248 0 5.308-5.002c2.862-2.699 5.363-4.056 8.163-4.056 5.018 0 8.425 3.537 8.425 9.058s-3.407 9.058-8.425 9.058c-2.796 0-5.298-1.357-8.16-4.056z";

type QueueHeaderIconProps = {
  active: boolean;
  children: ReactNode;
  iconOffset: number;
  iconSize: number;
  maskId: string;
  path: string;
};

type QueueSongListProps = {
  draggable: boolean;
  favoriteSongKeys: ReadonlySet<string>;
  onPlay: (songId: string) => void;
  songs: PlayerSong[];
  userId?: string;
};

const restrictQueueToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});

function QueueHeaderIcon({
  active,
  children,
  iconOffset,
  iconSize,
  maskId,
  path,
}: QueueHeaderIconProps) {
  return (
    <div className="queue-header-icon">
      <svg
        className={`invertible-mask ${active ? "invertible-mask--inverted" : "invertible-mask--not-inverted"}`}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 28 28"
        width="28"
        height="28"
        role="presentation"
      >
        <mask id={maskId}>
          <rect
            width="100%"
            height="100%"
            fill={active ? "white" : "black"}
          ></rect>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 64 64"
            width={iconSize}
            height={iconSize}
            x={iconOffset}
            y={iconOffset}
            fill={active ? "black" : "white"}
          >
            <path d={path}></path>
          </svg>
        </mask>
        <rect width="100%" height="100%" mask={`url(#${maskId})`}></rect>
      </svg>

      {children}
    </div>
  );
}

function QueueSongList({
  draggable,
  favoriteSongKeys,
  onPlay,
  songs,
  userId,
}: QueueSongListProps) {
  return (
    <ul className="queue-list">
      {songs.map((song) => (
        <SortableQueueSong
          key={playerSongKey(song)}
          song={song}
          userId={userId}
          isFavorite={favoriteSongKeys.has(playerSongKey(song))}
          draggable={draggable}
          dragHandle={draggable}
          selected={false}
          onSelect={onPlay}
        />
      ))}
    </ul>
  );
}

export default function MobileQueue(props: MobileQueueProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickyMarkerRef = useRef<HTMLDivElement>(null);
  const isRestoringScrollRef = useRef(false);
  const [isSticking, setIsSticking] = useState(false);
  const isQueueDraggingRef = useRef(false);
  const pullCallbacksRef = useRef({
    onPullDown: props.onPullDown,
    onPullEnd: props.onPullEnd,
  });

  useEffect(() => {
    pullCallbacksRef.current = {
      onPullDown: props.onPullDown,
      onPullEnd: props.onPullEnd,
    };
  }, [props.onPullDown, props.onPullEnd]);

  useEffect(() => {
    const root = scrollRef.current;
    const marker = stickyMarkerRef.current;
    if (!root || !marker) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (isRestoringScrollRef.current || !entry?.rootBounds) return;
        setIsSticking(
          !entry.isIntersecting &&
            entry.boundingClientRect.bottom <= entry.rootBounds.top,
        );
      },
      { root, threshold: 0 },
    );
    observer.observe(marker);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    return bindNativePullToDismiss(root, () => pullCallbacksRef.current, {
      shouldIgnoreTarget: (target) =>
        target instanceof Element &&
        Boolean(target.closest(".queue-drag-handle")),
    });
  }, []);

  const shuffleEnabled = usePlayerStore((state) => state.shuffleEnabled);
  const stationMode = usePlayerStore((state) => state.stationMode);
  const onToggleShuffle = usePlayerStore((state) => state.toggleShuffle);
  const repeatMode = usePlayerStore((state) => state.repeatMode);
  const onCycleRepeatMode = usePlayerStore((state) => state.cycleRepeatMode);
  const isRepeatActive = !stationMode && repeatMode !== 0;
  const isRepeatOne = !stationMode && repeatMode === 1;
  const autoplayEnabled = usePlayerStore((state) => state.autoplayEnabled);
  const onToggleAutoplay = usePlayerStore((state) => state.toggleAutoplay);
  const playQueueSong = usePlayerStore((state) => state.playQueueSong);
  const reorderUpcomingQueue = usePlayerStore(
    (state) => state.reorderUpcomingQueue,
  );
  const queueSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );
  const shuffleableManualSongCount = usePlayerStore((state) =>
    countShuffleableManualSongs(state.queue, state.currentIndex),
  );
  const isShuffleActive =
    shuffleEnabled && !stationMode && shuffleableManualSongCount >= 2;
  const isAutoplayActive = autoplayEnabled;

  const handleToggleShuffle = () => {
    const scrollContainer = scrollRef.current;
    const scrollTop = scrollContainer?.scrollTop;
    const shouldPreserveStickyState = isSticking && scrollTop !== undefined;

    if (shouldPreserveStickyState) {
      isRestoringScrollRef.current = true;
    }

    onToggleShuffle();

    if (!shouldPreserveStickyState || !scrollContainer) return;

    requestAnimationFrame(() => {
      scrollContainer.scrollTop = scrollTop;

      requestAnimationFrame(() => {
        isRestoringScrollRef.current = false;
        const marker = stickyMarkerRef.current;
        const rootBounds = scrollContainer.getBoundingClientRect();
        const markerBounds = marker?.getBoundingClientRect();

        if (markerBounds) {
          setIsSticking(markerBounds.bottom <= rootBounds.top);
        }
      });
    });
  };
  const { currentSong } = props;
  const queue = usePlayerStore((state) => state.queue);
  const currentIndex = usePlayerStore((state) => state.currentIndex);
  const userId = useAuthStore((state) => state.user?.userId);
  const favoriteSongKeys = useFavoriteStore((state) => state.songKeys);
  const upcomingSongs = useMemo(() => {
    const remaining = queue.slice(currentIndex + 1);
    if (!stationMode) return remaining;
    const next = remaining.find((song) => song.playbackUrl);
    return currentIndex >= 0 && next ? [next] : [];
  }, [queue, currentIndex, stationMode]);
  const { manualUpcomingSongs, autoplayUpcomingSongs } = useMemo(() => {
    const manual: PlayerSong[] = [];
    const autoplay: PlayerSong[] = [];

    for (const song of upcomingSongs) {
      if (song.sourceAutoplay) autoplay.push(song);
      else manual.push(song);
    }

    return {
      manualUpcomingSongs: manual,
      autoplayUpcomingSongs: autoplay,
    };
  }, [upcomingSongs]);
  const hasManualUpcomingSongs = manualUpcomingSongs.length > 0;
  const hasAutoplayUpcomingSongs = autoplayUpcomingSongs.length > 0;
  const isAutoplayOnly = !hasManualUpcomingSongs && hasAutoplayUpcomingSongs;
  const canReorderManualSongs = !stationMode && manualUpcomingSongs.length > 1;
  const canReorderAutoplaySongs =
    !stationMode && autoplayUpcomingSongs.length > 1;

  const handlePlayQueueSong = (songId: string) => {
    if (!isQueueDraggingRef.current) playQueueSong(songId);
  };

  const handleQueueDragStart = () => {
    isQueueDraggingRef.current = true;
  };

  const handleQueueDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    reorderUpcomingQueue(String(active.id), String(over.id));
  };

  const clearQueueDragState = () => {
    requestAnimationFrame(() => {
      isQueueDraggingRef.current = false;
    });
  };

  return (
    <div
      ref={scrollRef}
      className={`up-next-mobile-queue ${isSticking ? "now-playing-cropped" : ""}`}
    >
      <NowPlaying
        {...props}
        containerClassName="now-playing__queue"
        style={{ opacity: isSticking ? 0 : 1 }}
      />

      <div className="queue-section queue-section--playing-next">
        <div
          ref={stickyMarkerRef}
          aria-hidden="true"
          className="h-px -mb-px shrink-0 pointer-events-none"
        />
        <div
          className={`queue-header queue-header--sticky ${isSticking ? "is-sticking" : ""}`}
        >
          <div>
            <h4 className="queue-header__title">
              {isAutoplayOnly ? "AutoPlay" : "Playing Next"}
            </h4>
            {isAutoplayOnly && (
              <p className="queue-header__caption">
                Similar music will keep playing
              </p>
            )}
          </div>

          <div className="queue-controls">
            <QueueHeaderIcon
              active={isShuffleActive}
              maskId="uid-3"
              iconSize={18}
              iconOffset={5}
              path={SHUFFLE_MASK_PATH}
            >
              <AmpShuffleButton
                shuffled={isShuffleActive}
                disabled={
                  !currentSong ||
                  shuffleableManualSongCount < 2 ||
                  stationMode ||
                  currentSong.sourceAutoplay
                }
                onToggle={handleToggleShuffle}
              />
            </QueueHeaderIcon>

            <QueueHeaderIcon
              active={isRepeatActive}
              maskId="uid-4"
              iconSize={18}
              iconOffset={5}
              path={isRepeatOne ? REPEAT_ONE_MASK_PATH : REPEAT_ALL_MASK_PATH}
            >
              <AmpRepeatButton
                mode={stationMode ? 0 : repeatMode}
                disabled={
                  !currentSong || stationMode || currentSong.sourceAutoplay
                }
                onCycle={onCycleRepeatMode}
              />
            </QueueHeaderIcon>

            <QueueHeaderIcon
              active={isAutoplayActive}
              maskId="uid-5"
              iconSize={21}
              iconOffset={3.5}
              path={AUTOPLAY_MASK_PATH}
            >
              <M404AutoPlay
                enabled={isAutoplayActive}
                disabled={!currentSong || stationMode}
                onToggle={onToggleAutoplay}
              />
            </QueueHeaderIcon>
          </div>
        </div>

        {hasManualUpcomingSongs && (
          <DndContext
            collisionDetection={closestCenter}
            modifiers={[restrictQueueToVerticalAxis]}
            onDragCancel={clearQueueDragState}
            onDragEnd={(event) => {
              handleQueueDragEnd(event);
              clearQueueDragState();
            }}
            onDragStart={handleQueueDragStart}
            sensors={queueSensors}
          >
            <SortableContext
              items={manualUpcomingSongs.map(playerSongKey)}
              strategy={verticalListSortingStrategy}
            >
              <QueueSongList
                draggable={canReorderManualSongs}
                songs={manualUpcomingSongs}
                userId={userId}
                favoriteSongKeys={favoriteSongKeys}
                onPlay={handlePlayQueueSong}
              />
            </SortableContext>
          </DndContext>
        )}

        {hasManualUpcomingSongs && hasAutoplayUpcomingSongs && (
          <div className="queue-header mt-2">
            <div>
              <h4 className="queue-header__title">
                <AutoPlayIcon /> AutoPlay
              </h4>

              <p className="queue-header__caption">
                Similar music will keep playing
              </p>
            </div>
          </div>
        )}

        {hasAutoplayUpcomingSongs && (
          <DndContext
            collisionDetection={closestCenter}
            modifiers={[restrictQueueToVerticalAxis]}
            onDragCancel={clearQueueDragState}
            onDragEnd={(event) => {
              handleQueueDragEnd(event);
              clearQueueDragState();
            }}
            onDragStart={handleQueueDragStart}
            sensors={queueSensors}
          >
            <SortableContext
              items={autoplayUpcomingSongs.map(playerSongKey)}
              strategy={verticalListSortingStrategy}
            >
              <QueueSongList
                draggable={canReorderAutoplaySongs}
                songs={autoplayUpcomingSongs}
                userId={userId}
                favoriteSongKeys={favoriteSongKeys}
                onPlay={handlePlayQueueSong}
              />
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
