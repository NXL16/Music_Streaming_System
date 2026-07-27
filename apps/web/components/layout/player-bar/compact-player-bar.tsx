import AmpPlayPauseButton from "@/components/custom-elements/AmpPlayPauseButton";
import AmpSkipButton from "@/components/custom-elements/AmpSkipButton";
import ResponsiveArtwork from "@/components/media/common/responsive-artwork";
import type { PlayerSong } from "@/lib/player/use-player-store";
import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

type CompactPlayerBarProps = {
  currentSong: PlayerSong | null;
  currentArtworkSrcSet?: string;
  isPlaying: boolean;
  onTogglePlayback: () => void;
  onNext: () => void;
};

export function CompactPlayerBar({
  currentSong,
  currentArtworkSrcSet,
  isPlaying,
  onTogglePlayback,
  onNext,
}: CompactPlayerBarProps) {
  const [isModalMounted, setIsModalMounted] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);

  useEffect(() => {
    if (!isModalMounted) return;

    let enterAnimationFrame: number | undefined;
    const initialAnimationFrame = requestAnimationFrame(() => {
      enterAnimationFrame = requestAnimationFrame(() => {
        setIsModalVisible(true);
      });
    });

    return () => {
      cancelAnimationFrame(initialAnimationFrame);
      if (enterAnimationFrame) cancelAnimationFrame(enterAnimationFrame);
    };
  }, [isModalMounted]);

  useEffect(() => {
    if (!isModalMounted) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsModalVisible(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalMounted]);

  const openModal = () => {
    setIsModalVisible(false);
    setIsModalMounted(true);
  };

  const closeModal = () => {
    setIsModalVisible(false);
  };

  return (
    <>
      <div className="block">
        <div className="gap-x-0 grid grid-cols-[auto] grid-rows-[var(--miniPlayerHeight)_0_repeat(2,0)] mx-3 my-0 gap-y-0 [backdrop-filter:saturate(220%)_blur(16px)] bg-(--glassMaterialBackground) rounded-[1000px] [box-shadow:0_10px_40px_var(--glassMaterialShadowColor)] relative after:[--containerInnerStroke:var(--glassMaterialInnerStroke)] after:[--containerInnerStrokeAlpha:var(--glassMaterialInnerStrokeAlpha)] after:rounded-(--afterShadowBorderRadius,inherit) after:shadow-(--artworkShadowInset) after:content-[''] after:block after:h-0 after:max-h-full after:max-w-full after:min-h-full after:min-w-full after:opacity-(--containerInnerStrokeAlpha,0.1) after:pointer-events-none after:absolute after:top-0 after:w-full after:z-[calc(var(--z-default)+1)] after:dark:opacity-(--containerInnerStrokeAlpha,.25)">
          <div className="[--playback-controls-play-color:var(--miniPlayerPlayButtonColor,var(--systemPrimary))] [--skip-control-color:var(--miniPlayerPlayButtonColor,var(--systemPrimary))] [--playback-control-icon-width:var(--miniPlayerControlsButtonWidth,35px)] [--playback-control-icon-height:var(--miniPlayerControlsButtonWidth,35px)] [--skip-icon-width:var(--miniPlayerControlsButtonWidth,35px)] [--skip-icon-height:var(--miniPlayerControlsButtonWidth,35px)] items-center flex gap-2.75 [grid-area:1/5/2/6] h-(--miniPlayerHeight,56px) max-w-184 in-[.app-container]:col-span-full in-[.app-container]:h-(--miniPlayerHeight,52px) in-[.app-container]:pe-(--miniPlayerPaddingEnd,16px) in-[.app-container]:ps-(--miniPlayerPaddingStart,16px) in-[.app-container]:w-full">
            <button
              onClick={openModal}
              className="items-center bg-transparent flex gap-2 h-8 min-w-0 w-full cursor-pointer"
            >
              <div className="[--override-placeholder-bg-color:var(--genericJoeColor)] [--artwork-override-height:32px] rounded-md shrink-0 aspect-[1_auto] h-[inherit]">
                <div
                  className="bg-(--override-placeholder-bg-color,var(--placeholder-bg-color,var(--genericJoeColor))) rounded-[inherit] box-border contain-content h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0px) min-w-(--artwork-override-min-width,0px) overflow-hidden relative w-(--artwork-override-width,100%) z-(--z-default) before:box-border before:content-[''] before:block before:pb-[calc(100%/var(--shelf-aspect-ratio,var(--aspect-ratio)))] after:rounded-(--afterShadowBorderRadius,inherit) after:shadow-(--artworkShadowInset) after:h-0 after:max-h-full after:max-w-full after:min-w-full after:opacity-(--containerInnerStrokeAlpha,0.1) after:pointer-events-none after:top-0 after:w-full after:z-[calc(var(--z-default)+1)] after:box-border after:content-[''] after:block after:pb-[calc(100%/var(--shelf-aspect-ratio,var(--aspect-ratio)))] after:min-h-0 after:absolute after:dark:opacity-(--containerInnerStrokeAlpha,.25)"
                  style={
                    {
                      "--aspect-ratio": "1",
                      "--placeholder-bg-color": "transparent",
                    } as CSSProperties
                  }
                >
                  <div className="rounded-[inherit] [transition:var(--global-transition,opacity_.1s_ease-in)] h-(--artwork-override-height,100%) left-1/2 max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0px) min-w-(--artwork-override-min-width,0px) absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-(--artwork-override-width,100%) z-(--z-default)">
                    {currentSong ? (
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

            <div className="flex items-center gap-2">
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
      </div>

      {typeof document !== "undefined" &&
        isModalMounted &&
        createPortal(
          <div
            aria-label="Now playing"
            aria-modal="true"
            role="dialog"
            className="[--modalBorderRadius:var(--slidingModalBorderRadius,0)_var(--slidingModalBorderRadius,0)_0_0] [--slidingModalHandleColor:var(--systemTertiary-onDark)] bg-transparent rounded-(--modalBorderRadius,10px) text-(--systemPrimary) [font:var(--body)] h-dvh inset-0 overflow-hidden w-screen fixed z-2147483647 [--systemPrimary:var(--systemPrimary-onLight)] [--systemSecondary:var(--systemSecondary-onLight)] [--systemTertiary:var(--systemTertiary-onLight)] [--systemQuaternary:var(--systemQuaternary-onLight)] [--systemQuinary:var(--systemQuinary-onLight)] dark:[--systemPrimary:var(--systemPrimary-onDark)] dark:[--systemSecondary:var(--systemSecondary-onDark)] dark:[--systemTertiary:var(--systemTertiary-onDark)] dark:[--systemQuaternary:var(--systemQuaternary-onDark)] dark:[--systemQuinary:var(--systemQuinary-onDark)]"
          >
            <div
              onTransitionEnd={(event) => {
                if (
                  event.target === event.currentTarget &&
                  event.propertyName === "transform" &&
                  !isModalVisible
                ) {
                  setIsModalMounted(false);
                }
              }}
              className="bg-(--slidingModalBgColor,var(--pageBG)) rounded-(--modalBorderRadius) shadow-[0_0_5px_3px_rgba(0,0,0,0.3)] h-(--slidingModalContentHeight,100%) overflow-hidden relative [transition:transform_var(--slide-duration,.25s)_cubic-bezier(.445,.05,.55,.95)] w-full z-(--z-default)"
              style={
                {
                  "--slide-duration": "250ms",
                  transform: isModalVisible
                    ? "translate3d(0, 0, 0)"
                    : "translate3d(0, 100%, 0)",
                } as CSSProperties
              }
            >
              <div className="bottom-0 inline-end-0 inline-start-0 m-auto absolute top-0 z-0">
                <div className="size-full">
                  <div>
                    <div className="contents [--lyrics-border-radius:0]">
                      <div className="rounded-[inherit] h-full overflow-hidden pointer-events-none absolute w-full z-(--z-default)">
                        <canvas className="block size-full"></canvas>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-(--slidingModalContentBgColor,transparent) flex flex-col h-full relative w-full">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-none pb-4.25 pt-4.5 z-(--z-default)"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 90.64 30.831"
                    width="24"
                    height="8"
                    className="h-2 m-auto fill-(--slidingModalHandleColor,var(--systemQuaternary)) align-baseline inline-block"
                  >
                    <path d="m4.486 14.456 32.352 13.938c3.156 1.387 5.552 2.437 8.48 2.437 2.932 0 5.357-1.05 8.484-2.437l32.353-13.938c2.612-1.192 4.485-3.514 4.485-6.42C90.64 3.184 87.085 0 83 0c-2.279 0-5.172 1.325-7.569 2.42L42.845 16.358h4.95L15.21 2.42C12.812 1.325 9.948 0 7.636 0 3.55 0 0 3.184 0 8.036c0 2.906 1.873 5.228 4.486 6.42z"></path>
                  </svg>
                </button>

                <div className="flex-1 relative">
                  <div className="bg-linear-to-t from-[rgba(0,0,0,0.4)] from-0% to-transparent to-50% text-white flex flex-col h-[calc(100dvh-51px)]">
                    <div className="flex-[1_65.5%] [overflow:hidden_auto]">
                      <div className="flex flex-col h-full justify-around w-full">
                        <div className=""></div>

                        <div className="flex m-[0_32px_18px]"></div>
                      </div>
                    </div>

                    <div className="flex-[0_100_calc(34.5%-54px)] m-[0_32px]"></div>

                    <div className="m-[auto_32px_20px]"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
