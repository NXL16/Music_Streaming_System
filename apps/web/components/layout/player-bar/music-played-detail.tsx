import AmpChromeVolume from "@/components/custom-elements/AmpChromeVolume";
import AmpContextMenuButton from "@/components/custom-elements/AmpContextMenuButton";
import { M404ContextualMenuPortalHost } from "@/components/custom-elements/m404-contextual-menu";
import AmpLcdMetadata from "@/components/custom-elements/AmpLcdMetadata";
import AmpLyrics from "@/components/custom-elements/AmpLyrics";
import AmpPlaybackControls from "@/components/custom-elements/AmpPlaybackControls";
import AmpPlaybackControlsProgress from "@/components/custom-elements/AmpPlaybackControlsProgress";
import CardArtwork from "@/components/media/common/card-artwork";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useFavoriteStore } from "@/lib/favorites/use-favorite-store";
import { toggleSongFavorite } from "@/lib/favorites/toggle-song-favorite";
import { usePlayerStore, type PlayerSong } from "@/lib/player/use-player-store";
import { CSSProperties, useState } from "react";
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
};
export default function MusicPlayDetail({
  audioRef,
  currentSong,
  initialLyricOpen = false,
  onClose,
  volume,
  onSetVolume,
}: MusicPlayDetailProps) {
  const [isOpenLyric, setIsOpenLyric] = useState(initialLyricOpen);
  const [isFavoriteSaving, setIsFavoriteSaving] = useState(false);
  const artworkSrcSet = currentSong.artworkSrcSet ?? currentSong.artworkUrl;
  const thumbnailArtworkSrcSet =
    currentSong.thumbnailArtworkSrcSet ?? artworkSrcSet;
  const artworkColor = currentSong.artworkBgColor ?? "var(--genericJoeColor)";
  const artworkColors = { bg: artworkColor, main: artworkColor };
  const playing = usePlayerStore((state) => state.playing);
  const userId = useAuthStore((state) => state.user?.userId);
  const isCurrentSongFavorite = useFavoriteStore((state) =>
    state.songs.some((song) => song.id === currentSong.id),
  );

  const handleFavoriteClick = async () => {
    if (isFavoriteSaving) return;

    setIsFavoriteSaving(true);
    try {
      await toggleSongFavorite(currentSong.id);
    } finally {
      setIsFavoriteSaving(false);
    }
  };
  return (
    <>
      {createPortal(
        <div className="portal">
          <div className="items-center flex flex-col size-full justify-center left-0 opacity-100 fixed top-0 z-(--z-modal)">
            <div className="bg-(--modalScrimColor) size-full absolute z-[calc(var(--z-modal)-1)]"></div>
            <div className="rounded-(--modalBorderRadius,10px) h-(--full-screen-modal-height,auto) max-h-(--full-screen-modal-max-height,none) max-w-(--full-screen-modal-max-width,none) overflow-hidden relative w-(--full-screen-modal-width,auto) z-(--z-modal) has-[.lyrics-container]:[--full-screen-modal-width:100%] has-[.lyrics-container]:[--full-screen-modal-height:100%] has-[.lyrics-container]:[--full-screen-modal-max-width:2560px] has-[.lyrics-container]:[--full-screen-modal-max-height:1440px] has-[.lyrics-container]:rounded-none">
              <article
                className={`lyrics-container ${isOpenLyric ? "" : "is-lyrics-off"}`}
              >
                <M404ContextualMenuPortalHost />
                <div className="contents [--lyrics-border-radius:0]">
                  <div className="rounded-[inherit] h-full overflow-hidden pointer-events-none absolute w-full z-(--z-default)">
                    <LyricsBackground
                      artworkSrcSet={artworkSrcSet}
                      artworkUrl={currentSong.artworkUrl}
                    />
                  </div>
                </div>
                <button
                  onClick={() => onClose(false)}
                  className="self-start h-4.5 m-[16px_20px_10px] absolute top-0 w-4.5 fill-(--systemSecondary-onDark) z-(--z-default)"
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
                <div className="grid [grid-area:controls] [grid-template:'artwork'_auto_'metadata'_55px_'scrubber'_65px_'controls'_55px_'volume'_26px] h-fit mt-5 max-w-150 place-items-center place-self-center w-full z-[calc(var(--z-default)+1)]">
                  <div className="[grid-area:artwork] aspect-square h-auto w-full transform-[scale(.92)] origin-[bottom_center] [--global-transition-duration:1s] [transition:var(--global-transition)] shadow-[0_20px_25px_rgba(0,0,0,.1),0_10px_25px_rgba(0,0,0,.1)] opacity-100">
                    <div className="filter-[blur(20px)_saturate(2)] size-full opacity-40">
                      <CardArtwork
                        variant="cover"
                        sizes="40px"
                        title={currentSong.title}
                        imageSrcSet={thumbnailArtworkSrcSet}
                        artworkColors={artworkColors}
                      />
                    </div>
                  </div>
                  <div className="items-center rounded-lg flex [grid-area:artwork] size-full justify-center overflow-hidden relative [transition:var(--global-transition)] shadow-[0_4px_10px_rgba(0,0,0,.1)] min-[1320px]:rounded-[10px] min-[1680px]:rounded-xl">
                    <CardArtwork
                      variant="cover"
                      sizes="(max-width:1319px) 450px,(min-width:1320px) and (max-width:1679px) 600px,600px"
                      title={currentSong.title}
                      imageSrcSet={artworkSrcSet}
                      artworkColors={artworkColors}
                      retainPreviousArtwork
                    />

                    {currentSong.albumVideoSrc && (
                      <div className="rounded-[inherit] size-full pointer-events-none absolute top-0 z-(--z-default)">
                        <AmbientVideo
                          src={currentSong.albumVideoSrc}
                          variant="artist"
                          keepAlive
                        />
                      </div>
                    )}
                  </div>

                  <div className="items-center flex justify-between w-full min-w-0 overflow-hidden">
                    <AmpLcdMetadata
                      currentSong={currentSong}
                      isPlaying={playing}
                      onCloseModal={() => onClose(false)}
                    />
                    <div className="items-center flex gap-4 justify-end  pt-5.5 ps-1 [--contextMenuCircleFillOverride:var(--systemQuaternary-onDark)] [--favoriteButtonSize:28px] [--favoriteButtonBackground:var(--systemQuaternary-onDark)] [--favoriteButtonStarOutline:var(--systemPrimary-onDark)] [--favoriteButtonStarCutout:var(--systemSecondary-onDark)] [--favoriteButtonStarFill:transparent] [--favoriteButtonBackground-hover:var(--favoriteButtonBackground)] [--favoriteButtonStarOutline-hover:var(--favoriteButtonStarOutline)] [--favoriteButtonStarCutout-hover:var(--favoriteButtonStarCutout)] [--favoriteButtonStarFill-hover:var(--favoriteButtonStarFill)] [--contextMenuButtonSize:28px]">
                      <button
                        type="button"
                        aria-label={
                          isCurrentSongFavorite
                            ? "Remove from favourites"
                            : "Add to favourites"
                        }
                        aria-pressed={isCurrentSongFavorite}
                        disabled={isFavoriteSaving}
                        onClick={() => void handleFavoriteClick()}
                        className={`items-center flex h-(--favoriteButtonSize,100%) justify-center leading-0 w-(--favoriteButtonSize,100%) rounded-[50%] [--favoriteIconStarOutline:var(--favoriteButtonStarOutline)] ${isCurrentSongFavorite ? "[--favoriteIconStarCutout:var(--favoriteButtonStarCutout,var(--keyColor))] [--favoriteIconStarFill:var(--favoriteButtonStarFill,#fff)] bg-(--favoriteButtonBackground,var(--keyColor))" : "bg-(--favoriteButtonBackground,var(--systemQuinary))"}`}
                      >
                        {isCurrentSongFavorite ? (
                          <svg
                            width="60"
                            height="60"
                            viewBox="0 0 60 60"
                            xmlns="http://www.w3.org/2000/svg"
                            className="size-(--favoriteIconSize,28px)"
                          >
                            <circle
                              className="fill-(--favoriteIconStarFill,transparent)"
                              cx="30"
                              cy="30"
                              r="28"
                            ></circle>
                            <path
                              className="fill-(--favoriteIconStarCutout,var(--systemQuinary))"
                              d="M30 60c16.412 0 30-13.618 30-30C60 13.588 46.382 0 29.97 0 13.588 0 0 13.588 0 30c0 16.382 13.618 30 30 30Zm-8.706-14.324c-1.765 1.353-3.647-.029-2.941-2.117l3.412-10.265-8.794-6.265c-1.647-1.205-1.089-3.558 1.147-3.529l10.794.088 3.294-10.323c.647-2.03 2.94-2.03 3.588 0l3.294 10.323 10.794-.088c2.265-.03 2.765 2.353 1.147 3.5l-8.794 6.294 3.441 10.265c.677 2.088-1.176 3.47-2.97 2.117L30 39.324l-8.706 6.352Z"
                            ></path>
                          </svg>
                        ) : (
                          <svg
                            width="60"
                            height="60"
                            viewBox="0 0 60 60"
                            xmlns="http://www.w3.org/2000/svg"
                            className="size-(--favoriteIconSize,28px)"
                          >
                            <path
                              className="fill-(--favoriteIconStarOutline,var(--keyColor))"
                              d="M19.337 44.944c.851.647 1.887.448 3.031-.393l7.444-5.465 7.445 5.465c1.145.84 2.181 1.04 3.033.393.832-.63 1.006-1.68.55-2.99l-2.941-8.742 7.508-5.386c1.144-.806 1.644-1.747 1.3-2.756-.337-.992-1.282-1.476-2.679-1.459l-9.201.07-2.8-8.804c-.43-1.342-1.16-2.083-2.215-2.083-1.044 0-1.775.741-2.212 2.083l-2.8 8.805-9.21-.071c-1.389-.017-2.327.467-2.67 1.45-.345 1.018.163 1.959 1.3 2.765l7.507 5.386-2.94 8.742c-.456 1.31-.283 2.36.55 2.99zm3.418-4.686c-.022-.03-.028-.051-.007-.123l2.575-7.008c.338-.969.296-1.407-.635-2.02l-6.197-4.162c-.053-.04-.075-.071-.064-.102.01-.03.042-.039.113-.039l7.46.262c1.03.026 1.439-.212 1.716-1.215l2.025-7.175c.02-.071.04-.095.071-.095.031 0 .051.024.073.095l2.026 7.175c.277 1.003.693 1.241 1.732 1.215l7.452-.262c.071 0 .103.009.113.04.01.03-.011.052-.064.101l-6.206 4.17c-.922.614-.973 1.043-.628 2.012l2.569 7.008c.02.072.015.094-.007.123-.022.029-.053 0-.105-.033l-5.873-4.615c-.827-.648-1.326-.648-2.162 0l-5.864 4.615c-.052.033-.083.062-.113.033z"
                            ></path>
                          </svg>
                        )}
                      </button>

                      {currentSong && (
                        <AmpContextMenuButton
                          id={`song-${currentSong.id}`}
                          context={{
                            kind: "song",
                            songId: currentSong.id,
                            title: currentSong.title,
                            userId,
                            isFavorite: isCurrentSongFavorite,
                          }}
                          hasPlatter
                        />
                      )}
                    </div>
                  </div>
                  <div className="p-[20px_0_0] w-full">
                    <AmpPlaybackControlsProgress
                      inDetailView
                      audioRef={audioRef}
                    />
                  </div>
                  <AmpPlaybackControls />

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
                  className="inset-e-5 absolute top-5 z-(--z-default) [--arrow-position:start_end] [--popover-inset-inline-end:calc(anchor(var(--anchor-name)_end)+12px)] [--popover-inset-block-start:calc(anchor(var(--anchor-name)_end)+16px)]"
                  style={
                    {
                      "--anchor-name": "--popover-17",
                    } as CSSProperties
                  }
                >
                  <div
                    popover="manual"
                    id="popover-17"
                    className="[background:none] [border:none] inset-be-(--popover-inset-block-end,auto) inset-bs-(--popover-inset-block-start,auto) inset-e-(--popover-inset-inline-end,auto) inset-s-(--popover-inset-inline-start,auto) m-0 overflow-visible p-0 [position:var(--popover-position,fixed)]"
                  >
                    <button className="self-start inset-bs-3.25 inset-e-3.25 -m-1.5 p-1.5 absolute z-[calc(var(--z-default)+1)]">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 18 18"
                        aria-hidden="true"
                        className="size-3.5 fill-(--systemTertiary)"
                      >
                        <path d="M1.2 18C.6 18 0 17.5 0 16.8c0-.4.1-.6.4-.8l7-7-7-7c-.3-.2-.4-.5-.4-.8C0 .5.6 0 1.2 0c.3 0 .6.1.8.3l7 7 7-7c.2-.2.5-.3.8-.3.6 0 1.2.5 1.2 1.2 0 .3-.1.6-.4.8l-7 7 7 7c.2.2.4.5.4.8 0 .7-.6 1.2-1.2 1.2-.3 0-.6-.1-.8-.3l-7-7-7 7c-.2.1-.5.3-.8.3z"></path>
                      </svg>
                    </button>
                    <div className="[border:none] rounded-ee-[10px] rounded-es-[10px] rounded-se-[10px] rounded-ss-[10px] box-border m-0 min-h-10 overflow-visible p-[11px_13px] relative w-(--bubble-tip-width,380px) supports-[backdrop-filter:blur(10px)]:bg-(--systemStandardUltrathickMaterialSover) supports-[backdrop-filter:blur(10px)]:[backdrop-filter:blur(60px)_saturate(220%)] supports-[backdrop-filter:blur(10px)]:dark:[backdrop-filter:blur(60px)_saturate(240%)]">
                      <div>
                        <p className="[font:var(--title-2-emphasized)] mb-0.75 max-w-[calc(100%-17px)]">
                          undefined
                        </p>
                        <p className="[font:var(--title-3)]">undefined</p>
                      </div>
                    </div>
                  </div>
                </div>
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
