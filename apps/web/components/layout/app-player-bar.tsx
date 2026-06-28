"use client";

import AmpShuffleButton from "../custom-elements/AmpShuffleButton";
import AmpRepeatButton from "../custom-elements/AmpRepeatButton";
import AmpSkipButton from "../custom-elements/AmpSkipButton";
import AmpPlayPauseButton from "../custom-elements/AmpPlayPauseButton";
import Logo from "../custom-elements/Logo";
import { useState } from "react";
import AmpLyrics from "../custom-elements/AmpLyrics";
import ExpansionButton from "../custom-elements/ExpansionButton";
import AmpContextMenuButton from "../custom-elements/AmpContextMenuButton";
import AmpPlaybackControlsProgress from "../custom-elements/AmpPlaybackControlsProgress";

export function AppPlayerBar() {
  const isPlaying = false;

  const [isExpanded, setIsExpanded] = useState(false);
  const [isProgressExpanded, setIsProgressExpanded] = useState(false);
  const [volume, setVolume] = useState(0.72);
  const [prevVolume, setPrevVolume] = useState(volume);

  const toggleMute = () => {
    if (!isExpanded) {
      setIsExpanded(true);
      return;
    }

    if (volume > 0) {
      setPrevVolume(volume);
      setVolume(0);
    } else {
      setVolume(prevVolume);
    }
  };

  const [showLyrics, setShowLyrics] = useState(false);
  const [lyricsMounted, setLyricsMounted] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [queueMounted, setQueueMounted] = useState(false);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleLyrics = () => {
    if (!showLyrics) {
      setIsSidebarOpen(true);
      setLyricsMounted(true);
      setQueueMounted(true);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setShowLyrics(true);
          setShowQueue(false);
        });
      });
    } else {
      setIsSidebarOpen(false);
      setShowLyrics(false);
      setTimeout(() => {
        setLyricsMounted(false);
        setQueueMounted(false);
      }, 300);
    }
  };

  const toggleQueue = () => {
    if (!showQueue) {
      setIsSidebarOpen(true);
      setLyricsMounted(true);
      setQueueMounted(true);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setShowQueue(true);
          setShowLyrics(false);
        });
      });
    } else {
      setIsSidebarOpen(false);
      setShowQueue(false);
      setTimeout(() => {
        setLyricsMounted(false);
        setQueueMounted(false);
      }, 300);
    }
  };

  return (
    <div
      className={`min-[484px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)] min-[484px]:[grid-area:structure-main-section] sticky self-end mb-5 px-5 top-auto bottom-auto h-13.5 w-[calc(100vw-var(--web-navigation-width))] z-[calc(var(--z-web-chrome)-1)] inset-e-0 ${isSidebarOpen ? "pe-80" : ""}`}
    >
      <div className="block">
        <div className="mx-auto relative grid grid-cols-[auto_1fr_auto] place-items-center max-w-167 h-14 px-4 rounded-[1000px] before:content-[''] before:absolute before:inset-0 before:z-(--z-default) before:rounded-[1000px] before:backdrop-saturate-220 before:backdrop-blur-lg before:bg-(--glassMaterialBackground) before:shadow-[0_10px_40px_var(--glassMaterialShadowColor)] after:content-[''] after:block after:h-0 after:min-w-full after:min-h-full after:max-w-full after:max-h-full after:pointer-events-none after:absolute after:top-0 after:w-full after:z-[calc(var(--z-default)+1)] after:rounded-[1000px] after:shadow-[inset_.5px_.5px_var(--glassMaterialInnerStroke),inset_.5px_-.5px_var(--glassMaterialInnerStroke),inset_-.5px_.5px_var(--glassMaterialInnerStroke),inset_-.5px_-.5px_var(--glassMaterialInnerStroke)] after:opacity-10 dark:after:opacity-25">
          <div className="z-[calc(var(--z-default)+1)]">
            <div className="flex gap-2 [--playback-control-button-width:24px] [--playback-control-button-height:24px] [--playback-control-icon-width:30px] [--playback-controls-play-color:var(--systemPrimary)] [--shuffle-repeat-button-width:24px] [--shuffle-repeat-button-height:24px] [--skip-control-color:var(--systemPrimary)] [--skip-icon-width:28px]">
              <AmpShuffleButton />

              <div className="flex gap-2 [--playback-control-icon-width:34px] [--playback-control-icon-height:34px] [--playback-controls-play-color:var(--systemPrimary)]">
                <AmpSkipButton
                  direction="previous"
                  // onClick={handlePrev}
                  // disabled={isFirstSong}
                  disabled={true}
                />

                <AmpPlayPauseButton
                  mode={!isPlaying ? "play" : "pause"}
                  disabled={isPlaying ? false : true}
                />

                <AmpSkipButton
                  direction="next"
                  // onClick={handleNext}
                  // disabled={isLastSong}
                  disabled={true}
                />
              </div>

              <AmpRepeatButton />
            </div>
          </div>

          <div className="z-[calc(var(--z-default)+1)] [--lcd-marquee-offset:0px] [--marquee-line-padding:28px] px-4 justify-self-stretch self-center">
            <div slot="lcd">
              <div
                className={`grid [grid-template-areas:'artwork_metadata_after-metadata''progress_progress_progress'] grid-rows-[34px_auto] h-14 place-content-center relative z-(--z-default) ${!isPlaying ? "text-(--systemTertiary) gap-0 grid-cols-1 pt-0 place-items-center" : "gap-x-2 grid-cols-[auto_minmax(0,1fr)_auto] pt-2"}`}
              >
                {isPlaying ? (
                  <>
                    <div
                      className={`[--artworkShadowInset:inset_0_0_0_1px_var(--containerInnerStroke)] aspect-square rounded-md [grid-area:artwork] scale-100 transition-transform duration-150 ease-out hover:scale-110 ${isProgressExpanded ? "opacity-50" : ""}`}
                    >
                      <div
                        className="bg-(--override-placeholder-bg-color,var(--placeholder-bg-color,var(--genericJoeColor))) rounded-[inherit] box-border contain-content h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0px) min-w-(--artwork-override-min-width,0px) overflow-hidden relative w-(--artwork-override-width,100%) z-(--z-default) after:content-[''] after:block after:absolute after:top-0 after:w-full after:h-0 after:min-h-full after:min-w-full after:max-h-full after:max-w-full after:rounded-(--afterShadowBorderRadius,inherit) after:shadow-(--artworkShadowInset) after:opacity-(--containerInnerStrokeAlpha,0.25) after:pointer-events-none after:z-[calc(var(--z-default)+1)]"
                        style={
                          {
                            "--aspect-ratio": "1",
                            "--placeholder-bg-color": "transparent",
                          } as React.CSSProperties
                        }
                      >
                        <picture>
                          <source
                            sizes="40px"
                            srcSet="https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/11/ae/f2/11aef294-f57c-bab9-c9fc-529162984e62/24UMGIM85348.rgb.jpg/40x40bb-60.jpg 40w, https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/11/ae/f2/11aef294-f57c-bab9-c9fc-529162984e62/24UMGIM85348.rgb.jpg/80x80bb-60.jpg 80w"
                            type="image/jpeg"
                          />
                          <img
                            className="block h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0px) min-w-(--artwork-override-min-width,0px) [object-fit:var(--artwork-override-object-fit,fill)] object-(--artwork-override-object-position,center) w-(--artwork-override-width,100%) rounded-[inherit] transition-(--global-transition,opacity_.1s_ease-in)"
                            loading="lazy"
                            src="/assets/artwork/1x1.gif"
                            role="presentation"
                            decoding="async"
                            width={40}
                            height={40}
                            fetchPriority="auto"
                            style={{ opacity: 1 }}
                            alt=""
                          />
                        </picture>
                      </div>

                      <button className="bg-[rgba(51,51,51,0.3)] rounded-[inherit] text-white grid inset-0 opacity-0 place-items-center absolute transition-opacity duration-150 ease-out z-(--z-default) hover:opacity-100">
                        <ExpansionButton />
                      </button>
                    </div>

                    <div
                      className={`[--lcd-height:100%] [--lcd-justify-text:start] [--lcd-line-padding:0] self-center [grid-area:metadata] group/metadata ${isProgressExpanded ? "opacity-50" : ""}`}
                    >
                      <div className="[--favoriteIconSize:11px] [--favoriteButtonSize:16px] [--menu-position-shift:0px]">
                        <div className="items-[var(--lcd-justify-text,center)] grid-flow-row flex flex-col grow h-[calc(var(--lcd-height,44px)-3px)] justify-center max-w-full overflow-hidden relative">
                          <div className="max-w-full w-full">
                            <div className="w-full text-(--systemPrimary) [--paddle-controls-offset-inline-end:52px] [font:var(--body-emphasized)]">
                              <div>
                                <div className="items-center flex flex-row justify-[var(--lcd-justify-text,center)] overflow-clip relative [text-align:var(--lcd-justify-text,center)] [text-overflow:none] whitespace-nowrap w-full">
                                  <div className="w-auto min-w-0 relative pe-0">
                                    <div className="h-3.75 w-full">
                                      <div className="[--marquee-scroll-width:calc((var(--marquee-text-content-width)+var(--marquee-line-padding,8px))/1)] grid grid-cols-[auto_1fr] h-3.75">
                                        <div>
                                          <span className="flex items-center gap-[0.333em]">
                                            <span className="no-underline text-inherit">
                                              Die With A Smile
                                            </span>
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="absolute max-h-4 top-[-1.21px] ml-1 inset-s-[calc(100%+4px)]">
                                      <div className="-ms-1 relative z-[calc(var(--z-default)+1)] opacity-0 group-hover/metadata:opacity-100 transition-opacity duration-120">
                                        <button className="group/star [--favoriteIconStarOutline:var(--favoriteButtonStarOutline,transparent)] [--favoriteIconStarFill:var(--favoriteButtonStarFill,transparent)] items-center bg-(--favoriteButtonBackground,transparent) flex h-(--favoriteButtonSize,100%) justify-center leading-none w-(--favoriteButtonSize,100%)">
                                          <svg
                                            width="64"
                                            height="64"
                                            viewBox="0 0 64 64"
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="h-(--favoriteIconSize,9px) w-(--favoriteIconSize,9px)"
                                          >
                                            <path
                                              className="fill-[hsla(0,0%,100%,.4)] group-hover/star:fill-(--keyColor) transition-colors duration-120"
                                              d="M13.559 60.051c1.102.86 2.5.565 4.166-.645l14.218-10.455L46.19 59.406c1.666 1.21 3.037 1.505 4.166.645 1.102-.833 1.344-2.204.672-4.166l-5.618-16.718 14.353-10.32c1.666-1.183 2.338-2.42 1.908-3.764-.43-1.29-1.693-1.935-3.763-1.908l-17.605.108-5.348-16.8C34.308 4.496 33.34 3.5 31.944 3.5c-1.372 0-2.34.995-2.984 2.984L23.61 23.283l-17.605-.108c-2.07-.027-3.333.618-3.763 1.908-.457 1.344.242 2.58 1.909 3.763l14.352 10.321-5.617 16.718c-.672 1.962-.43 3.333.672 4.166Zm3.87-5.321c-.054-.054-.027-.081 0-.242l5.349-15.374c.376-1.049.161-1.882-.78-2.527L8.613 27.341c-.134-.08-.161-.134-.134-.215.027-.08.08-.08.242-.08l16.26.295c1.103.027 1.802-.43 2.151-1.532l4.677-15.562c.027-.162.08-.215.134-.215.08 0 .135.053.162.215l4.676 15.562c.35 1.102 1.048 1.559 2.15 1.532l16.261-.296c.162 0 .216 0 .243.081.027.08-.027.134-.135.215l-13.385 9.246c-.94.645-1.156 1.478-.78 2.527l5.35 15.374c.026.161.053.188 0 .242-.055.08-.135.026-.243-.054l-12.928-9.864c-.86-.672-1.855-.672-2.715 0l-12.928 9.864c-.107.08-.188.134-.242.054Z"
                                            ></path>
                                          </svg>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="min-h-3.25 relative transition-colors duration-100 ease-in w-(--lcd-secondary-width,100%) text-(--lcd-secondary-text-color,var(--systemSecondary)) [font:var(--callout-medium)] mt-0.5">
                            <div className="h-5.25 absolute -top-1.25 w-full">
                              <div className="flex flex-row items-center justify-end box-border overflow-clip relative text-center whitespace-nowrap w-full grow shrink pe-1">
                                <div className="min-w-0 w-auto p-(--lcd-line-padding,0_10px)">
                                  <div className="w-full box-border h-5.25 pt-0.75 pb-0.5 [mask:var(--secondary-mask-hover,var(--stopped-marquee-mask,linear-gradient(270deg,transparent_var(--lcd-marquee-offset,35px),#000_calc(var(--lcd-marquee-offset,35px)+15px))))]">
                                    <div
                                      className="grid grid-cols-[auto_1fr] h-3.75 z-(--z-default) [--marquee-scroll-width:calc((var(--marquee-text-content-width)+var(--marquee-line-padding,8px))/1px)] animate-marquee"
                                      style={
                                        {
                                          "--marquee-text-content-width":
                                            "297.8587951660156px",
                                        } as React.CSSProperties
                                      }
                                    >
                                      <div className="pe-(--marquee-line-padding,8px)">
                                        <span className="flex items-center gap-[.333em]">
                                          <span className="text-inherit no-underline">
                                            <button className="hover:text-(--keyColor) hover:underline">
                                              Lady Gaga
                                            </button>
                                            {", "}
                                          </span>

                                          <span className="text-inherit no-underline">
                                            <button className="hover:text-(--keyColor) hover:underline">
                                              Bruno Mars
                                            </button>
                                          </span>

                                          <span className="text-inherit no-underline">
                                            —
                                          </span>

                                          <span className="text-inherit no-underline">
                                            <button className="hover:text-(--keyColor) hover:underline">
                                              Die With A Smile - Single
                                            </button>
                                          </span>
                                        </span>
                                      </div>
                                      <div className="pe-(--marquee-line-padding,8px)">
                                        <span className="flex items-center gap-[.333em]">
                                          <span className="text-inherit no-underline">
                                            <button className="hover:text-(--keyColor) hover:underline">
                                              Lady Gaga
                                            </button>
                                            {", "}
                                          </span>

                                          <span className="text-inherit no-underline">
                                            <button className="hover:text-(--keyColor) hover:underline">
                                              Bruno Mars
                                            </button>
                                          </span>

                                          <span className="text-inherit no-underline">
                                            —
                                          </span>

                                          <span className="text-inherit no-underline">
                                            <button className="hover:text-(--keyColor) hover:underline">
                                              Die With A Smile - Single
                                            </button>
                                          </span>
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="absolute top-0 max-h-4 inset-e-(--menu-position-shift,26px)"></div>
                                </div>
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
                        <AmpContextMenuButton />
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
                <div>
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

                {lyricsMounted && (
                  <div
                    className={`min-[1000px]:backdrop-saturate-220 min-[1000px]:backdrop-blur-lg min-[1000px]:bg-(--glassMaterialBackground) min-[1000px]:shadow-[0_10px_40px_var(--glassMaterialShadowColor)] min-[1000px]:h-screen min-[1000px]:overflow-y-hidden min-[1000px]:top-0 border-s-[0.5px] border-s-(--systemQuaternary) bottom-0 inset-e-0 overflow-x-hidden fixed scroll-pt-14.5 top-13.5 w-75 z-[calc(var(--z-web-chrome)+1)] [--side-panel-horizontal-padding:20px] transition-transform duration-300 ease-[cubic-bezier(.215,.61,.355,1)] ${showLyrics ? "translate-x-0" : "translate-x-full"}`}
                  >
                    <div className="h-[calc(100dvh-58px)] overflow-y-auto">
                      <div className="[--lyrics-linear-gradient:linear-gradient(180deg,#000,transparent)]">
                        <div className="[--lyrics-toggle-button-size:26px] bg-(--lyrics-bg) text-[0] my-2.5 mx-4 opacity-0 p-1.25 absolute right-0 align-top z-(--z-default)">
                          <button className="backdrop-blur-[60px] bg-(--systemQuaternary) rounded-lg p-1 relative z-(--z-default)">
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

                        <AmpLyrics />
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={toggleQueue}
                  className={`flex items-center justify-center rounded h-7 relative w-(--player-action-button-width,32px) z-(--z-default) ${showQueue ? "text-(--keyColor)" : ""}`}
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

                {queueMounted && (
                  <div
                    className={`min-[1000px]:[backdrop-filter:saturate(220%)_blur(16px)] min-[1000px]:bg-(--glassMaterialBackground) min-[1000px]:shadow-[0_10px_40px_var(--glassMaterialShadowColor)] min-[1000px]:h-screen min-[1000px]:overflow-y-hidden min-[1000px]:top-0 border-s-[0.5px] border-s-(--systemQuaternary) bottom-0 inset-e-0 overflow-x-hidden fixed scroll-pt-14.5 top-13.5 w-75 z-[calc(var(--z-web-chrome)+1)] [--side-panel-horizontal-padding:20px] transition-transform duration-300 ease-[cubic-bezier(.215,.61,.355,1)] ${showQueue ? "translate-x-0" : "translate-x-full"}`}
                  >
                    <div className="[backdrop-filter:none] bg-transparent flex flex-col pb-3 pe-5 pt-5.75 ps-5 sticky top-0 z-[calc(var(--z-default)+6)]">
                      <div className="flex justify-between text-(--systemPrimary)">
                        <h3 className="pe-2.5 [font:var(--title-2-emphasized)]">
                          Up Next
                        </h3>
                        <div className="flex items-center">
                          <div className="pe-2.5">{/* something */}</div>
                        </div>
                      </div>
                    </div>

                    <div className="z-[calc(var(--z-default)+4)] absolute inset-0 flex items-center justify-center h-full w-full m-auto text-center [font:var(--callout)]">
                      <div
                        slot="empty"
                        className="flex items-center justify-center h-full w-full text-center px-(--side-panel-horizontal-padding,0px)"
                      >
                        No upcoming songs.
                      </div>
                    </div>
                  </div>
                )}

                <div
                  onMouseLeave={() => setIsExpanded(false)}
                  className={`chrome-volume svelte-13xdpwq ${isExpanded ? "chrome-volume--expanded" : ""}`}
                >
                  <div className="chrome-volume__slider svelte-13xdpwq">
                    {isExpanded && (
                      <div className="volume-control svelte-knrh2y">
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={volume}
                          onChange={(e) => setVolume(Number(e.target.value))}
                          style={
                            {
                              "--progress": `${volume * 100}%`,
                            } as React.CSSProperties
                          }
                          className="volume-control__range svelte-knrh2y"
                        />
                      </div>
                    )}
                  </div>

                  <div className="[--chromeVolumeIconFill:var(--systemPrimary)] flex h-full relative z-[calc(var(--z-default)+1)]">
                    <button onClick={toggleMute} className="flex items-center">
                      <svg
                        className="h-6 w-6"
                        fill="currentColor"
                        role="presentation"
                        version="1.1"
                        viewBox="0 0 64 64"
                      >
                        <path
                          transform="translate(2,11.149)"
                          d="m23.477 39.911c1.4129 0 2.431-1.0389 2.431-2.431v-33.141c0-1.3921-1.0181-2.5349-2.4726-2.5349-1.0181 0-1.7038 0.43634-2.805 1.4752l-9.2046 8.6644c-0.14545 0.12464-0.31166 0.18698-0.51945 0.18698h-6.2126c-2.9297 0-4.5088 1.5999-4.5088 4.7374v8.0411c0 3.1167 1.5791 4.7166 4.5088 4.7166h6.2126c0.20779 0 0.374 0.06234 0.51945 0.18698l9.2046 8.7475c0.99732 0.93501 1.8285 1.3506 2.8466 1.3506z"
                        ></path>
                        <path
                          className={`transition-opacity duration-120 ease-linear ${volume > 0 ? "opacity-100" : "opacity-0"}`}
                          transform="translate(2,11.149)"
                          d="m34.864 29.959c0.70647 0.49868 1.7246 0.35323 2.3271-0.47787 1.6205-2.1817 2.5971-5.3815 2.5971-8.6436 0-3.2621-0.9766-6.4411-2.5971-8.6436-0.60255-0.83111-1.5999-0.97655-2.3271-0.49868-0.89345 0.62336-1.0181 1.683-0.35319 2.5765 1.2051 1.6207 1.9323 4.0932 1.9323 6.5658 0 2.4726-0.76881 4.9451-1.9531 6.5866-0.62332 0.89345-0.51945 1.9116 0.374 2.5349z"
                        ></path>
                        <path
                          className={`transition-opacity duration-120 ease-linear ${volume > 0.3 ? "opacity-100" : "opacity-0"}`}
                          transform="translate(2,11.149)"
                          d="m43.154 35.569c0.81021 0.54023 1.8077 0.33245 2.3894-0.49867 2.7426-3.8231 4.3426-8.9137 4.3426-14.233 0-5.3399-1.5583-10.451-4.3426-14.254-0.60255-0.81034-1.5791-1.0181-2.3894-0.47787-0.78979 0.54021-0.91447 1.5583-0.29106 2.4518 2.2647 3.3245 3.6779 7.6878 3.6779 12.28s-1.3923 8.9969-3.6779 12.28c-0.60255 0.89345-0.49872 1.9116 0.29106 2.4518z"
                        ></path>
                        <path
                          className={`transition-opacity duration-120 ease-linear ${volume > 0.7 ? "opacity-100" : "opacity-0"}`}
                          transform="translate(2,11.149)"
                          d="m51.527 41.241c0.76894 0.51945 1.7872 0.31166 2.3898-0.54021 3.8438-5.423 6.0255-12.446 6.0255-19.864s-2.2443-14.42-6.0255-19.864c-0.60255-0.87268-1.6209-1.0805-2.3898-0.54021-0.78936 0.56098-0.91404 1.5791-0.31149 2.4518 3.3451 4.9244 5.423 11.241 5.423 17.952 0 6.7113-1.9945 13.132-5.423 17.952-0.60255 0.87268-0.47787 1.8908 0.31149 2.4518z"
                        ></path>
                      </svg>
                      <span className="sr-only">Mute</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
