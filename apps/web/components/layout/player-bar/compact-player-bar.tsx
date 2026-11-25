import type { PlaybackAudio } from "@/lib/player/playback-audio";
import AmpPlayPauseButton from "@/components/custom-elements/AmpPlayPauseButton";
import AmpSkipButton from "@/components/custom-elements/AmpSkipButton";
import { M404ContextualMenuPortalHost } from "@/components/custom-elements/m404-contextual-menu";
import ResponsiveArtwork from "@/components/media/common/responsive-artwork";
import { LyricsBackground } from "@/components/player/lyrics-background";
import type { PlayerSong } from "@/lib/player/use-player-store";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type TransitionEvent,
} from "react";
import AmpPlaybackControlsProgress from "@/components/custom-elements/AmpPlaybackControlsProgress";
import AmpVolumeControl from "@/components/custom-elements/AmpVolumeControl";
import PlaybackItem from "./compact/playback-item";
import MobileQueue from "./compact/mobile-queue";
import MobileLyrics from "./compact/mobile-lyrics";
import { VocalVolumeControl } from "./vocal-volume-control";

const MODAL_DRAG_SLOP = 6;
const MODAL_DISMISS_DISTANCE = 400;
const MODAL_DISMISS_VELOCITY = 0.6;
const MODAL_SLIDE_DURATION_MS = 250;

type CompactPlayerBarProps = {
  audioRef: RefObject<PlaybackAudio | null>;
  currentSong: PlayerSong | null;
  currentArtworkSrcSet?: string;
  isPlaying: boolean;
  isVideoPlayback: boolean;
  volume: number;
  onSetVolume: (volume: number) => void;
  onTogglePlayback: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onOpenVideoPlayer: () => void;
  isStemActive: boolean;
  vocalVolume: number;
  isVocalControlExpanded: boolean;
  onVocalControlExpandedChange: (expanded: boolean) => void;
  onSetVocalVolume: (volume: number) => void;
  onPreviewVocalVolume: (volume: number) => void;
};

type ModalDragState = {
  didDrag: boolean;
  offset: number;
  pointerId: number;
  startTime: number;
  startY: number;
};

function preservesNativeGesture(target: HTMLElement) {
  return Boolean(
    target.closest(
      ".up-next-mobile-queue, amp-lyrics, amp-playback-controls-progress, amp-volume-control, .queue-drag-handle, [data-vocal-volume-control]",
    ),
  );
}

export function CompactPlayerBar({
  audioRef,
  currentSong,
  currentArtworkSrcSet,
  isPlaying,
  isVideoPlayback,
  volume,
  onSetVolume,
  onTogglePlayback,
  onPrevious,
  onNext,
  onOpenVideoPlayer,
  isStemActive,
  vocalVolume,
  isVocalControlExpanded,
  onVocalControlExpandedChange,
  onSetVocalVolume,
  onPreviewVocalVolume,
}: CompactPlayerBarProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const slidingModalRef = useRef<HTMLDivElement>(null);
  const closeFallbackTimerRef = useRef<number | null>(null);
  const isModalClosingRef = useRef(false);
  const modalDragRef = useRef<ModalDragState | null>(null);
  const contentPullRef = useRef<{ offset: number; startedAt: number } | null>(
    null,
  );
  const suppressNextClickRef = useRef(false);
  const [isModalMounted, setIsModalMounted] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [activeView, setActiveView] = useState<"artwork" | "queue" | "lyrics">(
    "artwork",
  );
  const artworkSrcSet =
    currentSong?.artworkSrcSet ?? currentSong?.artworkUrl ?? "";
  const thumbnailArtworkSrcSet =
    currentSong?.thumbnailArtworkSrcSet ?? artworkSrcSet;

  useEffect(() => {
    if (!isModalMounted) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!dialog.open) dialog.showModal();

    dialog.focus({ preventScroll: true });
    dialog.scrollTop = 0;

    const animationFrame = requestAnimationFrame(() => {
      if (isModalClosingRef.current) return;

      dialog.scrollTop = 0;
      setIsModalVisible(true);
    });

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [isModalMounted]);

  useEffect(() => {
    return () => {
      if (closeFallbackTimerRef.current !== null) {
        window.clearTimeout(closeFallbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const modal = slidingModalRef.current;
    if (!modal || !isModalVisible) return;

    const handleTouchMove = (event: TouchEvent) => {
      const target = event.target as HTMLElement;
      if (!preservesNativeGesture(target)) event.preventDefault();
    };

    modal.addEventListener("touchmove", handleTouchMove, {
      capture: true,
      passive: false,
    });
    return () => {
      modal.removeEventListener("touchmove", handleTouchMove, true);
    };
  }, [isModalVisible]);

  const openModal = () => {
    if (isVideoPlayback) {
      onOpenVideoPlayer();
      return;
    }

    if (closeFallbackTimerRef.current !== null) {
      window.clearTimeout(closeFallbackTimerRef.current);
      closeFallbackTimerRef.current = null;
    }
    isModalClosingRef.current = false;
    setIsModalVisible(false);
    setIsModalMounted(true);
  };

  const handleOpenModalPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (event.button === 0) openModal();
  };

  const handleOpenModalClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.detail === 0) openModal();
  };

  const finalizeModalClose = () => {
    if (closeFallbackTimerRef.current !== null) {
      window.clearTimeout(closeFallbackTimerRef.current);
      closeFallbackTimerRef.current = null;
    }

    isModalClosingRef.current = false;
    dialogRef.current?.close();
    setIsModalMounted(false);
    setActiveView("artwork");
  };

  const closeModal = () => {
    if (isModalClosingRef.current) return;

    isModalClosingRef.current = true;
    setIsModalVisible(false);

    closeFallbackTimerRef.current = window.setTimeout(
      finalizeModalClose,
      MODAL_SLIDE_DURATION_MS + 50,
    );
  };

  const restoreModalTransform = () => {
    const modal = slidingModalRef.current;
    if (!modal) return;

    modal.style.removeProperty("transition");
    void modal.offsetHeight;
    modal.style.removeProperty("transform");
  };

  const updateContentPull = (offset: number) => {
    const modal = slidingModalRef.current;
    if (!modal || offset <= 0) return;

    if (!contentPullRef.current) {
      contentPullRef.current = { offset: 0, startedAt: performance.now() };
    }
    contentPullRef.current.offset = offset;
    modal.style.transition = "none";
    modal.style.transform = `translateY(${offset}px)`;
  };

  const finishContentPull = () => {
    const pull = contentPullRef.current;
    contentPullRef.current = null;
    if (!pull) return;

    const velocity =
      pull.offset / Math.max(performance.now() - pull.startedAt, 1);
    const shouldClose =
      pull.offset >= MODAL_DISMISS_DISTANCE ||
      (pull.offset >= 24 && velocity >= MODAL_DISMISS_VELOCITY);

    if (shouldClose) {
      closeModal();
      requestAnimationFrame(restoreModalTransform);
      return;
    }

    restoreModalTransform();
  };

  const handleModalDragStart = (event: ReactPointerEvent<HTMLElement>) => {
    if (!event.isPrimary || event.button !== 0 || !isModalVisible) return;

    const target = event.target as HTMLElement;
    if (preservesNativeGesture(target)) return;

    event.currentTarget.setPointerCapture(event.pointerId);

    modalDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startTime: performance.now(),
      offset: 0,
      didDrag: false,
    };
    suppressNextClickRef.current = false;
  };

  const handleModalDragMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = modalDragRef.current;
    const modal = slidingModalRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !modal) return;

    const offset = Math.max(0, event.clientY - drag.startY - MODAL_DRAG_SLOP);
    drag.offset = offset;
    drag.didDrag ||= offset > 0;
    if (!drag.didDrag) return;

    suppressNextClickRef.current = true;

    modal.style.transition = "none";
    modal.style.transform = `translateY(${offset}px)`;
  };

  const finishModalDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = modalDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const velocity =
      drag.offset / Math.max(performance.now() - drag.startTime, 1);
    const shouldClose =
      drag.offset >= MODAL_DISMISS_DISTANCE ||
      (drag.offset >= 24 && velocity >= MODAL_DISMISS_VELOCITY);
    modalDragRef.current = null;
    if (!drag.didDrag) return;

    if (shouldClose) {
      closeModal();
      requestAnimationFrame(restoreModalTransform);
      return;
    }

    restoreModalTransform();
  };

  const cancelModalDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = modalDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    modalDragRef.current = null;
    if (drag.didDrag) restoreModalTransform();
  };

  const handleCollapseClick = () => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }

    closeModal();
  };

  const handleModalContentClickCapture = (
    event: ReactMouseEvent<HTMLDivElement>,
  ) => {
    if (!suppressNextClickRef.current) return;

    event.preventDefault();
    event.stopPropagation();
    suppressNextClickRef.current = false;
  };

  const handleModalTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (
      event.target !== event.currentTarget ||
      event.propertyName !== "transform" ||
      isModalVisible
    ) {
      return;
    }

    finalizeModalClose();
  };

  return (
    <>
      <div className="gap-x-0 grid grid-cols-[auto] grid-rows-[var(--miniPlayerHeight)_0_repeat(2,0)] mx-3 my-0 gap-y-0 [backdrop-filter:saturate(220%)_blur(16px)] bg-(--glassMaterialBackground) rounded-[1000px] [box-shadow:0_10px_40px_var(--glassMaterialShadowColor)] relative after:[--containerInnerStroke:var(--glassMaterialInnerStroke)] after:[--containerInnerStrokeAlpha:var(--glassMaterialInnerStrokeAlpha)] after:rounded-(--afterShadowBorderRadius,inherit) after:shadow-(--artworkShadowInset) after:block after:h-0 after:max-h-full after:max-w-full after:min-h-full after:min-w-full after:opacity-(--containerInnerStrokeAlpha,0.1) after:pointer-events-none after:absolute after:top-0 after:w-full after:z-[calc(var(--z-default)+1)] after:dark:opacity-(--containerInnerStrokeAlpha,.25)">
        <div className="[--playback-controls-play-color:var(--miniPlayerPlayButtonColor,var(--systemPrimary))] [--skip-control-color:var(--miniPlayerPlayButtonColor,var(--systemPrimary))] [--playback-control-icon-width:var(--miniPlayerControlsButtonWidth,35px)] [--playback-control-icon-height:var(--miniPlayerControlsButtonWidth,35px)] [--skip-icon-width:var(--miniPlayerControlsButtonWidth,35px)] [--skip-icon-height:var(--miniPlayerControlsButtonWidth,35px)] items-center flex gap-2.75 [grid-area:1/5/2/6] h-(--miniPlayerHeight,56px) max-w-184 in-[.app-container]:col-span-full in-[.app-container]:h-(--miniPlayerHeight,52px) in-[.app-container]:pe-(--miniPlayerPaddingEnd,16px) in-[.app-container]:ps-(--miniPlayerPaddingStart,16px) in-[.app-container]:w-full">
          <button
            onPointerDown={handleOpenModalPointerDown}
            onClick={handleOpenModalClick}
            className="items-center bg-transparent flex gap-2 h-8 min-w-0 w-full cursor-pointer"
          >
            <div
              data-video-playbar-host={isVideoPlayback ? "true" : undefined}
              className={`[--override-placeholder-bg-color:var(--genericJoeColor)] [--artwork-override-height:32px] rounded-md shrink-0 h-[inherit] ${isVideoPlayback ? "w-14.25" : "aspect-[1_auto]"}`}
            >
              <div
                className="bg-(--override-placeholder-bg-color,var(--placeholder-bg-color,var(--genericJoeColor))) rounded-[inherit] box-border contain-content h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0px) min-w-(--artwork-override-min-width,0px) overflow-hidden relative w-(--artwork-override-width,100%) z-(--z-default) before:box-border before:content-[''] before:block before:pb-[calc(100%/var(--shelf-aspect-ratio,var(--aspect-ratio)))] after:rounded-(--afterShadowBorderRadius,inherit) after:shadow-(--artworkShadowInset) after:h-0 after:max-h-full after:max-w-full after:min-w-full after:opacity-(--containerInnerStrokeAlpha,0.1) after:pointer-events-none after:top-0 after:w-full after:z-[calc(var(--z-default)+1)] after:box-border after:block after:pb-[calc(100%/var(--shelf-aspect-ratio,var(--aspect-ratio)))] after:min-h-0 after:absolute after:dark:opacity-(--containerInnerStrokeAlpha,.25)"
                style={
                  {
                    "--aspect-ratio": "1",
                    "--placeholder-bg-color": "transparent",
                  } as CSSProperties
                }
              >
                <div className="rounded-[inherit] [transition:var(--global-transition,opacity_.1s_ease-in)] h-(--artwork-override-height,100%) left-1/2 max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0px) min-w-(--artwork-override-min-width,0px) absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-(--artwork-override-width,100%) z-(--z-default)">
                  {currentSong ? (
                    <>
                      <ResponsiveArtwork
                        alt={currentSong.title}
                        className="block size-full rounded-[inherit] object-cover"
                        height={32}
                        pictureClassName="block size-full"
                        sizes="32px"
                        src="/assets/artwork/1x1.gif"
                        srcSet={currentArtworkSrcSet}
                        width={32}
                      />
                      {isVideoPlayback && (
                        <div
                          data-video-playbar-media="true"
                          className="absolute inset-0 z-[calc(var(--z-default)+1)]"
                        />
                      )}
                    </>
                  ) : (
                    <div className="bg-(--genericJoeColor) max-h-full max-w-full h-[inherit] w-[inherit]">
                      <svg
                        viewBox="0 0 100 100"
                        xmlns="http://www.w3.org/2000/svg"
                        width="100"
                        height="100"
                        className="[--icon:rgba(60,60,67,0.18)] dark:[--icon:rgba(235,235,245,0.16)] scheme-light-dark h-[inherit] w-[inherit]"
                      >
                        <g fill="none" fillRule="evenodd">
                          <path
                            fill="var(--genericJoeColor)"
                            d="M0 0h100v100H0z"
                          />
                          <path
                            fill="var(--icon)"
                            fillRule="nonzero"
                            d="M34.098 73.66c3.256 0 8.153-2.404 8.153-8.873v-21c0-1.146.202-1.393 1.235-1.596L61.5 38.485c1.146-.247 1.595.045 1.595 1.078l.157 14.083c0 1.146-.584 1.865-1.64 2.09l-3.346.74c-4.493.966-6.694 3.078-6.694 6.447 0 3.347 2.718 5.795 6.424 5.795 3.257 0 8.064-2.291 8.064-8.738V28.76c0-2.112-.966-2.763-3.392-2.291l-21.27 4.402c-1.483.292-2.27 1.1-2.27 2.381l.136 25.358c0 1.056-.494 1.775-1.438 1.954l-3.504.72c-4.447.943-6.558 3.166-6.558 6.603 0 3.391 2.628 5.772 6.334 5.772Z"
                          />
                        </g>
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="min-w-0 overflow-hidden text-start text-ellipsis whitespace-nowrap w-full">
              {currentSong && (
                <>
                  <div className="[--explicitBadgeSize:10px] items-baseline text-(--systemPrimary) inline-grid [font:var(--body-emphasized)] grid-cols-[1fr_auto] text-start w-full">
                    <div className="truncate">{currentSong.title}</div>
                  </div>
                  <div className="text-(--systemSecondary) grid [font:var(--callout-medium)]">
                    <div className="truncate">{currentSong.artist}</div>
                  </div>
                </>
              )}
            </div>
          </button>

          <div className="flex items-center gap-3">
            <AmpPlayPauseButton
              mode={isPlaying ? "pause" : "play"}
              disabled={!currentSong?.playbackUrl}
              onClick={onTogglePlayback}
            />

            <AmpSkipButton
              direction="next"
              disabled={!currentSong}
              onClick={onNext}
            />
          </div>
        </div>
      </div>

      {isModalMounted && (
        <div className="modal-wrapper">
          <div className="sliding-modal-wrapper">
            <dialog
              ref={dialogRef}
              className="no-scrim"
              tabIndex={-1}
              onCancel={(event) => {
                event.preventDefault();
                closeModal();
              }}
            >
              <M404ContextualMenuPortalHost />
              <div
                ref={slidingModalRef}
                className={`sliding-modal ${activeView === "artwork" ? "touch-none" : ""} ${isModalVisible ? "is-open" : ""}`}
                onTransitionEnd={handleModalTransitionEnd}
                onPointerDownCapture={handleModalDragStart}
                onPointerMoveCapture={handleModalDragMove}
                onPointerUpCapture={finishModalDrag}
                onPointerCancelCapture={cancelModalDrag}
                style={
                  {
                    "--slide-duration": `${MODAL_SLIDE_DURATION_MS}ms`,
                  } as CSSProperties
                }
              >
                <div className="sliding-modal-backdrop">
                  <div className="backdrop">
                    <div className="dynamic-backdrop">
                      <div className="contents [--lyrics-border-radius:0]">
                        <div className="transform-[scale(2)] rounded-[inherit] h-full overflow-hidden pointer-events-none absolute w-full z-(--z-default)">
                          <LyricsBackground
                            artworkSrcSet={thumbnailArtworkSrcSet}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className="sliding-modal-content"
                  onClickCapture={handleModalContentClickCapture}
                >
                  <div className="sliding-modal-collapse">
                    <button
                      type="button"
                      aria-label="Close now playing"
                      onClick={handleCollapseClick}
                      className="bg-(--slidingModalHandleColor,var(--systemQuaternary)) block h-1 m-[6px_auto] rounded-full w-9"
                    ></button>
                  </div>

                  <div className="sliding-modal-main">
                    <div
                      className={`now-playing-structure now-playing-structure--${activeView}`}
                    >
                      <div
                        className={`now-playing-main ${activeView === "artwork" ? "touch-none" : ""}`}
                      >
                        {activeView === "lyrics" ? (
                          <MobileLyrics
                            audioRef={audioRef}
                            isPlaying={isPlaying}
                            currentSong={currentSong}
                            artworkSrcSet={artworkSrcSet}
                            closeModal={closeModal}
                            onPullDown={updateContentPull}
                            onPullEnd={finishContentPull}
                          />
                        ) : activeView === "queue" ? (
                          <MobileQueue
                            isPlaying={isPlaying}
                            currentSong={currentSong}
                            artworkSrcSet={artworkSrcSet}
                            closeModal={closeModal}
                            onPullDown={updateContentPull}
                            onPullEnd={finishContentPull}
                          />
                        ) : (
                          <PlaybackItem
                            isPlaying={isPlaying}
                            currentSong={currentSong}
                            artworkSrcSet={artworkSrcSet}
                            variant="large"
                            onTogglePlayback={onTogglePlayback}
                            closeModal={closeModal}
                          />
                        )}
                      </div>

                      <div className="now-playing-controls touch-none">
                        <div className="playback-controls relative">
                          {isStemActive && activeView === "lyrics" && (
                            <VocalVolumeControl
                              compact
                              className="absolute bottom-full inset-e-0 mb-4 z-[calc(var(--z-default)+1)]"
                              value={vocalVolume}
                              isExpanded={isVocalControlExpanded}
                              onExpandedChange={onVocalControlExpandedChange}
                              onValueChange={onSetVocalVolume}
                              onPreviewValueChange={onPreviewVocalVolume}
                            />
                          )}

                          <AmpPlaybackControlsProgress
                            inDetailView
                            audioRef={audioRef}
                            className=""
                            expandTrackWhileScrubbing
                          />

                          <div className="controls_mb">
                            <div className="playback-buttons">
                              <div className="size-12.5 grid place-items-center [--skip-icon-width:50px] [--skip-icon-height:50px]">
                                <AmpSkipButton
                                  direction="previous"
                                  onClick={onPrevious}
                                  disabled={!currentSong}
                                />
                              </div>

                              <AmpPlayPauseButton
                                mode={isPlaying ? "pause" : "play"}
                                containerClassName="playback-controls-play__mb"
                                onClick={onTogglePlayback}
                                disabled={!currentSong?.playbackUrl}
                              />

                              <div className="size-12.5 grid place-items-center [--skip-icon-width:50px] [--skip-icon-height:50px]">
                                <AmpSkipButton
                                  direction="next"
                                  onClick={onNext}
                                  disabled={!currentSong}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="volume">
                            <div className="volume-icon">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="11"
                                height="16"
                                viewBox="0 0 10.802 16"
                                aria-hidden="true"
                              >
                                <path d="M9.781 16c.598 0 1.021-.43 1.021-1.023V1.07c0-.583-.422-1.07-1.04-1.07-.424 0-.71.185-1.179.624L4.725 4.253a.33.33 0 0 1-.228.089H1.899C.669 4.342 0 5.012 0 6.327v3.375c0 1.305.67 1.984 1.899 1.984h2.598a.33.33 0 0 1 .228.08l3.858 3.666c.422.393.772.568 1.198.568"></path>
                              </svg>
                            </div>

                            <AmpVolumeControl
                              relativeDragging
                              volume={volume}
                              onSetVolume={onSetVolume}
                            />

                            <div className="volume-icon">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="22"
                                height="16"
                                viewBox="0 0 22.239 16"
                                aria-hidden="true"
                              >
                                <path d="M8.933 15.316c.538 0 .932-.392.932-.934v-12.7c0-.533-.394-.978-.95-.978-.387 0-.656.169-1.076.57L4.306 4.588a.28.28 0 0 1-.2.081H1.735C.611 4.669 0 5.28 0 6.482v3.082c0 1.192.611 1.812 1.734 1.812h2.373c.08 0 .15.024.2.074l3.532 3.347c.385.359.707.519 1.094.519m3.88-3.782c.282.186.668.13.892-.192.634-.84 1.019-2.07 1.019-3.34 0-1.272-.385-2.493-1.02-3.342-.223-.322-.61-.378-.89-.183-.331.232-.388.639-.13.983.486.658.75 1.576.75 2.541s-.273 1.874-.75 2.541c-.249.354-.201.75.13.992zm3.08 2.155c.308.204.686.14.91-.183 1.059-1.452 1.686-3.462 1.686-5.505s-.618-4.07-1.686-5.505c-.224-.323-.602-.387-.91-.183-.305.206-.36.593-.117.937.911 1.278 1.425 2.988 1.425 4.751s-.531 3.464-1.425 4.75c-.234.345-.188.732.118.938zm3.108 2.194c.29.213.696.13.916-.204 1.453-2.095 2.322-4.752 2.322-7.678s-.895-5.574-2.322-7.678C19.697-.02 19.29-.093 19 .12c-.305.213-.352.603-.122.948 1.28 1.892 2.09 4.277 2.09 6.934 0 2.649-.81 5.052-2.09 6.934-.23.345-.183.735.122.948z"></path>
                              </svg>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="now-playing-toggle touch-none">
                        <div
                          className="toggle-buttons lyrics-toggle-bubble-tip"
                          style={
                            { "--anchor-name": "--popover-15" } as CSSProperties
                          }
                        >
                          <button
                            type="button"
                            className="toggle-button toggle-button--lyrics lyrics-button"
                            aria-label="Lyrics"
                            aria-pressed={activeView === "lyrics"}
                            onClick={() =>
                              setActiveView((view) =>
                                view === "lyrics" ? "artwork" : "lyrics",
                              )
                            }
                            style={
                              {
                                anchorName: "var(--anchor-name)",
                              } as CSSProperties
                            }
                          >
                            <svg
                              className="rounded-[inherit] fill-(--svgFill,var(--keyColor))"
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 28 28"
                              width="28"
                              height="28"
                              role="presentation"
                            >
                              <mask id="uid-29">
                                <rect
                                  width="100%"
                                  height="100%"
                                  fill={
                                    activeView === "lyrics" ? "white" : "black"
                                  }
                                ></rect>
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 64 64"
                                  width="22"
                                  height="22"
                                  x="3"
                                  y="3"
                                  fill={
                                    activeView === "lyrics" ? "black" : "white"
                                  }
                                >
                                  {activeView === "lyrics" ? (
                                    <path d="M17.347 62.821c1.254 0 2.21-.572 3.705-1.933L31.78 51.26h18.443C58.943 51.26 64 46.13 64 37.504V14.956C64 6.33 58.944 1.179 50.223 1.179H13.777C5.057 1.179 0 6.322 0 14.956v22.548C0 46.137 5.27 51.26 13.456 51.26h.994v8.327c0 1.97 1.095 3.235 2.897 3.235zm-.108-39.64c0-3.71 2.79-6.37 6.53-6.37 4.18 0 6.89 3.383 6.89 7.694 0 7.102-5.871 11.086-9.19 11.086-.917 0-1.596-.593-1.596-1.43 0-.742.387-1.242 1.403-1.474 2.4-.587 4.629-2.31 5.53-4.606h-.407c-.823.983-2.108 1.318-3.512 1.318-3.417 0-5.648-2.669-5.648-6.217zm16.387 0c0-3.71 2.77-6.37 6.508-6.37 4.18 0 6.912 3.383 6.912 7.694 0 7.102-5.871 11.086-9.179 11.086-.928 0-1.617-.593-1.617-1.43 0-.742.39-1.242 1.392-1.474 2.436-.587 4.654-2.31 5.551-4.606h-.407c-.823.983-2.108 1.318-3.523 1.318-3.405 0-5.637-2.669-5.637-6.217z"></path>
                                  ) : (
                                    <path d="M18.53 62.724c1.764 0 3.115-.81 5.257-2.707l9.816-8.638h16.62c8.72 0 13.777-5.152 13.777-13.777V15.053c0-8.625-5.056-13.777-13.777-13.777H13.777C5.057 1.276 0 6.42 0 15.053v22.549c0 8.633 5.27 13.777 13.456 13.777h1.016v6.793c0 2.812 1.511 4.552 4.057 4.552zm1.57-7.16v-8.11c0-1.81-.805-2.485-2.486-2.485h-3.55c-5.165 0-7.654-2.603-7.654-7.654V15.34c0-5.033 2.489-7.632 7.654-7.632h35.872c5.149 0 7.654 2.599 7.654 7.632v21.975c0 5.051-2.505 7.654-7.654 7.654H33.188c-1.835 0-2.702.33-4.012 1.65zm-2.212-32.177c0 3.398 2.156 5.936 5.388 5.936 1.361 0 2.592-.302 3.372-1.263h.385c-.868 2.231-3 3.845-5.303 4.4-.95.243-1.327.737-1.327 1.425 0 .8.658 1.36 1.51 1.36 3.174 0 8.8-3.775 8.8-10.6 0-4.138-2.602-7.336-6.588-7.336-3.576 0-6.237 2.518-6.237 6.078zm15.663 0c0 3.398 2.134 5.936 5.387 5.936 1.34 0 2.593-.302 3.373-1.263h.39c-.865 2.231-3.023 3.845-5.308 4.4-.947.243-1.327.737-1.327 1.425 0 .8.636 1.36 1.51 1.36 3.178 0 8.779-3.775 8.779-10.6 0-4.138-2.577-7.336-6.567-7.336-3.577 0-6.237 2.518-6.237 6.078z"></path>
                                  )}
                                </svg>
                              </mask>
                              <rect
                                width="100%"
                                height="100%"
                                mask="url(#uid-29)"
                              ></rect>
                            </svg>
                          </button>

                          <button
                            type="button"
                            className="toggle-button toggle-button--queue"
                            aria-label="Show queue"
                            aria-pressed={activeView === "queue"}
                            onClick={() =>
                              setActiveView((view) =>
                                view === "queue" ? "artwork" : "queue",
                              )
                            }
                          >
                            <svg
                              className="invertible-mask invertible-mask--not-inverted"
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 28 28"
                              width="28"
                              height="28"
                              role="presentation"
                            >
                              <mask id="uid-9">
                                <rect
                                  width="100%"
                                  height="100%"
                                  fill={
                                    activeView === "queue" ? "white" : "black"
                                  }
                                ></rect>
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 64 64"
                                  width="20"
                                  height="20"
                                  x="4"
                                  y="4"
                                  fill={
                                    activeView === "queue" ? "black" : "white"
                                  }
                                >
                                  <path d="M19.489 16.272h41.284A3.204 3.204 0 0 0 64 13.046a3.203 3.203 0 0 0-3.227-3.222H19.49a3.2 3.2 0 0 0-3.226 3.222 3.2 3.2 0 0 0 3.226 3.226zm0 18.954h41.284A3.207 3.207 0 0 0 64 32a3.206 3.206 0 0 0-3.227-3.226H19.49A3.204 3.204 0 0 0 16.263 32a3.204 3.204 0 0 0 3.226 3.226m0 18.95h41.284A3.203 3.203 0 0 0 64 50.954a3.204 3.204 0 0 0-3.227-3.226H19.49a3.2 3.2 0 0 0-3.226 3.226 3.2 3.2 0 0 0 3.226 3.222zM4.636 17.682c2.54 0 4.632-2.091 4.632-4.636 0-2.54-2.092-4.631-4.632-4.631C2.092 8.415 0 10.506 0 13.046c0 2.545 2.092 4.636 4.636 4.636m0 18.954c2.54 0 4.632-2.091 4.632-4.636s-2.092-4.636-4.632-4.636C2.092 27.364 0 29.455 0 32s2.092 4.636 4.636 4.636m0 18.95c2.54 0 4.632-2.092 4.632-4.632 0-2.545-2.092-4.636-4.632-4.636C2.092 46.318 0 48.409 0 50.954c0 2.54 2.092 4.631 4.636 4.631z"></path>
                                </svg>
                              </mask>
                              <rect
                                width="100%"
                                height="100%"
                                mask="url(#uid-9)"
                              ></rect>
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </dialog>
          </div>
        </div>
      )}
    </>
  );
}
