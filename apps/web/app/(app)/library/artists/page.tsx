"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useShelfDetailHistory } from "@/hooks/use-shelf-detail-history";
import AmpContextMenuButton from "@/components/custom-elements/AmpContextMenuButton";
import type { SortDirection } from "@/components/custom-elements/m404-sort-menu-button";
import HeaderWithSort from "@/components/layout/header-with-sort";
import EmptyState from "@/components/layout/empty-state";
import CatalogPageLoading from "@/components/loading/catalog-page-loading";
import { RequestErrorState } from "@/components/states/request-error-state";
import MediaCardRenderer from "@/components/media/media-card-renderer";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useLibraryMediaCards } from "@/lib/library/use-library-media-cards";
import { groupLibraryAlbumsByArtists } from "@/lib/library/library-artist-groups";
import { isLibraryResourcePendingRemoval } from "@/lib/library/library-resources.api";
import { useLibraryResourcesRevision } from "@/lib/library/use-library-resources-revision";
import { projectLibraryMediaCard } from "@/lib/library/library-media-card.mapper";
import { setLibraryAlbumOrigin } from "@/lib/library/library-album-origin";
import { getArtworkRenditionUrl, getArtworkSrcSet } from "@/lib/media/artwork";
import { normalizeArtworkColor } from "@/lib/media/normalize-media-resource";
import { useMinimumLoadingDuration } from "@/lib/loading/use-minimum-loading-duration";
import { playLibraryAlbums } from "@/lib/library/play-library-albums";
import { useArtistFollow } from "@/lib/favorites/use-artist-follow";
import { notifyMenuError } from "@/lib/notifications/menu-toast";
import { createAndPlayArtistStation } from "@/lib/recommendations/artist-station";
import { CreateStationIcon } from "@/lib/context-menu/icons";
import CardArtwork from "@/components/media/common/card-artwork";
import { FavoriteBadge } from "@/components/media/common/favorite-badge";
import { formatReleaseYear } from "@/lib/format/release-date";

type ArtistSelection = {
  userId?: string;
  id: string;
};

export default function ArtistsPage() {
  const isDesktopViewport = useMediaQuery("(min-width: 1000px)");
  const userId = useAuthStore((state) => state.user?.userId);
  const revision = useLibraryResourcesRevision();
  const { resources, followedArtists, loading, error, retry } =
    useLibraryMediaCards({
      userId,
      includeArtists: true,
      errorMessage: "Could not load your Library artists.",
    });
  const visibleLoading = useMinimumLoadingDuration(loading);
  const followedArtistIds = useMemo(
    () => new Set(followedArtists.map((artist) => artist.id)),
    [followedArtists],
  );
  const [direction, setDirection] = useState<SortDirection>("ascending");
  const [selection, setSelection] = useState<ArtistSelection | null>(null);
  const [mobileSelection, setMobileSelection] =
    useState<ArtistSelection | null>(null);
  const { open: openArtistDetail } = useShelfDetailHistory({
    owner: `library-artists:${userId ?? ""}`,
    selected: mobileSelection,
    setSelected: setMobileSelection,
    getKey: (artist) => artist.id,
    restoreScroll: !isDesktopViewport,
  });
  const mobileDetailOpen =
    mobileSelection !== null && mobileSelection.userId === userId;
  const [startingPlayback, setStartingPlayback] = useState(false);
  const [pressedPlaybackButton, setPressedPlaybackButton] = useState<
    "play" | "shuffle" | null
  >(null);
  const [favoriteHoverSuppressed, setFavoriteHoverSuppressed] = useState(false);
  const playbackPending = useRef(false);
  const playbackPressProps = (button: "play" | "shuffle") => ({
    "data-pressed": pressedPlaybackButton === button || undefined,
    onPointerDown: () => setPressedPlaybackButton(button),
    onPointerUp: () => setPressedPlaybackButton(null),
    onPointerCancel: () => setPressedPlaybackButton(null),
    onPointerLeave: () => setPressedPlaybackButton(null),
  });
  const groups = useMemo(
    () =>
      groupLibraryAlbumsByArtists(
        resources.filter(
          (album) =>
            !isLibraryResourcePendingRemoval(
              album.resourceType,
              album.resourceId,
            ),
        ),
        followedArtists,
      ).sort((a, b) => {
        const value = a.title.localeCompare(b.title);
        return direction === "ascending" ? value : -value;
      }),
    // Pending removals live in the shared registry; revision invalidates this projection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resources, followedArtists, direction, revision],
  );
  const activeSelection = isDesktopViewport ? selection : mobileSelection;
  const selected =
    groups.find(
      (group) =>
        activeSelection?.userId === userId && group.id === activeSelection?.id,
    ) ?? groups[0];
  const firstArtist = selected?.artists[0];
  const {
    isFollowing,
    loading: followLoading,
    toggle: toggleFollow,
  } = useArtistFollow(firstArtist?.id ?? "", firstArtist ? userId : undefined);
  const playbackVersion = useRef(0);
  const groupId = selected?.id;
  useEffect(() => {
    playbackVersion.current += 1;
    return () => {
      playbackVersion.current += 1;
    };
  }, [userId, groupId, revision]);

  const play = async (shuffle = false) => {
    if (!userId || !selected || playbackPending.current) return;
    playbackPending.current = true;
    setStartingPlayback(true);
    const version = playbackVersion.current;
    const isStation = selected.albums.length === 0;
    const failureMessage = isStation
      ? "Could not create this artist's station. Please try again."
      : "Could not play your saved music. Please try again.";
    try {
      const isCurrent = () => version === playbackVersion.current;
      let played = false;
      if (isStation && firstArtist) {
        played = await createAndPlayArtistStation(
          firstArtist.id,
          getArtworkRenditionUrl(selected.artwork, 316),
        );
      } else if (!isStation) {
        played = await playLibraryAlbums(
          selected.albums.map((album) => album.resourceId),
          { shuffle, isCurrent },
        );
      }
      if (!played && isCurrent())
        notifyMenuError(
          isStation ? failureMessage : "No saved songs available to play.",
        );
    } catch {
      if (version === playbackVersion.current) {
        notifyMenuError(failureMessage);
      }
    } finally {
      playbackPending.current = false;
      setStartingPlayback(false);
    }
  };

  if (visibleLoading) return <CatalogPageLoading />;
  if (error) return <RequestErrorState onRetry={retry} />;
  if (!selected) return <EmptyState />;
  const avatarSrcSet = getArtworkSrcSet(selected.artwork, [94, 188]);
  const avatarColor = normalizeArtworkColor(selected.artwork);

  return (
    <>
      {(isDesktopViewport || !mobileDetailOpen) && (
        <HeaderWithSort
          title="Artists"
          sortBy="title"
          sortOptions={["title"]}
          direction={direction}
          onDirectionChange={setDirection}
        />
      )}
      <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-3">
        <div className="in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
          <div className="artists-container">
            <div
              className={`artist-list-container ${mobileDetailOpen ? "max-[999px]:hidden" : ""}`}
            >
              <div className="scrollable-container-constrained-width">
                <div
                  className="scrollable-container"
                  style={{ contain: "layout" }}
                >
                  {groups.map((group) => {
                    const isSelected =
                      isDesktopViewport && group.id === selected.id;
                    const artwork = getArtworkRenditionUrl(group.artwork, 72);
                    const artworkColor = normalizeArtworkColor(group.artwork);
                    const artistId = group.artists[0]?.id;
                    const isArtistFavorite =
                      artistId === firstArtist?.id
                        ? isFollowing
                        : Boolean(artistId && followedArtistIds.has(artistId));
                    return (
                      <div key={group.id} className="library-artists">
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          className={`library-artists-component text-start ${isSelected ? "is-selected" : ""}`}
                          onClick={() => {
                            const nextSelection = { userId, id: group.id };
                            setSelection(nextSelection);
                            if (!isDesktopViewport)
                              openArtistDetail(nextSelection);
                          }}
                        >
                          <span className="artist-icon shrink-0">
                            <CardArtwork
                              variant="cover"
                              title={group.title}
                              altText={group.artists[0]?.name ?? group.title}
                              imageSrcSet={artwork}
                              artworkColors={{
                                bg: artworkColor,
                                main: artworkColor,
                              }}
                              sizes="40px"
                            />
                          </span>

                          <span className="artist-name">{group.title}</span>

                          {isArtistFavorite && <FavoriteBadge />}

                          {!isDesktopViewport && (
                            <span className="ms-auto grid h-7 shrink-0 place-items-center ps-2.5">
                              <svg
                                width="36"
                                height="64"
                                strokeLinejoin="round"
                                viewBox="0 0 36 64"
                                className="size-3.75 fill-(--systemTertiary)"
                                aria-hidden="true"
                              >
                                <path d="M3.344 64c.957 0 1.768-.368 2.394-.994l29.2-28.538c.701-.7 1.069-1.547 1.069-2.468 0-.957-.368-1.841-1.068-2.467L5.774 1.031C5.112.37 4.301.001 3.344.001 1.43 0-.006 1.472-.006 3.387c0 .884.367 1.767.956 2.393L27.758 32 .95 58.218a3.5 3.5 0 0 0-.956 2.395c0 1.914 1.435 3.387 3.35 3.387"></path>
                              </svg>
                            </span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <article
              className={`artist-detail-container ${mobileDetailOpen ? "" : "max-[999px]:hidden"} ${selected.albums.length ? "" : "flex flex-col"}`}
            >
              <div className="artist-detail-header">
                <h1 className="artist-detail-name">
                  {firstArtist?.url ? (
                    <Link href={firstArtist.url} className="click-action">
                      {selected.title}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="chevron"
                        viewBox="0 0 64 64"
                        aria-hidden="true"
                      >
                        <path d="M19.817 61.863c1.48 0 2.672-.515 3.702-1.546l24.243-23.63c1.352-1.385 1.996-2.737 2.028-4.443 0-1.674-.644-3.09-2.028-4.443L23.519 4.138c-1.03-.998-2.253-1.513-3.702-1.513-2.994 0-5.409 2.382-5.409 5.344 0 1.481.612 2.833 1.739 3.96l20.99 20.347-20.99 20.283c-1.127 1.126-1.739 2.478-1.739 3.96 0 2.93 2.415 5.344 5.409 5.344" />
                      </svg>
                    </Link>
                  ) : (
                    selected.title
                  )}
                </h1>

                <div className="artist-detail-header__buttons">
                  {selected.albums.length > 0 && (
                    <>
                      <button
                        type="button"
                        aria-label={`Play ${selected.title}`}
                        {...playbackPressProps("play")}
                        disabled={startingPlayback}
                        onClick={() => void play()}
                        className="play-button play-button--platter is-stand-alone"
                      >
                        <svg aria-hidden="true" className="icon play-svg">
                          <use href="#play-circle-fill" />
                        </svg>
                      </button>

                      <div className="w-full min-[1260px]:w-auto">
                        <button
                          type="button"
                          className="click-action"
                          aria-label="Shuffle"
                          {...playbackPressProps("shuffle")}
                          disabled={startingPlayback}
                          onClick={() => void play(true)}
                        >
                          <span className="icon">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="icon shuffle"
                              viewBox="0 0 18 14"
                            >
                              <path d="M.012 10.903c0 .43.333.732.79.732H2.54c1.272 0 2.019-.37 2.89-1.397l1.79-2.13 1.767 2.093c.894 1.065 1.737 1.434 3.009 1.434h1.478v1.782c0 .355.214.562.57.562.162 0 .31-.06.435-.155l2.898-2.418c.281-.23.281-.584 0-.828L14.48 8.161a.67.67 0 0 0-.436-.156c-.355 0-.569.2-.569.562v1.597H12.04c-.872 0-1.442-.288-2.07-1.042L8.166 6.985l1.811-2.144c.643-.761 1.161-1.035 2.019-1.035h1.478v1.627c0 .355.214.562.57.562.162 0 .31-.06.435-.156l2.898-2.417c.281-.23.281-.584 0-.828L14.48.177a.67.67 0 0 0-.436-.156c-.355 0-.569.2-.569.562v1.745h-1.471c-1.316 0-2.122.362-3.06 1.486L7.22 5.862l-1.79-2.13c-.87-1.027-1.67-1.397-2.933-1.397H.803c-.458 0-.791.303-.791.732s.333.74.79.74h1.635c.828 0 1.404.288 2.04 1.042l1.797 2.136-1.797 2.137c-.636.754-1.168 1.042-1.988 1.042H.803c-.458 0-.791.31-.791.74Z" />
                            </svg>
                          </span>
                        </button>
                      </div>
                    </>
                  )}

                  <button
                    type="button"
                    className="favorite-button favorite-button--platter"
                    aria-label={isFollowing ? "Undo Follow" : "Follow"}
                    aria-pressed={isFollowing}
                    data-hover-suppressed={favoriteHoverSuppressed || undefined}
                    disabled={!firstArtist || !userId || followLoading}
                    onPointerLeave={() => setFavoriteHoverSuppressed(false)}
                    onClick={() => {
                      setFavoriteHoverSuppressed(true);
                      void toggleFollow().catch(() =>
                        notifyMenuError("Could not update artist favourite."),
                      );
                    }}
                  >
                    <svg
                      width="60"
                      height="60"
                      viewBox="0 0 60 60"
                      xmlns="http://www.w3.org/2000/svg"
                      className="favorite-icon"
                    >
                      <g className="favorite-icon__unfollowed">
                        <path
                          className="favorite-icon__star"
                          d="M18.907 45.857c.665.518 1.508.34 2.513-.39l8.575-6.305 8.592 6.305c1.005.73 1.831.908 2.512.39.665-.503.81-1.33.405-2.513L38.116 33.26l8.657-6.225c1.005-.713 1.41-1.459 1.15-2.27-.259-.777-1.02-1.166-2.269-1.15l-10.618.065-3.225-10.132c-.39-1.2-.973-1.799-1.816-1.799-.827 0-1.41.6-1.8 1.8L24.97 23.68l-10.618-.064c-1.248-.016-2.01.373-2.27 1.15-.275.811.146 1.557 1.152 2.27l8.656 6.225-3.388 10.083c-.405 1.183-.26 2.01.405 2.513Zm2.334-3.21c-.032-.033-.016-.049 0-.146l3.226-9.272c.227-.633.098-1.135-.47-1.524l-8.073-5.576c-.08-.05-.097-.081-.08-.13.016-.049.048-.049.145-.049l9.808.179c.664.016 1.086-.26 1.296-.924l2.821-9.386c.016-.098.049-.13.081-.13.049 0 .081.032.097.13l2.82 9.386c.212.664.633.94 1.298.924l9.807-.179c.097 0 .13 0 .146.049.016.049-.016.08-.081.13l-8.073 5.576c-.567.389-.697.891-.47 1.524l3.226 9.272c.016.097.032.113 0 .146-.033.048-.081.016-.146-.033l-7.797-5.949c-.519-.405-1.119-.405-1.637 0l-7.798 5.95c-.065.048-.113.08-.146.032Z"
                        />
                      </g>
                      <g className="favorite-icon__followed">
                        <path
                          className="favorite-icon__cutout"
                          d="M30 60c16.412 0 30-13.618 30-30C60 13.588 46.382 0 29.97 0 13.588 0 0 13.588 0 30c0 16.382 13.618 30 30 30Zm-8.706-14.324c-1.765 1.353-3.647-.029-2.941-2.117l3.412-10.265-8.794-6.265c-1.647-1.205-1.089-3.558 1.147-3.529l10.794.088 3.294-10.323c.647-2.03 2.94-2.03 3.588 0l3.294 10.323 10.794-.088c2.265-.03 2.765 2.353 1.147 3.5l-8.794 6.294 3.441 10.265c.677 2.088-1.176 3.47-2.97 2.117L30 39.324l-8.706 6.352Z"
                        ></path>
                      </g>
                    </svg>
                  </button>

                  {firstArtist && (
                    <AmpContextMenuButton
                      context={{
                        kind: "artist",
                        artistId: firstArtist.id,
                        title: firstArtist.name,
                        href: firstArtist.url,
                        isFavorite: isFollowing,
                      }}
                      hasPlatter
                      className="more-button--material"
                    />
                  )}
                </div>
              </div>

              {selected.albums.length ? (
                <ul
                  key={selected.id}
                  className="mx-(--bodyGutter) mb-8 grid grid-cols-2 gap-5 min-[1260px]:grid-cols-3 min-[1580px]:grid-cols-4"
                >
                  {selected.albums.map((album) => (
                    <MediaCardRenderer
                      key={album.resourceId}
                      {...projectLibraryMediaCard(album)}
                      subtitle={formatReleaseYear(album.releaseDate)}
                      artists={[]}
                      onOpen={() =>
                        setLibraryAlbumOrigin(
                          album.resourceId,
                          "/library/artists",
                        )
                      }
                    />
                  ))}
                </ul>
              ) : (
                <div className="empty-state--artist">
                  <div className="artist-empty-state__artwork">
                    <div className="[--linkHoverTextDecoration:none]">
                      <Link
                        href={firstArtist?.url || "/library/artists"}
                        className="block"
                      >
                        <div className="text-center">
                          <div className="overflow-hidden relative rounded-[50%] shadow-[0_1px_1px_rgba(0,0,0,.01),0_2px_2px_rgba(0,0,0,.01),0_4px_4px_rgba(0,0,0,.02),0_8px_8px_rgba(0,0,0,.03),0_14px_14px_rgba(0,0,0,.03)] z-(--z-default) before:absolute before:top-0 before:z-(--z-default) before:block before:size-full before:max-h-full before:max-w-full before:pointer-events-none before:rounded-[50%] before:shadow-[inset_0_0_0_1px_rgba(128,128,128,.1)] before:content-[''] after:absolute after:inset-0 after:z-1 after:rounded-[50%] after:bg-[#333333]/30 after:opacity-0 after:transition-opacity after:duration-100 after:ease-in group-hover:after:opacity-100">
                            <CardArtwork
                              variant="cover"
                              title={selected.title}
                              altText={firstArtist?.name ?? selected.title}
                              imageSrcSet={avatarSrcSet}
                              artworkColors={{
                                bg: avatarColor,
                                main: avatarColor,
                              }}
                              sizes="94px"
                            />
                          </div>
                        </div>
                      </Link>
                    </div>
                  </div>

                  <p className="empty-state__description">
                    Add music by {selected.title} to collect it here, or create
                    a station to hear similar music.
                  </p>

                  <div className="artist-empty-state__cta">
                    <button
                      type="button"
                      className="artist-empty-state__station-button"
                      disabled={!firstArtist || startingPlayback}
                      onClick={() => void play()}
                    >
                      <CreateStationIcon className="size-4.5 fill-current" />
                      Start Station
                    </button>
                  </div>
                </div>
              )}
            </article>
          </div>
        </div>
      </div>
    </>
  );
}
