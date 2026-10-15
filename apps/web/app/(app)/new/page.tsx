import { NewFeaturedShelf } from "@/components/media/new-featured-shelf";
import Link from "next/link";
import { CSSProperties } from "react";

export default function NewPage() {
  return (
    <>
      <div className="grid items-end grid-cols-[1fr_auto] me-(--bodyGutter) ms-(--bodyGutter) pb-[0.05px] pt-8">
        <h1 className="text-(--systemPrimary) [font:var(--header-emphasized)] col-1 row-1">
          New
        </h1>
      </div>

      <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-7">
        <div className="">
          <div className="pb-8">
            <NewFeaturedShelf/>
          </div>
        </div>
      </div>

      <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-3">
        <div className="">
          <div className="items-center flex justify-end m-[0_var(--bodyGutter)_13px]">
            <div className="flex-1">
              <h2 className="text-(--header-title-color,var(--systemPrimary,#000)) inline-block [font:var(--header-title-font,var(--title-2-emphasized))]">
                <Link
                  className="flex items-center gap-1 text-start hover:no-underline"
                  href="#"
                >
                  <span>Add These Viral Hits</span>

                  <svg
                    className="h-(--header-title-chevron-size,12px) fill-(--header-title-chevron-color,var(--dropdownLightGrayIcon))"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 64 64"
                    aria-hidden="true"
                  >
                    <path d="M19.817 61.863c1.48 0 2.672-.515 3.702-1.546l24.243-23.63c1.352-1.385 1.996-2.737 2.028-4.443 0-1.674-.644-3.09-2.028-4.443L23.519 4.138c-1.03-.998-2.253-1.513-3.702-1.513-2.994 0-5.409 2.382-5.409 5.344 0 1.481.612 2.833 1.739 3.96l20.99 20.347-20.99 20.283c-1.127 1.126-1.739 2.478-1.739 3.96 0 2.93 2.415 5.344 5.409 5.344Z"></path>
                  </svg>
                </Link>
              </h2>
            </div>
          </div>

          <div className="pb-8">
            <section
              className="box-border p-[0_var(--shelfGridPaddingInline,var(--bodyGutter))] relative w-full z-(--z-default) max-[999px]:pe-0 max-[999px]:ps-0"
              style={
                {
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
                  "--grid-rows": "4",
                  "--standard-lockup-shadow-offset": "15px",
                } as CSSProperties
              }
            >
              <div className="top-song box-content -me-0.5 -ms-0.5 overflow-visible pe-0.5 ps-0.5 w-full">
                {/* <ul
                  className="shelf-grid__list--artist"
                  onClickCapture={(event) => {
                    if (!topSongsDraggedRef.current) return;
                    topSongsDraggedRef.current = false;
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onPointerDown={(event) => {
                    if (event.pointerType !== "mouse" || event.button !== 0)
                      return;
                    topSongsDragRef.current = {
                      startX: event.clientX,
                      scrollLeft: event.currentTarget.scrollLeft,
                    };
                    topSongsDragElementRef.current = event.currentTarget;
                    topSongsDraggedRef.current = false;
                  }}
                  onPointerMove={(event) => {
                    const drag = topSongsDragRef.current;
                    if (!drag) return;
                    const latestEvent =
                      event.nativeEvent.getCoalescedEvents?.().at(-1) ??
                      event.nativeEvent;
                    const distance = latestEvent.clientX - drag.startX;
                    if (!topSongsDraggedRef.current && Math.abs(distance) < 6) {
                      return;
                    }
                    if (!topSongsDraggedRef.current) {
                      topSongsDraggedRef.current = true;
                      event.currentTarget.dataset.dragging = "true";
                      event.currentTarget.style.scrollBehavior = "auto";
                      event.currentTarget.setPointerCapture(event.pointerId);
                      event.currentTarget.scrollLeft =
                        drag.scrollLeft - distance;
                      return;
                    }
                    event.preventDefault();
                    topSongsPendingScrollRef.current =
                      drag.scrollLeft - distance;
                    if (topSongsDragFrameRef.current !== undefined) return;
                    topSongsDragFrameRef.current = requestAnimationFrame(() => {
                      const scrollLeft = topSongsPendingScrollRef.current;
                      const container = topSongsDragElementRef.current;
                      topSongsDragFrameRef.current = undefined;
                      topSongsPendingScrollRef.current = undefined;
                      if (container && scrollLeft !== undefined) {
                        container.scrollLeft = scrollLeft;
                      }
                    });
                  }}
                  onPointerUp={(event) => {
                    if (topSongsDragFrameRef.current !== undefined) {
                      cancelAnimationFrame(topSongsDragFrameRef.current);
                      topSongsDragFrameRef.current = undefined;
                    }
                    if (topSongsPendingScrollRef.current !== undefined) {
                      event.currentTarget.scrollLeft =
                        topSongsPendingScrollRef.current;
                      topSongsPendingScrollRef.current = undefined;
                    }
                    if (
                      event.currentTarget.hasPointerCapture(event.pointerId)
                    ) {
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      );
                    }
                    event.currentTarget.style.removeProperty("scroll-behavior");
                    delete event.currentTarget.dataset.dragging;
                    topSongsDragRef.current = undefined;
                    topSongsDragElementRef.current = null;
                  }}
                  onPointerCancel={(event) => {
                    if (topSongsDragFrameRef.current !== undefined) {
                      cancelAnimationFrame(topSongsDragFrameRef.current);
                      topSongsDragFrameRef.current = undefined;
                    }
                    topSongsPendingScrollRef.current = undefined;
                    if (
                      event.currentTarget.hasPointerCapture(event.pointerId)
                    ) {
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      );
                    }
                    event.currentTarget.style.removeProperty("scroll-behavior");
                    delete event.currentTarget.dataset.dragging;
                    topSongsDragRef.current = undefined;
                    topSongsDragElementRef.current = null;
                  }}
                  onDragStart={(event) => {
                    if (topSongsDragRef.current) event.preventDefault();
                  }}
                >
                  {topSongPreview.map((song, index) => {
                    const artworkColor =
                      song.artworkBgColor ?? "var(--genericJoeColor)";
                    const isCurrentTrack = currentSong?.id === song.id;
                    const isTrackPlaying = isCurrentTrack && playing;

                    const songMeta = [
                      song.album,
                      formatReleaseYear(song.releaseDate),
                    ]
                      .filter(Boolean)
                      .join(" · ");

                    return (
                      <li
                        className="contain-content -mt-(--override-shelf-overflow-bleed-top,var(--standard-lockup-shadow-offset,15px)) -me-(--standard-lockup-shadow-offset,15px) -mb-(--override-shelf-overflow-bleed-bottom,var(--standard-lockup-shadow-offset,15px)) -ms-(--standard-lockup-shadow-offset,15px) pe-(--standard-lockup-shadow-offset,15px) pb-(--override-shelf-overflow-bleed-bottom,var(--standard-lockup-shadow-offset,15px)) pt-(--override-shelf-overflow-bleed-top,var(--standard-lockup-shadow-offset,15px)) ps-(--standard-lockup-shadow-offset,15px) snap-start"
                        key={song.id}
                      >
                        <div
                          className="group items-center text-(--systemPrimary) grid grid-cols-[auto_auto_1fr_auto] pb-[7.5px] pt-[7.5px] relative w-full pe-(--trackLockupPaddingInlineEnd,14px) cursor-pointer after:[border-top:var(--keyline-border-style)] after:inset-e-0 after:inset-s-0 after:absolute after:top-0 after:z-(--z-default)"
                          onClick={() => {
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
                              className={`[--playButtonIconHoverColor:#fff] [--progress-play-background-color:hsla(0,0%,100%,.1)] transition-(--global-transition) rounded-[5px] bottom-0 inset-e-0 inset-s-0 m-auto absolute top-0 z-1 ${
                                isCurrentTrack
                                  ? "items-center bg-[rgba(0,0,0,.45)] flex h-full justify-center w-full"
                                  : "group-hover:items-center group-hover:bg-[rgba(0,0,0,.45)] group-hover:flex group-hover:h-full group-hover:justify-center group-hover:w-full"
                              }`}
                            >
                              <div className="[--nonPlatterIconFill:var(--nonPlatterOverrideIconColor,var(--keyColor))] h-(--interactivePlayButtonSize,16px) w-(--interactivePlayButtonSize,16px)">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (isCurrentTrack) {
                                      togglePlayback();
                                      return;
                                    }

                                    setQueue(songs, index);
                                  }}
                                  className={`[--nonPlatterIconFill:var(--playButtonIconColor,#fff)] [--playingBarColor:var(--nonPlatterIconFill,#fff)] leading-0 pointer-events-auto rounded-[5px] bottom-0 inset-e-0 inset-s-0 m-auto absolute top-0 z-1 ${
                                    isCurrentTrack
                                      ? "opacity-100"
                                      : "opacity-0 group-hover:opacity-100"
                                  }`}
                                >
                                  {isCurrentTrack ? (
                                    <div className="bottom-0 inset-x-0 m-auto absolute top-0 z-1 h-3.75 pointer-events-none w-full">
                                      <PlaybackWaveform
                                        isPlaying={isTrackPlaying}
                                        seed={song.id}
                                      />

                                      <div className="bottom-0 inset-x-0 m-auto opacity-0 absolute top-0 z-1 group-hover:opacity-100">
                                        {isTrackPlaying ? (
                                          <svg
                                            width="16"
                                            height="16"
                                            viewBox="0 0 16 16"
                                            xmlns="http://www.w3.org/2000/svg"
                                            fillRule="evenodd"
                                            clipRule="evenodd"
                                            strokeLinejoin="round"
                                            strokeMiterlimit="2"
                                            className="inline-block align-bottom"
                                            aria-hidden="true"
                                          >
                                            <path
                                              fill="var(--nonPlatterIconFill, var(--keyColor, black))"
                                              d="M9.918.464h2.672a.89.89 0 0 1 .89.89v13.291a.89.89 0 0 1-.89.891H9.918a.89.89 0 0 1-.89-.89V1.354a.89.89 0 0 1 .89-.891zm-6.371 0h2.398c.567 0 1.027.46 1.027 1.028v13.016c0 .568-.46 1.028-1.027 1.028H3.547c-.567 0-1.028-.46-1.028-1.028V1.492c0-.568.46-1.028 1.028-1.028z"
                                              fillRule="nonzero"
                                            ></path>
                                          </svg>
                                        ) : (
                                          <svg
                                            width="16"
                                            height="16"
                                            viewBox="0 0 16 16"
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="inline-block align-bottom"
                                            aria-hidden="true"
                                          >
                                            <path
                                              fill="var(--nonPlatterIconFill, var(--keyColor, black))"
                                              d="m4.4 15.14 10.386-6.096c.842-.459.794-1.64 0-2.097L4.401.85c-.87-.53-2-.12-2 .82v12.625c0 .966 1.06 1.4 2 .844z"
                                            ></path>
                                          </svg>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <svg
                                      width="16"
                                      height="16"
                                      viewBox="0 0 16 16"
                                      xmlns="http://www.w3.org/2000/svg"
                                      className="pointer-events-none inline-block h-(--playButtonSize,16px) w-(--playButtonSize,16px) align-bottom"
                                      aria-hidden="true"
                                    >
                                      <path
                                        className="fill-(--nonPlatterIconFill,var(--keyColor,black))"
                                        d="m4.4 15.14 10.386-6.096c.842-.459.794-1.64 0-2.097L4.401.85c-.87-.53-2-.12-2 .82v12.625c0 .966 1.06 1.4 2 .844z"
                                      ></path>
                                    </svg>
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
                                  <span>{songMeta}</span>
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
                </ul> */}
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
