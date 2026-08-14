"use client";

import AmpContextMenuButton from "@/components/custom-elements/AmpContextMenuButton";
import { ExplicitBadgeIcon } from "@/components/icons/explicit-badge-icon";
import EmptyState from "@/components/layout/empty-state";
import HeaderWithSort from "@/components/layout/header-with-sort";
import CatalogPageLoading from "@/components/loading/catalog-page-loading";
import { useMinimumLoadingState } from "@/lib/loading/use-minimum-loading-duration";
import { ArtistLinks } from "@/components/media/artist-links";
import ResponsiveArtwork from "@/components/media/common/responsive-artwork";
import { FavoriteSongButton } from "@/components/songs/favorite-song-button";
import { PlaybackWaveform } from "@/components/songs/playback-waveform";
import Link from "next/link";
import {
  CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { listLibrarySongs } from "@/lib/songs/song.api";
import type { SongSummary } from "@/lib/songs/song.types";
import { useFavoriteStore } from "@/lib/favorites/use-favorite-store";
import { usePlayerStore } from "@/lib/player/use-player-store";
import { projectSongSummary } from "@/lib/songs/project-song-summary";
import {
  isLibraryResourcePendingRemoval,
  subscribeLibraryResourcesChanged,
} from "@/lib/library/library-resources.api";
import { useAuthStore } from "@/lib/auth/auth-store";
import { songRoute } from "@/lib/catalog/song-route";
import { artistRoute } from "@/lib/catalog/artist-route";
import { albumRoute } from "@/lib/catalog/album-route";
import { formatDuration } from "@/lib/format/duration";
import { useTrackRowSelection } from "@/lib/player/use-track-row-selection";
import type {
  LibrarySortBy,
  SortDirection,
} from "@/components/custom-elements/m404-sort-menu-button";
import Loading from "@/app/loading";
import {
  SONG_ROW_HEIGHT,
  SongTableSpacer,
  useVisibleSongRange,
} from "@/lib/player/song-list-virtualization";
import { useInfiniteScrollLoadMore } from "@/lib/pagination/use-infinite-scroll-sentinel";
import { appendUniqueById, getSafeNextCursor } from "@/lib/pagination/cursor-page";

const LIBRARY_SONG_PAGE_SIZE = 40;

export default function SongsPage() {
  const userId = useAuthStore((state) => state.user?.userId);
  const [songs, setSongs] = useState<SongSummary[]>([]);
  const [sortBy, setSortBy] = useState<LibrarySortBy>("recently-added");
  const [sortDirection, setSortDirection] =
    useState<SortDirection>("descending");
  const [nextCursor, setNextCursor] = useState("");
  const [initialLoading, setInitialLoading] = useMinimumLoadingState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [songTableElement, setSongTableElement] =
    useState<HTMLDivElement | null>(null);
  const pageRequestIdRef = useRef(0);
  const loadingPageRef = useRef(false);
  const seenCursorsRef = useRef(new Set<string>());
  const favoriteSongs = useFavoriteStore((state) => state.songs);
  const currentSong = usePlayerStore((state) => state.currentSong);
  const playing = usePlayerStore((state) => state.playing);
  const togglePlayback = usePlayerStore((state) => state.togglePlayback);
  const setQueue = usePlayerStore((state) => state.setQueue);
  const {
    activateTrack,
    activeTrackId,
    listRef,
    selectTrack,
    selectedTrackId,
  } = useTrackRowSelection<HTMLDivElement>();
  const favoriteSongIds = useMemo(
    () => new Set(favoriteSongs.map((song) => song.id)),
    [favoriteSongs],
  );
  const sortedSongs = useMemo(
    () =>
      songs.filter(
        (song) => !isLibraryResourcePendingRemoval("songs", song.id),
      ),
    [songs],
  );
  const libraryQueue = useMemo(
    () => sortedSongs.map(projectSongSummary),
    [sortedSongs],
  );

  const loadFirstPage = useCallback(async () => {
    const requestId = ++pageRequestIdRef.current;
    loadingPageRef.current = true;
    seenCursorsRef.current = new Set();
    setLoadingMore(true);
    try {
      const page = await listLibrarySongs({
        limit: LIBRARY_SONG_PAGE_SIZE,
        sortBy,
        direction: sortDirection,
      });
      if (requestId !== pageRequestIdRef.current) return;
      setSongs(page.songs ?? []);
      setNextCursor(getSafeNextCursor(page, seenCursorsRef.current));
    } catch {
      // The current list remains visible if a background refresh fails.
    } finally {
      if (requestId === pageRequestIdRef.current) {
        loadingPageRef.current = false;
        setLoadingMore(false);
        setInitialLoading(false);
      }
    }
  }, [setInitialLoading, sortBy, sortDirection]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingPageRef.current) return;
    const requestId = pageRequestIdRef.current;
    loadingPageRef.current = true;
    setLoadingMore(true);
    try {
      const page = await listLibrarySongs({
        cursor: nextCursor,
        limit: LIBRARY_SONG_PAGE_SIZE,
        sortBy,
        direction: sortDirection,
      });
      if (requestId !== pageRequestIdRef.current) return;
      setSongs((current) => appendUniqueById(current, page.songs));
      setNextCursor(getSafeNextCursor(page, seenCursorsRef.current));
    } catch {
      // Keep the cursor so the intersection observer can retry later.
    } finally {
      if (requestId === pageRequestIdRef.current) {
        loadingPageRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [nextCursor, sortBy, sortDirection]);

  useEffect(() => {
    queueMicrotask(() => void loadFirstPage());
    return subscribeLibraryResourcesChanged((change) => {
      if (!change) {
        void loadFirstPage();
        return;
      }
      if (change.resourceType !== "songs") return;

      // Pin state is consumed by the sidebar only. Refetching the complete
      // table here replaces virtual rows and makes the scroll position jump.
      if (change.operation === "pin" || change.operation === "unpin") return;

      if (change.operation === "remove") {
        setSongs((current) =>
          current.filter((song) => song.id !== change.resourceId),
        );
        return;
      }

      void loadFirstPage();
    });
  }, [loadFirstPage]);

  const { sentinelRef: loadMoreSentinelRef, showLoadingMore } = useInfiniteScrollLoadMore({
    enabled: Boolean(nextCursor),
    loading: loadingMore,
    onLoadMore: loadMore,
  });

  const setSongTableRef = useCallback(
    (node: HTMLDivElement | null) => {
      listRef.current = node;
      setSongTableElement(node);
    },
    [listRef],
  );
  const visibleSongRange = useVisibleSongRange(
    sortedSongs.length,
    songTableElement,
  );
  const visibleSongs = sortedSongs.slice(
    visibleSongRange.start,
    visibleSongRange.end,
  );

  if (initialLoading) {
    return <CatalogPageLoading />;
  }

  // Match the other Library surfaces: an optimistic pending deletion is no
  // longer visible content, so the final-song state renders Empty immediately
  // while the Undo toast is still available.
  if (!initialLoading && !sortedSongs.length) {
    return <EmptyState />;
  }

  return (
    <>
      <HeaderWithSort
        title="Songs"
        sortBy={sortBy}
        direction={sortDirection}
        onSortByChange={setSortBy}
        onDirectionChange={setSortDirection}
      />

      <div className="-ms-(--web-navigation-width) ps-(--web-navigation-width) [--songs-list-row-border-radius:12px] relative z-(--z-default) pt-6">
        <div className="in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
          <div
            ref={setSongTableRef}
            className="[--linkColor:var(--systemSecondary)] border-collapse border-spacing-0 table [font:var(--callout)] table-fixed w-[calc(100%-var(--bodyGutter)*2)] mx-(--bodyGutter) last:mb-5"
          >
            <div className="text-(--systemSecondary) table-row [font:var(--callout-emphasized)] relative max-[999px]:[clip:rect(1px,1px,1px,1px)] max-[999px]:border-0 max-[999px]:[clip-path:inset(0_0_99.9%_99.9%)] max-[999px]:h-px max-[999px]:overflow-hidden max-[999px]:p-0 max-[999px]:static max-[999px]:w-px">
              <div className="table-cell pt-0 align-middle inset-s-1.75 overflow-visible w-0 relative z-(--z-default) rounded-none [font:var(--callout-emphasized)] h-8 pb-1.5 max-[999px]:h-0 max-[999px]:leading-0 max-[999px]:p-0">
                <div className="overflow-hidden text-ellipsis whitespace-nowrap max-[999px]:h-0 max-[999px]:leading-0 max-[999px]:p-0"></div>
              </div>

              <div className="table-cell pt-0 [overflow:unset] align-middle pe-0 relative z-(--z-default) rounded-none [font:var(--callout-emphasized)] h-8 pb-1.5 rounded-ee-none rounded-es-(--songs-list-row-border-radius,6px) rounded-se-none rounded-ss-(--songs-list-row-border-radius,6px) ps-1.75 min-[1000px]:w-[50%] min-[1260px]:w-[42%] max-[999px]:h-0 max-[999px]:leading-0 max-[999px]:p-0">
                <div className="overflow-hidden text-ellipsis whitespace-nowrap max-[999px]:h-0 max-[999px]:leading-0 max-[999px]:p-0">
                  Song
                </div>
              </div>

              <div className="hidden pt-0 align-middle pe-2.5 relative z-(--z-default) rounded-none [font:var(--callout-emphasized)] h-8 pb-1.5 min-[1000px]:table-cell min-[1260px]:w-[29%] before:bg-(--systemQuaternary) before:rounded-[.5px] before:content-[''] before:inline-block before:h-4 before:-inset-s-3.75 before:absolute before:top-[calc(50%-3px)] before:translate-y-[-50%] before:w-px max-[999px]:h-0 max-[999px]:leading-0 max-[999px]:p-0">
                <div className="overflow-hidden text-ellipsis whitespace-nowrap max-[999px]:h-0 max-[999px]:leading-0 max-[999px]:p-0">
                  Artist
                </div>
              </div>

              <div className="pt-0 align-middle pe-4 hidden relative z-(--z-default) rounded-none [font:var(--callout-emphasized)] h-8 pb-1.5 min-[1260px]:table-cell min-[1260px]:w-[29%] before:bg-(--systemQuaternary) before:rounded-[.5px] before:content-[''] before:inline-block before:h-4 before:-inset-s-3.75 before:absolute before:top-[calc(50%-3px)] before:translate-y-[-50%] before:w-px max-[999px]:h-0 max-[999px]:leading-0 max-[999px]:p-0">
                <div className="overflow-hidden text-ellipsis whitespace-nowrap max-[999px]:h-0 max-[999px]:leading-0 max-[999px]:p-0">
                  Album
                </div>
              </div>

              <div className="w-35.25 table-cell pt-0 align-middle overflow-visible text-end relative z-(--z-default) rounded-none [font:var(--callout-emphasized)] h-8 pb-1.5 rounded-ee-(--songs-list-row-border-radius,6px) rounded-es-none rounded-se-(--songs-list-row-border-radius,6px) rounded-ss-none pe-4.5 max-[999px]:h-0 max-[999px]:leading-0 max-[999px]:p-0 max-[578px]:w-12!">
                <div className="relative z-(--z-default) overflow-hidden text-ellipsis whitespace-nowrap inline-block pb-0.75 pt-0.75 ps-3.75 pe-8.75 before:bg-(--systemQuaternary) before:rounded-[.5px] before:content-[''] before:inline-block before:h-4 before:absolute before:translate-y-[-50%] before:w-px before:inset-s-0 before:top-3 max-[999px]:h-0 max-[999px]:leading-0 max-[999px]:p-0">
                  Time
                </div>
              </div>
            </div>

            <SongTableSpacer
              height={visibleSongRange.start * SONG_ROW_HEIGHT}
            />

            {visibleSongs.map((track, visibleIndex) => {
              const index = visibleSongRange.start + visibleIndex;
              const isCurrentTrack = currentSong?.id === track.id;
              const isTrackPlaying = isCurrentTrack && playing;

              return (
                <div
                  key={track.id}
                  onClick={() => selectTrack(track.id)}
                  className={`group ${selectedTrackId === track.id ? "selected" : ""} text-(--systemSecondary) table-row relative z-(--z-default) [--platterBorderColor:var(--pageBG)] bg-(--rowBackgroundColor,transparent) h-13.5 hover:[--playButtonOpacity:1] hover:[--addToLibraryOpacity:1] last:[&>div]:after:[border-bottom:.5px_solid_var(--labelDivider)] last:[&>div]:after:h-full last:[&>div]:after:pointer-events-none ${
                    selectedTrackId === track.id
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
                            activeTrackId === track.id
                              ? "[--favoriteIconStarOutlineOverride:var(--favoriteButtonStarOutline-hover,var(--keyColor))]"
                              : ""
                          }`}
                          onClick={(event) => event.stopPropagation()}
                          songId={track.id}
                          title="Tells us more about the kind of music you like."
                        />
                      </div>
                    </div>
                  </div>

                  <div className="table-cell [font:var(--body)] pb-0 pt-0 align-middle ps-0 pe-0 text-(--systemPrimary) relative rounded-ee-none rounded-es-(--songs-list-row-border-radius,6px) rounded-se-none rounded-ss-(--songs-list-row-border-radius,6px) overflow-hidden text-ellipsis whitespace-nowrap after:[border-top:.5px_solid_var(--labelDivider)] after:content-[''] after:block after:h-px after:inset-s-0 after:absolute after:top-0 after:w-full group-hover:after:opacity-0">
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
                                  "--artwork-bg-color": "#0b0809",
                                  "--aspect-ratio": "1",
                                  "--placeholder-bg-color": "transparent",
                                } as CSSProperties
                              }
                            >
                              <ResponsiveArtwork
                                alt=""
                                className="rounded-[inherit] [transition:var(--global-transition,opacity_.1s_ease-in)] block h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0) min-w-(--artwork-override-min-width,0) [object-fit:var(--artwork-override-object-fit,fill)] object-(--artwork-override-object-position,center) w-(--artwork-override-width,100%)"
                                height={40}
                                sizes="40px"
                                src="/assets/artwork/1x1.gif"
                                srcSet={
                                  track.thumbnailCoverSrcSet ?? track.coverUrl
                                }
                                style={{ opacity: 1 }}
                                width={40}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="[grid-area:song-index] opacity-(--playButtonOpacity,0) [--playButtonIconHoverColor:#fff] items-center bg-[rgba(0,0,0,.45)] rounded-[5px] flex size-full inset-s-0 justify-center absolute top-0 z-(--transgray-scrim-z,var(--z-default))">
                          <div className="[--nonPlatterIconFill:var(--nonPlatterOverrideIconColor,var(--keyColor))] h-full align-top w-full">
                            <button
                              disabled={track.status !== 3}
                              onClick={(event) => {
                                if (selectedTrackId !== null) {
                                  activateTrack(track.id);
                                  event.stopPropagation();
                                }
                                if (isCurrentTrack) {
                                  togglePlayback();
                                } else {
                                  setQueue(libraryQueue, index);
                                }
                              }}
                              className="[--nonPlatterIconFill:var(--playButtonIconColor,#fff)] [--playingBarColor:var(--nonPlatterIconFill,#fff)] leading-0 pointer-events-auto relative z-(--z-default) h-full align-top w-full"
                            >
                              {isCurrentTrack ? (
                                <div className="bottom-0 inset-x-0 m-auto absolute top-0 z-1 h-3.75 pointer-events-none w-full">
                                  <PlaybackWaveform
                                    isPlaying={isTrackPlaying}
                                    seed={track.id}
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
                        <div className="block cursor-default flex-1 overflow-hidden ps-1 pe-1 -me-1 pb-1 pt-1 -ms-1 -mb-1 -mt-1 text-left">
                          {track.id ? (
                            <Link
                              href={songRoute(track.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="overflow-hidden [--linkColor:var(--systemPrimary)] hover:underline"
                            >
                              <div className="overflow-hidden text-ellipsis inline text-pretty whitespace-normal text-left">
                                {track.title}
                              </div>
                            </Link>
                          ) : (
                            <div className="overflow-hidden text-ellipsis inline text-pretty whitespace-normal text-left">
                              {track.title}
                            </div>
                          )}

                          {track.contentRating === "explicit" && (
                            <span
                              className="ms-1 [--explicitBadgeSize:10px] relative top-[0.7px]"
                              aria-label="Explicit"
                            >
                              <ExplicitBadgeIcon />
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="hidden [font:var(--body)] pb-0 pt-0 align-middle pe-2.5 relative overflow-hidden text-ellipsis whitespace-nowrap min-[1000px]:table-cell after:[border-top:.5px_solid_var(--labelDivider)] after:content-[''] after:block after:h-px after:inset-s-0 after:absolute after:top-0 after:w-full group-hover:after:opacity-0">
                    <div className="overflow-hidden text-ellipsis whitespace-nowrap -mb-1 -mt-1 -ms-1 -me-1 pb-1 pt-1 pe-1 ps-1 text-left">
                      <ArtistLinks
                        artists={track.artists?.map((artist) => ({
                          ...artist,
                          url:
                            artist.id && artist.url
                              ? artistRoute(artist.url, artist.id)
                              : undefined,
                        }))}
                        fallbackText={track.artist}
                        linkClassName="hover:underline"
                      />
                    </div>
                  </div>

                  <div className="hidden [font:var(--body)] pb-0 pt-0 align-middle pe-4 relative overflow-hidden text-ellipsis whitespace-nowrap min-[1260px]:table-cell after:[border-top:.5px_solid_var(--labelDivider)] after:content-[''] after:block after:h-px after:inset-s-0 after:absolute after:top-0 after:w-full group-hover:after:opacity-0">
                    <div className="overflow-hidden text-ellipsis whitespace-nowrap -mb-1 -mt-1 -ms-1 -me-1 pb-1 pt-1 pe-1 ps-1 text-left">
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap text-left">
                        {track.albumUrl && track.albumId ? (
                          <Link
                            href={albumRoute(track.albumUrl, track.albumId)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {track.album}
                          </Link>
                        ) : (
                          track.album
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="table-cell [font:var(--body)] pb-0 pt-0 align-middle overflow-visible relative text-end z-(--z-default) rounded-ee-(--songs-list-row-border-radius,6px) rounded-es-none rounded-se-(--songs-list-row-border-radius,6px) rounded-ss-none pe-4.5 after:[border-top:.5px_solid_var(--labelDivider)] after:content-[''] after:block after:h-px after:inset-s-0 after:absolute after:top-0 after:w-full group-hover:after:opacity-0">
                    <div className="items-center inline-grid [grid-template-areas:'song-controls-add_song-controls-length_song-controls-context'] relative">
                      <time
                        className="max-[578px]:hidden [grid-area:song-controls-length] cursor-default inline-block leading-9.5 font-features-['tnum'] tabular-nums"
                        dateTime="PT1M27S"
                      >
                        {formatDuration(track.durationSec)}
                      </time>

                      <div
                        className={`[grid-area:song-controls-context] ms-1.75 [--contextMenuButtonSize:28px] ${selectedTrackId === track.id ? "[--contextMenuEllipsisFillOverride:#fff]" : "[--contextMenuEllipsisFillOverride:var(--systemSecondary)] hover:[--contextMenuEllipsisFillOverride:var(--keyColor)]"}`}
                      >
                        <AmpContextMenuButton
                          id={`song-${track.id}`}
                          context={{
                            kind: "song",
                            songId: track.id,
                            title: track.title,
                            subtitle: track.artist,
                            artworkUrl: track.coverUrl,
                            userId,
                            isFavorite: favoriteSongIds.has(track.id),
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <SongTableSpacer
              height={
                (sortedSongs.length - visibleSongRange.end) * SONG_ROW_HEIGHT
              }
            />
          </div>
          {showLoadingMore && <Loading fullScreen={false} size={26} />}
          {nextCursor && (
            <div
              aria-hidden="true"
              ref={loadMoreSentinelRef}
              style={{ height: 1 }}
            />
          )}
        </div>
      </div>
    </>
  );
}
