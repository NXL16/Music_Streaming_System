"use client";

import Link from "next/link";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import AmpContextMenuButton from "../custom-elements/AmpContextMenuButton";
import ResponsiveArtwork from "../media/common/responsive-artwork";
import { formatDuration } from "@/lib/format/duration";
import { useCatalogArtist } from "@/lib/catalog/use-catalog-artist";
import { useCatalogArtistSongs } from "@/lib/catalog/use-catalog-artist-songs";
import { useFormattedArtists } from "@/lib/media/use-formatted-artists";
import { usePlayerStore } from "@/lib/player/use-player-store";
import Loading from "@/app/loading";

type ArtistTopSongsPageProps = {
  artistId: string;
};

function ArtistLinks({
  artists,
  fallbackText,
}: {
  artists?: { id?: string; name: string; url?: string }[];
  fallbackText: string;
}) {
  const formattedArtists = useFormattedArtists({ artists, fallbackText });

  return (
    <>
      {formattedArtists.map((artist, index) => (
        <span key={`${artist.id ?? artist.name}-${index}`}>
          {artist.url ? (
            <Link
              href={artist.url}
              className="overflow-hidden text-ellipsis whitespace-nowrap text-left"
            >
              {artist.name}
            </Link>
          ) : (
            <span>{artist.name}</span>
          )}
          {index < formattedArtists.length - 1 && ", "}
        </span>
      ))}
    </>
  );
}

export function ArtistTopSongsPage({ artistId }: ArtistTopSongsPageProps) {
  return <ArtistTopSongsContent key={artistId} artistId={artistId} />;
}

function ArtistTopSongsContent({ artistId }: ArtistTopSongsPageProps) {
  const { artist } = useCatalogArtist(artistId, {
    includeAlbums: false,
    includeSongs: false,
  });
  const { songs, loadingMore, hasMore, loadMore } =
    useCatalogArtistSongs(artistId);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const setQueue = usePlayerStore((state) => state.setQueue);
  const artistName = artist?.attributes.name ?? "";
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !hasMore || loadingMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        void loadMore();
      },
      // Fetch only after the sentinel reaches the bottom of the viewport.
      { rootMargin: "0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore, loadingMore]);

  return (
    <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-8 [--songs-list-row-border-radius:12px] relative z-(--z-default)">
      <div className="in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
        <div className="items-center flex justify-end m-[0_var(--bodyGutter)_13px]">
          <div className="flex-1">
            <h2 className="text-(--header-title-color,var(--systemPrimary,#000)) inline-block [font:var(--header-title-font,var(--title-2-emphasized))]">
              <span dir="auto">Top Songs by {artistName}</span>
            </h2>
          </div>
        </div>

        <div className="[--linkColor:var(--systemSecondary)] border-collapse border-spacing-0 table [font:var(--callout)] table-fixed w-[calc(100%-var(--bodyGutter)*2)] ms-(--bodyGutter) me-(--bodyGutter) last:mb-5">
          <div className="text-(--systemSecondary) table-row [font:var(--callout-emphasized)] [clip:rect(1px,1px,1px,1px)] [border:0px] [clip-path:inset(0px_0px_99.9%_99.9%)] h-px overflow-hidden p-0 static w-px">
            <div className="table-cell align-middle inset-s-1.75 overflow-visible w-0 relative z-(--z-default) rounded-none [font:var(--callout-emphasized)] text-[0px]! h-0 leading-0! p-0">
              <div className="text-[0px] h-0 leading-0 p-0 overflow-hidden text-ellipsis whitespace-nowrap"></div>
            </div>
            <div className="table-cell [overflow:unset] align-middle pe-0 relative z-(--z-default) rounded-none [font:var(--callout-emphasized)] rounded-ee-none rounded-es-(--songs-list-row-border-radius,6px) rounded-se-none rounded-ss-(--songs-list-row-border-radius,6px) ps-1.75 text-[0px]! h-0 leading-0! p-0 w-auto">
              <div className="text-[0px] h-0 leading-0 p-0 overflow-hidden text-ellipsis whitespace-nowrap">
                Song
              </div>
            </div>
            <div className="hidden align-middle pe-2.5 relative z-(--z-default) rounded-none [font:var(--callout-emphasized)] ms-2.5 w-1/5 text-[0px]! h-0 leading-0! p-0 min-[1000px]:table-cell">
              <div className="text-[0px] h-0 leading-0 p-0 overflow-hidden text-ellipsis whitespace-nowrap">
                Artist
              </div>
            </div>
            <div className="hidden align-middle pe-2.5 relative z-(--z-default) rounded-none [font:var(--callout-emphasized)] ms-2.5 w-1/5 text-[0px]! h-0 leading-0! p-0 min-[1260px]:table-cell">
              <div className="text-[0px] h-0 leading-0 p-0 overflow-hidden text-ellipsis whitespace-nowrap">
                Album
              </div>
            </div>
            <div className="w-35.25 align-middle table-cell text-end overflow-visible relative z-(--z-default) rounded-none [font:var(--callout-emphasized)] rounded-ee-(--songs-list-row-border-radius,6px) rounded-es-none rounded-se-(--songs-list-row-border-radius,6px) rounded-ss-none pe-4.5 text-[0px]! h-0 leading-0! p-0">
              <div className="relative z-(--z-default) overflow-hidden text-ellipsis whitespace-nowrap inline-block ps-3.75 pe-8.75 text-[0px] h-0 leading-0 p-0">
                Time
              </div>
            </div>
          </div>

          {songs.map((song, index) => {
            const artworkColor =
              song.artworkBgColor ?? "var(--genericJoeColor)";
            return (
              <div
                key={song.id}
                onClick={(event) => {
                  if (
                    event.target instanceof Element &&
                    event.target.closest(
                      "a, button, input, select, textarea, [role='button'], [data-no-row-select]",
                    )
                  ) {
                    return;
                  }

                  setSelectedSongId(song.id);
                }}
                className={`group ${selectedSongId === song.id ? "selected" : ""} table-row relative z-(--z-default) bg-(--rowBackgroundColor,transparent) h-13.5 ${
                  index === songs.length - 1
                    ? "[&>div]:after:[border-bottom:.5px_solid_var(--labelDivider)] [&>div]:after:h-full"
                    : ""
                } ${
                  selectedSongId === song.id
                    ? "[--rowBackgroundColor:var(--selectionColor)] [--platterBorderColor:var(--selectionColor)] [--linkColor:#fff] [--contextMenuEllipsisFillOverride:#fff] [&>div]:after:opacity-0 [&+_.group>div]:after:border-t-transparent hover:[--playButtonOpacity:1] hover:[--addToLibraryOpacity:1] outline-0 text-white"
                    : "text-(--systemSecondary) [--platterBorderColor:var(--pageBG)] hover:[--playButtonOpacity:1] hover:[--addToLibraryOpacity:1] hover:[--rowBackgroundColor:var(--tracklistHoverColor)] hover:[--platterBorderColor:#f0f0f0] hover:[&+_.group>div]:after:border-t-transparent"
                }`}
              >
                <div className="table-cell [font:var(--body)] pb-0 pt-0 align-middle h-[inherit] inset-s-1.75 overflow-visible relative z-(--z-default) after:[border-top:.5px_solid_var(--labelDivider)] after:content-[''] after:block after:h-px after:inset-s-0 after:absolute after:top-0 after:w-full group-hover:after:opacity-0">
                  <div className="grid [grid-template-areas:'favorite-or-popular'] h-full -inset-s-8.25 p-0 place-items-center absolute top-1/2 transform-[translateY(-50%)] w-6.5 z-(--z-default)">
                    <div className="[grid-area:favorite-or-popular] leading-0 place-self-stretch">
                      <button
                        onClick={(event) => event.stopPropagation()}
                        className="items-center bg-(--favoriteButtonBackground,transparent) flex h-(--favoriteButtonSize,100%) justify-center leading-0 w-(--favoriteButtonSize,100%) [--favoriteIconStarOutline:var(--favoriteButtonStarOutline,transparent)] [--favoriteIconStarFill:var(--favoriteButtonStarFill,transparent)] [--favoriteButtonBackground:transparent] group-hover:[--favoriteIconStarOutline:var(--favoriteButtonStarOutline-hover,var(--keyColor))]"
                        aria-label="Favourite"
                        title="Tells us more about the kind of music you like."
                      >
                        <svg
                          width="64"
                          height="64"
                          viewBox="0 0 64 64"
                          xmlns="http://www.w3.org/2000/svg"
                          className="pointer-events-none h-(--favoriteIconSize,9px) w-(--favoriteIconSize,9px)"
                        >
                          <path
                            className="fill-(--favoriteIconStarOutline,var(--keyColor))"
                            d="M13.559 60.051c1.102.86 2.5.565 4.166-.645l14.218-10.455L46.19 59.406c1.666 1.21 3.037 1.505 4.166.645 1.102-.833 1.344-2.204.672-4.166l-5.618-16.718 14.353-10.32c1.666-1.183 2.338-2.42 1.908-3.764-.43-1.29-1.693-1.935-3.763-1.908l-17.605.108-5.348-16.8C34.308 4.496 33.34 3.5 31.944 3.5c-1.372 0-2.34.995-2.984 2.984L23.61 23.283l-17.605-.108c-2.07-.027-3.333.618-3.763 1.908-.457 1.344.242 2.58 1.909 3.763l14.352 10.321-5.617 16.718c-.672 1.962-.43 3.333.672 4.166Zm3.87-5.321c-.054-.054-.027-.081 0-.242l5.349-15.374c.376-1.049.161-1.882-.78-2.527L8.613 27.341c-.134-.08-.161-.134-.134-.215.027-.08.08-.08.242-.08l16.26.295c1.103.027 1.802-.43 2.151-1.532l4.677-15.562c.027-.162.08-.215.134-.215.08 0 .135.053.162.215l4.676 15.562c.35 1.102 1.048 1.559 2.15 1.532l16.261-.296c.162 0 .216 0 .243.081.027.08-.027.134-.135.215l-13.385 9.246c-.94.645-1.156 1.478-.78 2.527l5.35 15.374c.026.161.053.188 0 .242-.055.08-.135.026-.243-.054l-12.928-9.864c-.86-.672-1.855-.672-2.715 0l-12.928 9.864c-.107.08-.188.134-.242.054Z"
                          ></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="[font:var(--body)] pb-0 pt-0 table-cell align-middle ps-0 pe-0 text-(--systemPrimary) relative rounded-ee-none rounded-es-(--songs-list-row-border-radius,6px) rounded-se-none rounded-ss-(--songs-list-row-border-radius,6px) overflow-hidden text-ellipsis whitespace-nowrap after:[border-top:.5px_solid_var(--labelDivider)] after:content-[''] after:block after:h-px after:inset-s-0 after:absolute after:top-0 after:w-full group-hover:after:opacity-0 group-[.selected]:text-white">
                  <div className="items-center grid [grid-template-areas:'song-artwork_song-rank_song-icon_song-name'] grid-cols-[auto_auto_auto_1fr] min-h-11.5 ps-1.75">
                    <div className="text-(--systemSecondary) grid relative me-3">
                      <div className="grid [grid-area:song-artwork] [grid-template-areas:'song-index']">
                        <div className="rounded-[5px] [grid-area:song-index] [--songsListArtworkHeight:40px] h-10">
                          <div
                            className="bg-(--override-placeholder-bg-color,var(--placeholder-bg-color,var(--genericJoeColor))) rounded-[inherit] box-border contain-content h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0) min-w-(--artwork-override-min-width,0) overflow-hidden relative w-(--artwork-override-width,100%) z-(--z-default) [--artwork-override-width:calc(var(--songsListArtworkHeight)*var(--aspect-ratio))] [--artwork-override-height:var(--songsListArtworkHeight)] after:rounded-(--afterShadowBorderRadius,inherit) after:shadow-(--artworkShadowInset) after:content-[''] after:block after:h-0 after:max-h-full after:max-w-full after:min-h-full after:min-w-full after:opacity-(--containerInnerStrokeAlpha,.25) after:pointer-events-none after:absolute after:top-0 after:w-full after:z-[calc(var(--z-default)+1)]"
                            style={
                              {
                                "--artwork-bg-color": artworkColor,
                                "--aspect-ratio": "1",
                                "--placeholder-bg-color": "transparent",
                              } as CSSProperties
                            }
                          >
                            <ResponsiveArtwork
                              alt=""
                              className="rounded-[inherit] [transition:var(--global-transition,opacity_.1s_ease-in)] block h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0) min-w-(--artwork-override-min-width,0) [object-fit:var(--artwork-override-object-fit,fill)] object-(--artwork-override-object-position,center) w-(--artwork-override-width,100%)"
                              height={40}
                              width={40}
                              sizes="40px"
                              src="/assets/artwork/1x1.gif"
                              srcSet={
                                song.thumbnailArtworkSrcSet ??
                                song.artworkSrcSet
                              }
                              style={{ opacity: 1 }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="[grid-area:song-index] opacity-(--playButtonOpacity,0) [--playButtonIconHoverColor:#fff] items-center bg-[rgba(0,0,0,.45)] rounded-[5px] flex size-full inset-s-0 justify-center absolute top-0 z-(--transgray-scrim-z,var(--z-default))">
                        <div className="[--nonPlatterIconFill:var(--nonPlatterOverrideIconColor,var(--keyColor))] h-full align-top w-full">
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              setQueue(songs, index);
                            }}
                            className="[--nonPlatterIconFill:var(--playButtonIconColor,#fff)] [--playingBarColor:var(--nonPlatterIconFill,#fff)] leading-0 pointer-events-auto relative z-(--z-default) h-full align-top w-full"
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 16 16"
                              xmlns="http://www.w3.org/2000/svg"
                              className="inline-block h-(--playButtonSize,16px) w-(--playButtonSize,16px) align-bottom"
                              aria-hidden="true"
                            >
                              <path
                                fill="var(--nonPlatterIconFill, var(--keyColor, black))"
                                d="m4.4 15.14 10.386-6.096c.842-.459.794-1.64 0-2.097L4.401.85c-.87-.53-2-.12-2 .82v12.625c0 .966 1.06 1.4 2 .844z"
                              ></path>
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="items-center inline-flex [grid-area:song-name] leading-4 overflow-hidden w-full -my-1 -mx-1 py-1 px-1">
                      <div className="block cursor-default flex-1 overflow-hidden -my-1 -mx-1 py-1 px-1 text-left">
                        {song.url ? (
                          <Link
                            href={song.url}
                            className="overflow-hidden [--linkColor:var(--systemPrimary)] group-[.selected]:[--linkColor:#fff]"
                          >
                            <div className="overflow-hidden text-ellipsis inline text-pretty whitespace-normal text-left">
                              {song.title}
                            </div>
                          </Link>
                        ) : (
                          <div className="overflow-hidden text-ellipsis inline text-pretty whitespace-normal text-left">
                            {song.title}
                          </div>
                        )}

                        <div className="-my-1 -mx-1 py-1 px-1 text-(--systemSecondary) col-span-2 row-start-2 overflow-hidden text-ellipsis whitespace-nowrap text-left min-[1000px]:hidden max-[999px]:-mt-1.5">
                          <ArtistLinks
                            artists={song.artists}
                            fallbackText={song.artist}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="hidden [font:var(--body)] pb-0 pt-0 align-middle pe-2.5 relative overflow-hidden text-ellipsis whitespace-nowrap min-[1000px]:table-cell after:[border-top:.5px_solid_var(--labelDivider)] after:content-[''] after:block after:h-px after:inset-s-0 after:absolute after:top-0 after:w-full group-hover:after:opacity-0">
                  <div className="overflow-hidden text-ellipsis whitespace-nowrap -mb-1-mt-1 -ms-1 -me-1 pb-1 pt-1 pe-1 ps-1 text-left">
                    <ArtistLinks
                      artists={song.artists}
                      fallbackText={song.artist}
                    />
                  </div>
                </div>

                <div className="hidden [font:var(--body)] pb-0 pt-0 align-middle pe-4 relative overflow-hidden text-ellipsis whitespace-nowrap min-[1260px]:table-cell after:[border-top:.5px_solid_var(--labelDivider)] after:content-[''] after:block after:h-px after:inset-s-0 after:absolute after:top-0 after:w-full group-hover:after:opacity-0">
                  <div className="overflow-hidden text-ellipsis whitespace-nowrap -mb-1-mt-1 -ms-1 -me-1 pb-1 pt-1 pe-1 ps-1 text-left">
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap text-left">
                      {song.albumUrl ? (
                        <Link href={song.albumUrl} className="hover:underline">
                          {song.album}
                        </Link>
                      ) : (
                        song.album
                      )}
                    </span>
                  </div>
                </div>

                <div className="table-cell [font:var(--body)] py-0 align-middle overflow-visible relative text-end z-(--z-default) rounded-ee-(--songs-list-row-border-radius,6px) rounded-es-none rounded-se-(--songs-list-row-border-radius,6px) rounded-ss-none pe-4.5 after:[border-top:.5px_solid_var(--labelDivider)] after:content-[''] after:block after:h-px after:inset-s-0 after:absolute after:top-0 after:w-full group-hover:after:opacity-0">
                  <div className="items-center inline-grid [grid-template-areas:'song-controls-add_song-controls-length_song-controls-context'] relative">
                    <div className="[grid-area:song-controls-add] opacity-(--addToLibraryOpacity,0) me-1.75">
                      <button
                        onClick={(event) => event.stopPropagation()}
                        className="items-center text-(--keyColor) cursor-pointer inline-flex justify-center [transition:var(--global-transition)] h-(--add-to-library-button-width,25px) leading-0 w-(--add-to-library-button-width,25px) me-(--addToLibraryMarginEnd,4px)"
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          xmlns="http://www.w3.org/2000/svg"
                          fillRule="evenodd"
                          clipRule="evenodd"
                          strokeLinejoin="round"
                          strokeMiterlimit="2"
                          className="h-(--add-to-library-icon-width,12px) w-(--add-to-library-icon-width,12px) fill-(--keyColor)"
                          aria-hidden="true"
                        >
                          <path
                            d="M.784 5.784h3.432v3.432c0 .43.354.784.784.784.43 0 .784-.354.784-.784V5.784h3.432a.784.784 0 1 0 0-1.568H5.784V.784A.788.788 0 0 0 5 0a.788.788 0 0 0-.784.784v3.432H.784a.784.784 0 1 0 0 1.568z"
                            fillRule="nonzero"
                          ></path>
                        </svg>
                      </button>
                    </div>

                    <time
                      className="[grid-area:song-controls-length] cursor-default inline-block leading-9.5 font-features-['tnum'] tabular-nums"
                      dateTime="PT1M27S"
                    >
                      {formatDuration(song.durationSec)}
                    </time>

                    <div
                      onClick={(event) => event.stopPropagation()}
                      className={`[grid-area:song-controls-context] ms-1.75 [--contextMenuButtonSize:28px] ${selectedSongId === song.id ? "[--contextMenuEllipsisFillOverride:#fff]" : "[--contextMenuEllipsisFillOverride:var(--systemSecondary)] hover:[--contextMenuEllipsisFillOverride:var(--keyColor)]"}`}
                    >
                      <AmpContextMenuButton />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {loadingMore && <Loading fullScreen={false} size={46} />}

        {hasMore && (
          <div aria-hidden="true" ref={loadMoreRef} style={{ height: 1 }} />
        )}
      </div>
    </div>
  );
}
