"use client";

import Link from "next/link";
import { type CSSProperties, useState } from "react";
import AmpContextMenuButton from "../custom-elements/AmpContextMenuButton";
import ResponsiveArtwork from "../media/common/responsive-artwork";
import { formatDuration } from "@/lib/format/duration";
import { useCatalogArtist } from "@/lib/catalog/use-catalog-artist";
import { useCatalogArtistSongs } from "@/lib/catalog/use-catalog-artist-songs";
import { getAllCatalogArtistSongs } from "@/lib/catalog/artist-song-pages";
import { ArtistLinks } from "../media/artist-links";
import { usePlayerStore } from "@/lib/player/use-player-store";
import Loading from "@/app/loading";
import CatalogPageLoading from "../loading/catalog-page-loading";
import { useMinimumLoadingDuration } from "@/lib/loading/use-minimum-loading-duration";
import { FavoriteSongButton } from "../songs/favorite-song-button";
import { AddSongToLibraryButton } from "../songs/add-song-to-library-button";
import { PlaybackWaveform } from "../songs/playback-waveform";
import {
  SONG_ROW_HEIGHT,
  SongTableSpacer,
  useVisibleSongRange,
} from "@/lib/player/song-list-virtualization";
import { useTrackRowSelection } from "@/lib/player/use-track-row-selection";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useFavoriteStore } from "@/lib/favorites/use-favorite-store";
import { useInfiniteScrollLoadMore } from "@/lib/pagination/use-infinite-scroll-sentinel";

type ArtistTopSongsPageProps = {
  artistId: string;
};

export function ArtistTopSongsPage({ artistId }: ArtistTopSongsPageProps) {
  return <ArtistTopSongsContent key={artistId} artistId={artistId} />;
}

function ArtistTopSongsContent({ artistId }: ArtistTopSongsPageProps) {
  const { artist, loading: artistLoading } = useCatalogArtist(artistId, {
    includeAlbums: false,
    includeSongs: false,
  });
  const {
    songs,
    loading: songsLoading,
    loadingMore,
    hasMore,
    loadMore,
  } = useCatalogArtistSongs(artistId);

  const {
    activateTrack,
    activeTrackId,
    listRef,
    selectTrack,
    selectedTrackId,
  } = useTrackRowSelection<HTMLDivElement>();

  const showInitialLoading = useMinimumLoadingDuration(
    artistLoading || songsLoading,
  );

  const setQueue = usePlayerStore((state) => state.setQueue);
  const currentSong = usePlayerStore((state) => state.currentSong);
  const playing = usePlayerStore((state) => state.playing);
  const togglePlayback = usePlayerStore((state) => state.togglePlayback);
  const userId = useAuthStore((state) => state.user?.userId);
  const favoriteSongIds = useFavoriteStore((state) => state.songIds);

  const artistName = artist?.attributes.name ?? "";
  const [songTableElement, setSongTableElement] =
    useState<HTMLDivElement | null>(null);
  const visibleSongRange = useVisibleSongRange(songs.length, songTableElement);
  const visibleSongs = songs.slice(
    visibleSongRange.start,
    visibleSongRange.end,
  );

  const { sentinelRef: loadMoreSentinelRef, showLoadingMore } =
    useInfiniteScrollLoadMore({
      enabled: hasMore,
      loading: loadingMore,
      onLoadMore: loadMore,
    });

  const playArtistSong = async (songId: string) => {
    try {
      const queue = await getAllCatalogArtistSongs(artistId);
      const index = queue.findIndex((song) => song.id === songId);
      if (index >= 0) setQueue(queue, index);
    } catch {
      // Keep the current queue intact when a playback-page load fails.
    }
  };

  if (showInitialLoading) {
    return <CatalogPageLoading />;
  }

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

        <div
          ref={(node) => {
            listRef.current = node;
            setSongTableElement(node);
          }}
          className="[--linkColor:var(--systemSecondary)] border-collapse border-spacing-0 table [font:var(--callout)] table-fixed w-[calc(100%-var(--bodyGutter)*2)] ms-(--bodyGutter) me-(--bodyGutter) last:mb-5"
        >
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
            <div className="w-35.25 align-middle table-cell text-end overflow-visible relative z-(--z-default) rounded-none [font:var(--callout-emphasized)] rounded-ee-(--songs-list-row-border-radius,6px) rounded-es-none rounded-se-(--songs-list-row-border-radius,6px) rounded-ss-none pe-4.5 text-[0px]! h-0 leading-0! p-0 max-[578px]:w-12!">
              <div className="relative z-(--z-default) overflow-hidden text-ellipsis whitespace-nowrap inline-block ps-3.75 pe-8.75 text-[0px] h-0 leading-0 p-0">
                Time
              </div>
            </div>
          </div>

          <SongTableSpacer height={visibleSongRange.start * SONG_ROW_HEIGHT} />

          {visibleSongs.map((song, visibleIndex) => {
            const index = visibleSongRange.start + visibleIndex;
            const artworkColor =
              song.artworkBgColor ?? "var(--genericJoeColor)";
            const isCurrentTrack = currentSong?.id === song.id;
            const isTrackPlaying = isCurrentTrack && playing;

            return (
              <div
                key={song.id}
                onClick={() => selectTrack(song.id)}
                className={`group ${selectedTrackId === song.id ? "selected" : ""} text-(--systemSecondary) table-row relative z-(--z-default) [--platterBorderColor:var(--pageBG)] bg-(--rowBackgroundColor,transparent) h-13.5 hover:[--playButtonOpacity:1] hover:[--addToLibraryOpacity:1] ${
                  index === songs.length - 1
                    ? "[&>div]:after:[border-bottom:.5px_solid_var(--labelDivider)] [&>div]:after:h-full [&>div]:after:pointer-events-none"
                    : ""
                } ${
                  selectedTrackId === song.id
                    ? "[--rowBackgroundColor:var(--selectionColor)] [--platterBorderColor:var(--selectionColor)] [outline:0] [--linkColor:#fff] [--explicitFillOverride:#fff] [--contextMenuEllipsisFillOverride:#fff] [--addToLibraryFillOverride:#fff] text-white [&>div]:after:opacity-0 [&+_.group>div]:after:border-t-transparent"
                    : "hover:[--rowBackgroundColor:var(--tracklistHoverColor)] hover:[--platterBorderColor:#f0f0f0] hover:[&+_.group>div]:after:border-t-transparent"
                }`}
              >
                <div className="table-cell [font:var(--body)] pb-0 pt-0 align-middle h-[inherit] inset-s-1.75 overflow-visible relative z-(--z-default) after:[border-top:.5px_solid_var(--labelDivider)] after:content-[''] after:block after:h-px after:inset-s-0 after:absolute after:top-0 after:w-full group-hover:after:opacity-0">
                  <div className="grid [grid-template-areas:'favorite-or-popular'] h-full -inset-s-8.25 p-0 place-items-center absolute top-1/2 transform-[translateY(-50%)] w-6.5 z-(--z-default)">
                    <div className="[grid-area:favorite-or-popular] leading-0 place-self-stretch">
                      <FavoriteSongButton
                        ariaLabel="Favourite"
                        className={`group-hover:[--favoriteIconStarOutline:var(--favoriteButtonStarOutline-hover,var(--keyColor))] ${
                          activeTrackId === song.id
                            ? "[--favoriteIconStarOutlineOverride:var(--favoriteButtonStarOutline-hover,var(--keyColor))]"
                            : ""
                        }`}
                        onClick={(event) => event.stopPropagation()}
                        songId={song.id}
                        title="Tells us more about the kind of music you like."
                      />
                    </div>
                  </div>
                </div>

                <div className="table-cell [font:var(--body)] pb-0 pt-0 align-middle ps-0 pe-0 text-(--systemPrimary) relative rounded-ee-none rounded-es-(--songs-list-row-border-radius,6px) rounded-se-none rounded-ss-(--songs-list-row-border-radius,6px) overflow-hidden text-ellipsis whitespace-nowrap after:[border-top:.5px_solid_var(--labelDivider)] after:content-[''] after:block after:h-px after:inset-s-0 after:absolute after:top-0 after:w-full group-hover:after:opacity-0 group-[.selected]:text-white">
                  <div className="items-center grid [grid-template-areas:'song-artwork_song-rank_song-icon_song-name'] grid-cols-[auto_auto_auto_1fr] min-h-11.5 ps-1.75">
                    <div
                      className={`text-(--systemSecondary) grid relative me-3 ${
                        isCurrentTrack ? "[--playButtonOpacity:1]" : ""
                      }`}
                    >
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
                            disabled={!song.playbackUrl}
                            onClick={(event) => {
                              if (selectedTrackId !== null) {
                                activateTrack(song.id);
                                event.stopPropagation();
                              }

                              if (isCurrentTrack) {
                                togglePlayback();
                              } else {
                                void playArtistSong(song.id);
                              }
                            }}
                            className="[--nonPlatterIconFill:var(--playButtonIconColor,#fff)] [--playingBarColor:var(--nonPlatterIconFill,#fff)] leading-0 pointer-events-auto relative z-(--z-default) h-full align-top w-full"
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
                                      className="inline-block align-bottom"
                                      aria-hidden="true"
                                    >
                                      <path
                                        fill="var(--nonPlatterIconFill, var(--keyColor, black))"
                                        d="M9.918.464h2.672a.89.89 0 0 1 .89.89v13.291a.89.89 0 0 1-.89.891H9.918a.89.89 0 0 1-.89-.89V1.354a.89.89 0 0 1 .89-.891zm-6.371 0h2.398c.567 0 1.027.46 1.027 1.028v13.016c0 .568-.46 1.028-1.027 1.028H3.547c-.567 0-1.028-.46-1.028-1.028V1.492c0-.568.46-1.028 1.028-1.028z"
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
                                  fill="var(--nonPlatterIconFill, var(--keyColor, black))"
                                  d="m4.4 15.14 10.386-6.096c.842-.459.794-1.64 0-2.097L4.401.85c-.87-.53-2-.12-2 .82v12.625c0 .966 1.06 1.4 2 .844z"
                                ></path>
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="items-center inline-flex [grid-area:song-name] leading-4 overflow-hidden w-full -my-1 -mx-1 py-1 px-1">
                      <div className="block cursor-default flex-1 overflow-hidden -my-1 -mx-1 py-1 px-1 text-left">
                        {song.url ? (
                          <Link
                            href={song.url}
                            onClick={(e) => e.stopPropagation()}
                            className="overflow-hidden [--linkColor:var(--systemPrimary)] group-[.selected]:[--linkColor:#fff] hover:underline"
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

                        <div className="-my-1 -mx-1 py-1 px-1 text-(--systemSecondary) col-span-2 row-start-2 overflow-hidden text-ellipsis whitespace-nowrap text-left min-[1000px]:hidden max-[999px]:-mt-0.5">
                          <ArtistLinks
                            artists={song.artists}
                            fallbackText={song.artist}
                            linkClassName="overflow-hidden text-ellipsis whitespace-nowrap text-left"
                            onArtistClick={(event) => event.stopPropagation()}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="hidden [font:var(--body)] pb-0 pt-0 align-middle pe-2.5 relative overflow-hidden text-ellipsis whitespace-nowrap min-[1000px]:table-cell after:[border-top:.5px_solid_var(--labelDivider)] after:content-[''] after:block after:h-px after:inset-s-0 after:absolute after:top-0 after:w-full group-hover:after:opacity-0">
                  <div className="overflow-hidden text-ellipsis whitespace-nowrap -mb-1 -mt-1 -ms-1 -me-1 pb-1 pt-1 pe-1 ps-1 text-left">
                    <ArtistLinks
                      artists={song.artists}
                      fallbackText={song.artist}
                      linkClassName="overflow-hidden text-ellipsis whitespace-nowrap text-left"
                      onArtistClick={(event) => event.stopPropagation()}
                    />
                  </div>
                </div>

                <div className="hidden [font:var(--body)] pb-0 pt-0 align-middle pe-4 relative overflow-hidden text-ellipsis whitespace-nowrap min-[1260px]:table-cell after:[border-top:.5px_solid_var(--labelDivider)] after:content-[''] after:block after:h-px after:inset-s-0 after:absolute after:top-0 after:w-full group-hover:after:opacity-0">
                  <div className="overflow-hidden text-ellipsis whitespace-nowrap -mb-1 -mt-1 -ms-1 -me-1 pb-1 pt-1 pe-1 ps-1 text-left">
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap text-left">
                      {song.albumUrl ? (
                        <Link
                          href={song.albumUrl}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:underline"
                        >
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
                    <div className="[grid-area:song-controls-add] opacity-(--addToLibraryOpacity,0) me-1.75 pointer-coarse:hidden max-[578px]:hidden">
                      <AddSongToLibraryButton
                        songId={song.id}
                        title={song.title}
                        artist={song.artist}
                        artworkUrl={song.artworkUrl}
                      />
                    </div>

                    <time
                      className="max-[578px]:hidden [grid-area:song-controls-length] cursor-default inline-block leading-9.5 font-features-['tnum'] tabular-nums"
                      dateTime="PT1M27S"
                    >
                      {formatDuration(song.durationSec)}
                    </time>

                    <div
                      onClick={(event) => event.stopPropagation()}
                      className={`[grid-area:song-controls-context] ms-1.75 [--contextMenuButtonSize:28px] ${
                        selectedTrackId === song.id
                          ? "[--contextMenuEllipsisFillOverride:#fff]"
                          : "[--contextMenuEllipsisFillOverride:var(--systemSecondary)] hover:[--contextMenuEllipsisFillOverride:var(--keyColor)]"
                      }`}
                    >
                      <AmpContextMenuButton
                        id={`song-${song.id}`}
                        context={{
                          kind: "song",
                          songId: song.id,
                          title: song.title,
                          userId,
                          isFavorite: favoriteSongIds.has(song.id),
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <SongTableSpacer
            height={(songs.length - visibleSongRange.end) * SONG_ROW_HEIGHT}
          />
        </div>

        {showLoadingMore && <Loading fullScreen={false} size={26} />}

        {hasMore && (
          <div
            aria-hidden="true"
            ref={loadMoreSentinelRef}
            style={{ height: 1 }}
          />
        )}
      </div>
    </div>
  );
}
