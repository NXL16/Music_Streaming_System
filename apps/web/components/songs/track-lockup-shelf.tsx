"use client";

import {
  type CSSProperties,
  type MutableRefObject,
  type PointerEvent,
  useEffect,
  useRef,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CardArtwork from "@/components/media/common/card-artwork";
import AmpContextMenuButton from "@/components/custom-elements/AmpContextMenuButton";
import { AddSongToLibraryButton } from "@/components/songs/add-song-to-library-button";
import { ExplicitBadgeIcon } from "@/components/icons/explicit-badge-icon";
import { PlaybackWaveform } from "@/components/songs/playback-waveform";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useFavoriteStore } from "@/lib/favorites/use-favorite-store";
import { formatReleaseYear } from "@/lib/format/release-date";
import { usePlayerStore, type PlayerSong } from "@/lib/player/use-player-store";
import { ArtistLinks } from "../media/artist-links";
import PlayIcon from "../icons/play-icon";
import PauseIcon from "../icons/pause-icon";

type TrackLockupShelfProps = {
  title: string;
  items: PlayerSong[];
  queue: PlayerSong[];
  moreHref?: string;
  onMore?: () => void;
  onSongOpen?: (song: PlayerSong) => void;
  secondaryMetadata?: "album-year" | "primary-artists";
  layout?: TrackLockupShelfLayout;
};

export type TrackLockupShelfLayout =
  | "TrackLockupsShelfNarrow"
  | "TrackLockupsShelf";

const TRACK_LOCKUP_SHELF_LAYOUTS: Record<
  TrackLockupShelfLayout,
  CSSProperties
> = {
  TrackLockupsShelfNarrow: {
    "--grid-max-content-xsmall": "calc(100% - var(--bodyGutter))",
    "--grid-column-gap-xsmall": "20px",
    "--grid-row-gap-xsmall": "0px",
    "--grid-small": "1",
    "--grid-column-gap-small": "20px",
    "--grid-row-gap-small": "0px",
    "--grid-medium": "2",
    "--grid-column-gap-medium": "20px",
    "--grid-row-gap-medium": "0px",
    "--grid-large": "3",
    "--grid-column-gap-large": "20px",
    "--grid-row-gap-large": "0px",
    "--grid-xlarge": "3",
    "--grid-column-gap-xlarge": "20px",
    "--grid-row-gap-xlarge": "0px",
    "--grid-type": "TrackLockupsShelfNarrow",
    "--grid-rows": "3",
    "--standard-lockup-shadow-offset": "15px",
  } as CSSProperties,

  TrackLockupsShelf: {
    "--grid-max-content-xsmall": "270px",
    "--grid-column-gap-xsmall": "10px",
    "--grid-row-gap-xsmall": "0px",
    "--grid-small": "2",
    "--grid-column-gap-small": "20px",
    "--grid-row-gap-small": "0px",
    "--grid-medium": "3",
    "--grid-column-gap-medium": "20px",
    "--grid-row-gap-medium": "0px",
    "--grid-large": "4",
    "--grid-column-gap-large": "20px",
    "--grid-row-gap-large": "0px",
    "--grid-xlarge": "4",
    "--grid-column-gap-xlarge": "20px",
    "--grid-row-gap-xlarge": "0px",
    "--grid-type": "TrackLockupsShelf",
    "--grid-rows": "3",
    "--standard-lockup-shadow-offset": "15px",
  } as CSSProperties,
};

function primaryArtists(song: PlayerSong) {
  const primaryArtists = song.credits?.filter((credit) => credit.isPrimary);
  return primaryArtists?.length ? primaryArtists : song.artists;
}

export function TrackLockupShelf({
  title,
  items,
  queue,
  moreHref,
  onMore,
  onSongOpen,
  secondaryMetadata = "album-year",
  layout = "TrackLockupsShelf",
}: TrackLockupShelfProps) {
  const router = useRouter();
  const setQueue = usePlayerStore((state) => state.setQueue);
  const currentSong = usePlayerStore((state) => state.currentSong);
  const playing = usePlayerStore((state) => state.playing);
  const togglePlayback = usePlayerStore((state) => state.togglePlayback);
  const userId = useAuthStore((state) => state.user?.userId);
  const favoriteSongIds = useFavoriteStore((state) => state.songIds);
  const dragRef = useRef<{ startX: number; scrollLeft: number } | undefined>(
    undefined,
  );
  const draggedRef = useRef(false);
  const dragElementRef = useRef<HTMLUListElement | null>(null);
  const pendingScrollRef = useRef<number | undefined>(undefined);
  const dragFrameRef = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (dragFrameRef.current !== undefined) {
        cancelAnimationFrame(dragFrameRef.current);
      }
    },
    [],
  );

  if (!items.length) return null;

  const isNarrowLayout = layout === "TrackLockupsShelfNarrow";
  const header = <span>{title}</span>;

  return (
    <div
      className={
        isNarrowLayout
          ? "min-[1000px]:flex-1 min-[1000px]:-ms-5 min-[1000px]:min-w-0"
          : "min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-3 section--alternate"
      }
    >
      <div className="items-center flex justify-end m-[0_var(--bodyGutter)_13px]">
        <div className="flex-1">
          <h2 className="text-(--header-title-color,var(--systemPrimary,#000)) inline-block [font:var(--header-title-font,var(--title-2-emphasized))]">
            {moreHref ? (
              <Link
                className="appearance-none flex items-center gap-1 text-start hover:no-underline"
                href={moreHref}
              >
                {header}

                <ShelfChevron />
              </Link>
            ) : onMore ? (
              <button
                className="flex items-center gap-1 text-start hover:no-underline"
                onClick={onMore}
                type="button"
              >
                {header}

                <ShelfChevron />
              </button>
            ) : (
              header
            )}
          </h2>
        </div>
      </div>

      <div className="pb-8">
        <section
          className="box-border p-[0_var(--shelfGridPaddingInline,var(--bodyGutter))] relative w-full z-(--z-default) max-[999px]:pe-0 max-[999px]:ps-0"
          style={TRACK_LOCKUP_SHELF_LAYOUTS[layout]}
        >
          <div className="top-song box-content -me-0.5 -ms-0.5 overflow-visible pe-0.5 ps-0.5 w-full">
            <ul
              className="shelf-grid__list--artist"
              onClickCapture={(event) => {
                if (!draggedRef.current) return;
                draggedRef.current = false;
                event.preventDefault();
                event.stopPropagation();
              }}
              onPointerDown={(event) => {
                if (event.pointerType !== "mouse" || event.button !== 0) return;
                dragRef.current = {
                  startX: event.clientX,
                  scrollLeft: event.currentTarget.scrollLeft,
                };
                dragElementRef.current = event.currentTarget;
                draggedRef.current = false;
              }}
              onPointerMove={(event) => {
                const drag = dragRef.current;
                if (!drag) return;
                const latestEvent =
                  event.nativeEvent.getCoalescedEvents?.().at(-1) ??
                  event.nativeEvent;
                const distance = latestEvent.clientX - drag.startX;
                if (!draggedRef.current && Math.abs(distance) < 6) return;
                if (!draggedRef.current) {
                  draggedRef.current = true;
                  event.currentTarget.dataset.dragging = "true";
                  event.currentTarget.style.scrollBehavior = "auto";
                  event.currentTarget.setPointerCapture(event.pointerId);
                  event.currentTarget.scrollLeft = drag.scrollLeft - distance;
                  return;
                }
                event.preventDefault();
                pendingScrollRef.current = drag.scrollLeft - distance;
                if (dragFrameRef.current !== undefined) return;
                dragFrameRef.current = requestAnimationFrame(() => {
                  const scrollLeft = pendingScrollRef.current;
                  const container = dragElementRef.current;
                  dragFrameRef.current = undefined;
                  pendingScrollRef.current = undefined;
                  if (container && scrollLeft !== undefined) {
                    container.scrollLeft = scrollLeft;
                  }
                });
              }}
              onPointerUp={(event) =>
                finishDrag(
                  event,
                  dragRef,
                  dragElementRef,
                  pendingScrollRef,
                  dragFrameRef,
                )
              }
              onPointerCancel={(event) =>
                finishDrag(
                  event,
                  dragRef,
                  dragElementRef,
                  pendingScrollRef,
                  dragFrameRef,
                )
              }
              onDragStart={(event) => {
                if (dragRef.current) event.preventDefault();
              }}
            >
              {items.map((song) => {
                const artworkColor =
                  song.artworkBgColor ?? "var(--genericJoeColor)";
                const isCurrentTrack = currentSong?.id === song.id;
                const isTrackPlaying = isCurrentTrack && playing;
                const artistMetadata = primaryArtists(song);
                const songMeta =
                  secondaryMetadata === "primary-artists"
                    ? (song.songArtistName ?? song.artist)
                    : [song.album, formatReleaseYear(song.releaseDate)]
                        .filter(Boolean)
                        .join("\u202f\u00b7\u202f");
                const queueIndex = queue.findIndex(
                  (queuedSong) => queuedSong.id === song.id,
                );

                return (
                  <li
                    className="contain-content -mt-(--override-shelf-overflow-bleed-top,var(--standard-lockup-shadow-offset,15px)) -me-(--standard-lockup-shadow-offset,15px) -mb-(--override-shelf-overflow-bleed-bottom,var(--standard-lockup-shadow-offset,15px)) -ms-(--standard-lockup-shadow-offset,15px) pe-(--standard-lockup-shadow-offset,15px) pb-(--override-shelf-overflow-bleed-bottom,var(--standard-lockup-shadow-offset,15px)) pt-(--override-shelf-overflow-bleed-top,var(--standard-lockup-shadow-offset,15px)) ps-(--standard-lockup-shadow-offset,15px) snap-start"
                    key={song.id}
                  >
                    <div
                      className="group items-center text-(--systemPrimary) grid grid-cols-[auto_auto_1fr_auto] pb-[7.5px] pt-[7.5px] relative w-full pe-(--trackLockupPaddingInlineEnd,14px) cursor-pointer after:[border-top:var(--keyline-border-style)] after:inset-e-0 after:inset-s-0 after:absolute after:top-0 after:z-(--z-default)"
                      onClick={() => {
                        onSongOpen?.(song);
                        if (!song.albumUrl) return;
                        router.push(
                          `${song.albumUrl}?trackId=${encodeURIComponent(song.id)}`,
                        );
                      }}
                    >
                      <div className="rounded-[5px] relative me-3">
                        <CardArtwork
                          altText=""
                          artworkColors={{
                            bg: artworkColor,
                            main: artworkColor,
                          }}
                          containerClassName="contain-content [--artwork-override-width:calc(40px*var(--aspect-ratio))] [--artwork-override-height:40px]"
                          imageSrcSet={
                            song.thumbnailArtworkSrcSet ??
                            song.artworkSrcSet ??
                            ""
                          }
                          sizes="40px"
                          title={song.title}
                          variant="cover"
                        />
                        <div
                          className={`[--playButtonIconHoverColor:#fff] [--progress-play-background-color:hsla(0,0%,100%,.1)] transition-(--global-transition) rounded-[5px] bottom-0 inset-e-0 inset-s-0 m-auto absolute top-0 z-1 ${isCurrentTrack ? "items-center bg-[rgba(0,0,0,.45)] flex h-full justify-center w-full" : "group-hover:items-center group-hover:bg-[rgba(0,0,0,.45)] group-hover:flex group-hover:h-full group-hover:justify-center group-hover:w-full"}`}
                        >
                          <div className="[--nonPlatterIconFill:var(--nonPlatterOverrideIconColor,var(--keyColor))] h-(--interactivePlayButtonSize,16px) w-(--interactivePlayButtonSize,16px)">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (isCurrentTrack) return togglePlayback();
                                if (queueIndex >= 0) {
                                  onSongOpen?.(song);
                                  setQueue(queue, queueIndex);
                                }
                              }}
                              className={`[--nonPlatterIconFill:var(--playButtonIconColor,#fff)] [--playingBarColor:var(--nonPlatterIconFill,#fff)] leading-0 pointer-events-auto rounded-[5px] bottom-0 inset-e-0 inset-s-0 m-auto absolute top-0 z-1 ${isCurrentTrack ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                            >
                              {isCurrentTrack ? (
                                <div className="bottom-0 inset-x-0 m-auto absolute top-0 z-1 h-3.75 pointer-events-none w-full">
                                  <PlaybackWaveform
                                    isPlaying={isTrackPlaying}
                                    seed={song.id}
                                  />
                                  <div className="bottom-0 inset-x-0 m-auto opacity-0 absolute top-0 z-1 group-hover:opacity-100">
                                    {isTrackPlaying ? (
                                      <PauseIcon className="inline-block align-bottom" />
                                    ) : (
                                      <PlayIcon className="inline-block align-bottom" />
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <PlayIcon className="pointer-events-none inline-block h-(--playButtonSize,16px) w-(--playButtonSize,16px) align-bottom" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      <ul className="[--linkHoverTextDecoration:none] items-start self-stretch flex flex-col justify-center overflow-hidden text-start ps-1 pe-1 me-2">
                        <li className="[--explicitBadgeSize:10px] items-baseline grid grid-cols-[1fr_auto_auto] [font:var(--body-tall)]">
                          <div className="-mb-1 -mt-1 overflow-hidden text-ellipsis whitespace-nowrap -ms-1 -me-1 pb-1 pt-1 pe-1 ps-1">
                            {song.title}
                          </div>

                          {song.contentRating === "explicit" && (
                            <span className="ms-1" aria-label="Explicit">
                              <ExplicitBadgeIcon />
                            </span>
                          )}
                        </li>

                        {songMeta && (
                          <li className="[--linkHoverColor:inherit] [--linkHoverTextDecoration:underline] text-(--systemSecondary) [font:var(--callout)] max-w-full">
                            <div className="-mb-1 -mt-1 overflow-hidden text-ellipsis whitespace-nowrap -ms-1 -me-1 pb-1 pt-1 pe-1 ps-1">
                              {secondaryMetadata === "primary-artists" ? (
                                <ArtistLinks
                                  artists={artistMetadata}
                                  fallbackText={songMeta}
                                  onArtistClick={(event) =>
                                    event.stopPropagation()
                                  }
                                />
                              ) : (
                                <span>{songMeta}</span>
                              )}
                            </div>
                          </li>
                        )}
                      </ul>
                      <div
                        className="ms-auto"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="items-center flex justify-end shrink-0 h-7 [--contextMenuEllipsisFillOverride:var(--systemSecondary)]">
                          <AddSongToLibraryButton
                            songId={song.id}
                            title={song.title}
                            artist={song.artist}
                            artworkUrl={song.artworkUrl}
                            sourceAlbumId={song.albumId}
                            showOnParentHover
                          />
                          <AmpContextMenuButton
                            id={`song-${song.releaseTrackId ?? song.id}`}
                            context={{
                              kind: "song",
                              songId: song.id,
                              releaseTrackId: song.releaseTrackId,
                              title: song.title,
                              subtitle: song.artist,
                              artworkUrl: song.artworkUrl,
                              sourceAlbumId: song.albumId,
                              userId,
                              isFavorite: favoriteSongIds.has(song.id),
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

function finishDrag(
  event: PointerEvent<HTMLUListElement>,
  dragRef: MutableRefObject<{ startX: number; scrollLeft: number } | undefined>,
  dragElementRef: MutableRefObject<HTMLUListElement | null>,
  pendingScrollRef: MutableRefObject<number | undefined>,
  dragFrameRef: MutableRefObject<number | undefined>,
) {
  if (dragFrameRef.current !== undefined)
    cancelAnimationFrame(dragFrameRef.current);
  if (pendingScrollRef.current !== undefined)
    event.currentTarget.scrollLeft = pendingScrollRef.current;
  if (event.currentTarget.hasPointerCapture(event.pointerId))
    event.currentTarget.releasePointerCapture(event.pointerId);
  event.currentTarget.style.removeProperty("scroll-behavior");
  delete event.currentTarget.dataset.dragging;
  dragRef.current = undefined;
  dragElementRef.current = null;
  pendingScrollRef.current = undefined;
  dragFrameRef.current = undefined;
}

function ShelfChevron() {
  return (
    <svg
      className="h-(--header-title-chevron-size,12px) fill-(--header-title-chevron-color,var(--dropdownLightGrayIcon))"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      <path d="M19.817 61.863c1.48 0 2.672-.515 3.702-1.546l24.243-23.63c1.352-1.385 1.996-2.737 2.028-4.443 0-1.674-.644-3.09-2.028-4.443L23.519 4.138c-1.03-.998-2.253-1.513-3.702-1.513-2.994 0-5.409 2.382-5.409 5.344 0 1.481.612 2.833 1.739 3.96l20.99 20.347-20.99 20.283c-1.127 1.126-1.739 2.478-1.739 3.96 0 2.93 2.415 5.344 5.409 5.344Z" />
    </svg>
  );
}
