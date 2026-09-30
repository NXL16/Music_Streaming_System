"use client";

import AmpChromeVolume from "@/components/custom-elements/AmpChromeVolume";
import AmpContextMenuButton from "@/components/custom-elements/AmpContextMenuButton";
import { M404ContextualMenuPortalHost } from "@/components/custom-elements/m404-contextual-menu";
import AmpLcdMetadata from "@/components/custom-elements/AmpLcdMetadata";
import AmpLyrics from "@/components/custom-elements/AmpLyrics";
import AmpPlaybackControls from "@/components/custom-elements/AmpPlaybackControls";
import AmpPlaybackControlsProgress from "@/components/custom-elements/AmpPlaybackControlsProgress";
import CardArtwork from "@/components/media/common/card-artwork";
import { VocalVolumeControl } from "./vocal-volume-control";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useFavoriteStore } from "@/lib/favorites/use-favorite-store";
import { toggleSongFavorite } from "@/lib/favorites/toggle-song-favorite";
import { FavoriteActionButton } from "@/components/songs/favorite-action-button";
import { usePlayerStore, type PlayerSong } from "@/lib/player/use-player-store";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";

const LyricsBackground = dynamic(
  () =>
    import("@/components/player/lyrics-background").then(
      (module) => module.LyricsBackground,
    ),
  { ssr: false },
);

const AmbientVideo = dynamic(
  () => import("@/components/custom-elements/AmpVideo"),
  { ssr: false, loading: () => null },
);

type MusicPlayDetailProps = {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  currentSong: PlayerSong;
  initialLyricOpen?: boolean;
  onClose: (value: boolean) => void;
  volume: number;
  onSetVolume: (volume: number) => void;
  isStemActive: boolean;
  vocalVolume: number;
  isVocalControlExpanded: boolean;
  onVocalControlExpandedChange: (expanded: boolean) => void;
  onSetVocalVolume: (volume: number) => void;
  onPreviewVocalVolume: (volume: number) => void;
  onTogglePlayback: () => void;
};

export default function MusicPlayDetail({
  audioRef,
  currentSong,
  initialLyricOpen = false,
  onClose,
  volume,
  onSetVolume,
  isStemActive,
  vocalVolume,
  isVocalControlExpanded,
  onVocalControlExpandedChange,
  onSetVocalVolume,
  onPreviewVocalVolume,
  onTogglePlayback,
}: MusicPlayDetailProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [isOpenLyric, setIsOpenLyric] = useState(initialLyricOpen);
  const [isFavoriteSaving, setIsFavoriteSaving] = useState(false);
  const [loadedArtworkSrcSet, setLoadedArtworkSrcSet] = useState<string>();
  const [visibleBlurArtworkSrcSet, setVisibleBlurArtworkSrcSet] =
    useState<string>();
  const artworkSrcSet = currentSong.artworkSrcSet ?? currentSong.artworkUrl;
  const thumbnailArtworkSrcSet =
    currentSong.thumbnailArtworkSrcSet ?? artworkSrcSet;
  const isArtworkLoading = loadedArtworkSrcSet !== artworkSrcSet;
  const isBlurArtworkVisible = visibleBlurArtworkSrcSet === artworkSrcSet;
  const artworkColor = currentSong.artworkBgColor ?? "var(--genericJoeColor)";
  const artworkColors = { bg: artworkColor, main: artworkColor };
  const playing = usePlayerStore((state) => state.playing);
  const userId = useAuthStore((state) => state.user?.userId);
  const isCurrentSongFavorite = useFavoriteStore((state) =>
    state.songIds.has(currentSong.id),
  );
  const markArtworkLoaded = (loadedArtworkSrcSet: string) => {
    requestAnimationFrame(() => {
      setLoadedArtworkSrcSet(loadedArtworkSrcSet);
    });
  };

  useEffect(() => {
    if (loadedArtworkSrcSet !== artworkSrcSet) return;

    const timer = window.setTimeout(() => {
      setVisibleBlurArtworkSrcSet(artworkSrcSet);
    }, 5_000);

    return () => window.clearTimeout(timer);
  }, [artworkSrcSet, loadedArtworkSrcSet]);

  const mainArtwork = (
    <CardArtwork
      key={artworkSrcSet}
      variant="cover"
      sizes="(max-width:1319px) 450px,(min-width:1320px) and (max-width:1679px) 600px,600px"
      title={currentSong.title}
      imageSrcSet={artworkSrcSet}
      artworkColors={artworkColors}
      onArtworkLoad={() => markArtworkLoaded(artworkSrcSet)}
    />
  );

  const handleFavoriteClick = async () => {
    if (isFavoriteSaving) return;

    setIsFavoriteSaving(true);
    try {
      await toggleSongFavorite(currentSong.id, currentSong.albumId);
    } finally {
      setIsFavoriteSaving(false);
    }
  };

  useEffect(() => {
    const previouslyFocusedElement = document.activeElement;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose(false);
        return;
      }

      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusableElements = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("hidden"));
      const first = focusableElements[0];
      const last = focusableElements.at(-1);
      if (!first || !last) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocusedElement instanceof HTMLElement) {
        previouslyFocusedElement.focus();
      }
    };
  }, [onClose]);

  return (
    <>
      {createPortal(
        <div className="portal">
          <div className="items-center flex flex-col size-full justify-center left-0 opacity-100 fixed top-0 z-(--z-modal)">
            <div className="bg-(--modalScrimColor) size-full absolute z-[calc(var(--z-modal)-1)]"></div>
            <div className="rounded-(--modalBorderRadius,10px) h-(--full-screen-modal-height,auto) max-h-(--full-screen-modal-max-height,none) max-w-(--full-screen-modal-max-width,none) overflow-hidden relative w-(--full-screen-modal-width,auto) z-(--z-modal) has-[.lyrics-container]:[--full-screen-modal-width:100%] has-[.lyrics-container]:[--full-screen-modal-height:100%] has-[.lyrics-container]:[--full-screen-modal-max-width:2560px] has-[.lyrics-container]:[--full-screen-modal-max-height:1440px] has-[.lyrics-container]:rounded-none">
              <article
                ref={dialogRef}
                aria-label="Trình phát nhạc"
                aria-modal="true"
                className={`lyrics-container ${isOpenLyric ? "" : "is-lyrics-off"}`}
                role="dialog"
                tabIndex={-1}
              >
                <M404ContextualMenuPortalHost />
                <div className="contents [--lyrics-border-radius:0]">
                  <div className="rounded-[inherit] h-full overflow-hidden pointer-events-none absolute w-full z-(--z-default)">
                    <LyricsBackground artworkSrcSet={thumbnailArtworkSrcSet} />
                  </div>
                </div>
                <button
                  ref={closeButtonRef}
                  onClick={() => onClose(false)}
                  className="self-start h-4.5 m-[16px_20px_10px] absolute top-0 w-4.5 fill-(--systemSecondary-onDark) z-(--z-default)"
                  type="button"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    aria-hidden="true"
                  >
                    <path d="M1.2 18C.6 18 0 17.5 0 16.8c0-.4.1-.6.4-.8l7-7-7-7c-.3-.2-.4-.5-.4-.8C0 .5.6 0 1.2 0c.3 0 .6.1.8.3l7 7 7-7c.2-.2.5-.3.8-.3.6 0 1.2.5 1.2 1.2 0 .3-.1.6-.4.8l-7 7 7 7c.2.2.4.5.4.8 0 .7-.6 1.2-1.2 1.2-.3 0-.6-.1-.8-.3l-7-7-7 7c-.2.1-.5.3-.8.3z"></path>
                  </svg>
                </button>
                {isStemActive && isOpenLyric && (
                  <VocalVolumeControl
                    value={vocalVolume}
                    isExpanded={isVocalControlExpanded}
                    onExpandedChange={onVocalControlExpandedChange}
                    onValueChange={onSetVocalVolume}
                    onPreviewValueChange={onPreviewVocalVolume}
                  />
                )}
                <div className="grid [grid-area:controls] grid-rows-[auto_55px_65px_55px_26px] grid-cols-none [grid-template-areas:'artwork'_'metadata'_'scrubber'_'controls'_'volume'] h-fit mt-5 max-w-150 place-items-center place-self-center w-full z-[calc(var(--z-default)+1)]">
                  <div className="shadow-[0_20px_25px_rgba(0,0,0,.1),0_10px_25px_rgba(0,0,0,.1)] opacity-100 [grid-area:artwork] h-full transform-[scale(.92)] origin-[bottom_center] [--global-transition-duration:1s] [transition:var(--global-transition)]">
                    {isBlurArtworkVisible && (
                      <div className="filter-[blur(20px)_saturate(2)] size-full opacity-40">
                        <CardArtwork
                          variant="cover"
                          sizes="40px"
                          title={currentSong.title}
                          imageSrcSet={thumbnailArtworkSrcSet}
                          artworkColors={artworkColors}
                        />
                      </div>
                    )}
                  </div>
                  <div
                    className={`bg-(--artwork-bg-color) items-center rounded-lg flex [grid-area:artwork] aspect-[1] h-full justify-center w-full [transition:var(--global-transition)] min-[1320px]:rounded-[10px] min-[1680px]:rounded-xl ${isArtworkLoading ? "" : "shadow-[0_4px_10px_rgba(0,0,0,.1)]"}`}
                    style={
                      {
                        "--artwork-bg-color": artworkColors.bg,
                      } as CSSProperties
                    }
                  >
                    {currentSong.albumVideoSrc ? (
                      <div className="w-[inherit] rounded-[inherit] relative z-(--z-default)">
                        {mainArtwork}

                        <div className="rounded-[inherit] size-full pointer-events-none absolute top-0 z-(--z-default)">
                          <AmbientVideo
                            src={currentSong.albumVideoSrc}
                            variant="artist"
                            keepAlive
                          />
                        </div>
                      </div>
                    ) : (
                      mainArtwork
                    )}
                  </div>

                  <div className="items-center flex justify-between w-full min-w-0 overflow-hidden">
                    <AmpLcdMetadata
                      currentSong={currentSong}
                      isPlaying={playing}
                      onCloseModal={() => onClose(false)}
                    />
                    <div className="items-center flex gap-4 justify-end  pt-5.5 ps-1 [--contextMenuCircleFillOverride:var(--systemQuaternary-onDark)] [--favoriteButtonSize:28px] [--favoriteButtonBackground:var(--systemQuaternary-onDark)] [--favoriteButtonStarOutline:var(--systemPrimary-onDark)] [--favoriteButtonStarCutout:var(--systemSecondary-onDark)] [--favoriteButtonStarFill:transparent] [--favoriteButtonBackground-hover:var(--favoriteButtonBackground)] [--favoriteButtonStarOutline-hover:var(--favoriteButtonStarOutline)] [--favoriteButtonStarCutout-hover:var(--favoriteButtonStarCutout)] [--favoriteButtonStarFill-hover:var(--favoriteButtonStarFill)] [--contextMenuButtonSize:28px]">
                      <FavoriteActionButton
                        ariaLabel={
                          isCurrentSongFavorite
                            ? "Remove from favourites"
                            : "Add to favourites"
                        }
                        disabled={isFavoriteSaving}
                        onClick={() => void handleFavoriteClick()}
                        active={isCurrentSongFavorite}
                      />

                      <AmpContextMenuButton
                        id={`song-${currentSong.id}`}
                        context={{
                          kind: "song",
                          songId: currentSong.id,
                          releaseTrackId: currentSong.releaseTrackId,
                          sourceAlbumId: currentSong.albumId,
                          title: currentSong.title,
                          userId,
                          isFavorite: isCurrentSongFavorite,
                        }}
                        hasPlatter
                      />
                    </div>
                  </div>
                  <div className="p-[20px_0_0] w-full">
                    <AmpPlaybackControlsProgress
                      inDetailView
                      audioRef={audioRef}
                    />
                  </div>
                  <AmpPlaybackControls onTogglePlayback={onTogglePlayback} />

                  <AmpChromeVolume volume={volume} onSetVolume={onSetVolume} />
                </div>

                {isOpenLyric && (
                  <div className="flex items-center [grid-area:lyrics] h-dvh max-w-[972.8px] mix-blend-plus-lighter overflow-y-auto z-(--z-default) [--lyrics-line-margin-top:0] [--lyrics-line-margin-right:0] [--lyrics-line-margin-bottom:34px] [--lyrics-line-margin-left:0]">
                    <AmpLyrics
                      songId={currentSong.id}
                      audioRef={audioRef}
                      inDetailView
                    />
                  </div>
                )}

                <div
                  className="min-[1000px]:[--arrow-position:end_end] min-[1000px]:[--popover-inset-inline-end:calc(anchor(var(--anchor-name)_end)+12px)] min-[1000px]:[--popover-inset-block-end:calc(anchor(var(--anchor-name)_start)+16px)] bottom-5 inset-e-5 absolute z-(--z-default)"
                  style={
                    {
                      "--anchor-name": "--popover-18",
                    } as CSSProperties
                  }
                >
                  <button
                    type="button"
                    onClick={() => setIsOpenLyric((prev) => !prev)}
                    className="[--svgFill:var(--systemSecondary-onDark)] rounded-lg h-7 w-7 leading-0 relative z-(--z-default)"
                    style={
                      {
                        anchorName: "var(--anchor-name)",
                      } as CSSProperties
                    }
                  >
                    {isOpenLyric ? (
                      <svg
                        className="rounded-[inherit] fill-(--svgFill,var(--keyColor))"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 28 28"
                        width="28"
                        height="28"
                        role="presentation"
                      >
                        <mask data-testid="invertible-mask" id="uid-6">
                          <rect width="100%" height="100%" fill="white"></rect>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 64 64"
                            width="22"
                            height="22"
                            x="3"
                            y="3"
                            fill="black"
                          >
                            <path d="M17.347 62.821c1.254 0 2.21-.572 3.705-1.933L31.78 51.26h18.443C58.943 51.26 64 46.13 64 37.504V14.956C64 6.33 58.944 1.179 50.223 1.179H13.777C5.057 1.179 0 6.322 0 14.956v22.548C0 46.137 5.27 51.26 13.456 51.26h.994v8.327c0 1.97 1.095 3.235 2.897 3.235zm-.108-39.64c0-3.71 2.79-6.37 6.53-6.37 4.18 0 6.89 3.383 6.89 7.694 0 7.102-5.871 11.086-9.19 11.086-.917 0-1.596-.593-1.596-1.43 0-.742.387-1.242 1.403-1.474 2.4-.587 4.629-2.31 5.53-4.606h-.407c-.823.983-2.108 1.318-3.512 1.318-3.417 0-5.648-2.669-5.648-6.217zm16.387 0c0-3.71 2.77-6.37 6.508-6.37 4.18 0 6.912 3.383 6.912 7.694 0 7.102-5.871 11.086-9.179 11.086-.928 0-1.617-.593-1.617-1.43 0-.742.39-1.242 1.392-1.474 2.436-.587 4.654-2.31 5.551-4.606h-.407c-.823.983-2.108 1.318-3.523 1.318-3.405 0-5.637-2.669-5.637-6.217z"></path>
                          </svg>
                        </mask>
                        <rect
                          data-testid="invertible-mask-rect"
                          width="100%"
                          height="100%"
                          mask="url(#uid-6)"
                        ></rect>
                      </svg>
                    ) : (
                      <svg
                        className="rounded-[inherit] fill-(--svgFill,var(--keyColor))"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 28 28"
                        width="28"
                        height="28"
                        role="presentation"
                      >
                        <mask id="uid-29">
                          <rect width="100%" height="100%" fill="black"></rect>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 64 64"
                            width="22"
                            height="22"
                            x="3"
                            y="3"
                            fill="white"
                          >
                            <path d="M18.53 62.724c1.764 0 3.115-.81 5.257-2.707l9.816-8.638h16.62c8.72 0 13.777-5.152 13.777-13.777V15.053c0-8.625-5.056-13.777-13.777-13.777H13.777C5.057 1.276 0 6.42 0 15.053v22.549c0 8.633 5.27 13.777 13.456 13.777h1.016v6.793c0 2.812 1.511 4.552 4.057 4.552zm1.57-7.16v-8.11c0-1.81-.805-2.485-2.486-2.485h-3.55c-5.165 0-7.654-2.603-7.654-7.654V15.34c0-5.033 2.489-7.632 7.654-7.632h35.872c5.149 0 7.654 2.599 7.654 7.632v21.975c0 5.051-2.505 7.654-7.654 7.654H33.188c-1.835 0-2.702.33-4.012 1.65zm-2.212-32.177c0 3.398 2.156 5.936 5.388 5.936 1.361 0 2.592-.302 3.372-1.263h.385c-.868 2.231-3 3.845-5.303 4.4-.95.243-1.327.737-1.327 1.425 0 .8.658 1.36 1.51 1.36 3.174 0 8.8-3.775 8.8-10.6 0-4.138-2.602-7.336-6.588-7.336-3.576 0-6.237 2.518-6.237 6.078zm15.663 0c0 3.398 2.134 5.936 5.387 5.936 1.34 0 2.593-.302 3.373-1.263h.39c-.865 2.231-3.023 3.845-5.308 4.4-.947.243-1.327.737-1.327 1.425 0 .8.636 1.36 1.51 1.36 3.178 0 8.779-3.775 8.779-10.6 0-4.138-2.577-7.336-6.567-7.336-3.577 0-6.237 2.518-6.237 6.078z"></path>
                          </svg>
                        </mask>
                        <rect
                          width="100%"
                          height="100%"
                          mask="url(#uid-29)"
                        ></rect>
                      </svg>
                    )}
                  </button>
                </div>
              </article>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
