"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AmpContextMenuButton from "../custom-elements/AmpContextMenuButton";
import AmbientVideo from "../custom-elements/AmpVideo";
import CardArtwork from "../media/common/card-artwork";
import { useCatalogArtist } from "@/lib/catalog/use-catalog-artist";
import {
  catalogArtworkSrcSet,
  mapCatalogTracks,
} from "@/lib/catalog/catalog.mapper";
import {
  getCatalogAlbum,
  getCatalogSimilarArtists,
} from "@/lib/catalog/catalog.api";
import { useAsyncResource } from "@/lib/api/use-async-resource";
import { toTrackSources } from "@/lib/songs/track-sources";
import { playCatalogResource } from "@/lib/catalog/play-catalog-resource";
import { albumRoute } from "@/lib/catalog/album-route";
import { artistRoute, artistTopSongsRoute } from "@/lib/catalog/artist-route";
import { createAndPlayArtistPlayStation } from "@/lib/recommendations/artist-station";
import Link from "next/link";
import CardContextMenu from "../media/common/card-context-menu";
import CardPlayButton from "../media/common/card-play-button";
import CatalogPageLoading from "../loading/catalog-page-loading";
import { RequestErrorState } from "../states/request-error-state";
import { NotFoundState } from "../states/not-found-state";
import { useMinimumLoadingDuration } from "@/lib/loading/use-minimum-loading-duration";
import { ExplicitBadgeIcon } from "../icons/explicit-badge-icon";
import { useAuthStore } from "@/lib/auth/auth-store";
import { AddToLibraryButton } from "../songs/add-to-library-button";
import MediaShelf from "../media/media-shelf";
import {
  ShelfDetailLoading,
  ShelfDetailView,
} from "../media/shelf-detail-view";
import {
  catalogAlbumReleaseYearCardOptions,
  mapCatalogAlbumResources,
  mapCatalogArtists,
} from "@/lib/catalog/search.mapper";
import { HOME_SHELF_PREVIEW_LIMIT } from "@musical/shared-constants";
import { useAppScrollToTop } from "@/lib/layout/use-app-scroll-to-top";
import { formatReleaseDate } from "@/lib/format/release-date";
import type { CatalogArtistAlbumSectionData } from "@/lib/catalog/use-catalog-artist";
import { CatalogMusicVideosShelf } from "../music-videos/catalog-music-videos-shelf";
import { FavoriteActionButton } from "../songs/favorite-action-button";
import { TrackLockupShelf } from "../songs/track-lockup-shelf";
import {
  getArtistFollow,
  setArtistFollow,
} from "@/lib/favorites/artist-follow.api";
import { subscribeArtistFollowChanges } from "@/lib/favorites/artist-follow-events";
import { useShelfDetailHistory } from "@/hooks/use-shelf-detail-history";

type ArtistDetailPageProps = {
  artistId: string;
  slug: string;
};

type AlbumShelfSection = "albums" | "singlesAndEps" | "appearsOn";
type AlbumSectionItems = Partial<
  Record<AlbumShelfSection, CatalogArtistAlbumSectionData>
>;
const SIMILAR_ARTIST_SHELF_PREVIEW_LIMIT = 10;

export function ArtistDetailPage({ artistId, slug }: ArtistDetailPageProps) {
  const router = useRouter();
  const {
    artist,
    albums,
    albumSections,
    songs,
    loading,
    error,
    errorStatus,
    reload,
    loadAlbumSection,
  } = useCatalogArtist(artistId);
  const showLoading = useMinimumLoadingDuration(loading);
  const userId = useAuthStore((state) => state.user?.userId);
  const [startingStation, setStartingStation] = useState(false);
  const [isArtistFollowed, setIsArtistFollowed] = useState(false);
  const [artistFollowLoading, setArtistFollowLoading] = useState(false);
  const [selectedAlbumSection, setSelectedAlbumSection] =
    useState<AlbumShelfSection | null>(null);
  const [loadedAlbumSections, setLoadedAlbumSections] =
    useState<AlbumSectionItems>({});
  const [loadingAlbumSection, setLoadingAlbumSection] =
    useState<AlbumShelfSection | null>(null);
  const [selectedSimilarArtistId, setSelectedSimilarArtistId] = useState<
    string | null
  >(null);
  const { open: openAlbumShelf, close: closeAlbumShelf } =
    useShelfDetailHistory({
      owner: `artist-albums:${artistId}`,
      selected: selectedAlbumSection,
      setSelected: setSelectedAlbumSection,
      getKey: (section) => section,
    });
  const { open: openSimilarArtists, close: closeSimilarArtists } =
    useShelfDetailHistory({
      owner: `artist-similar:${artistId}`,
      selected: selectedSimilarArtistId,
      setSelected: setSelectedSimilarArtistId,
      getKey: (value) => value,
    });
  const [allSimilarArtistCards, setAllSimilarArtistCards] = useState<{
    artistId: string;
    cards: ReturnType<typeof mapCatalogArtists>;
  } | null>(null);
  const [loadingSimilarArtistId, setLoadingSimilarArtistId] = useState<
    string | null
  >(null);
  const artistFollowRevisionRef = useRef(0);
  const isFollowingArtist = Boolean(userId) && isArtistFollowed;
  const selectedSimilarArtists = selectedSimilarArtistId === artistId;
  const loadingSimilarArtists = loadingSimilarArtistId === artistId;
  const currentSimilarArtistCards =
    allSimilarArtistCards?.artistId === artistId
      ? allSimilarArtistCards.cards
      : null;

  const artistName = artist?.attributes?.name;
  const artistOrigin = artist?.attributes?.origin?.trim();
  const artistBirthDate = artist?.attributes?.birthDate;
  const artistBiography = artist?.attributes?.biography?.trim();
  const artistGenres = artist?.attributes?.genreNames.filter(Boolean) ?? [];

  useEffect(() => {
    if (!userId) {
      artistFollowRevisionRef.current += 1;
      return;
    }
    let cancelled = false;
    const requestRevision = ++artistFollowRevisionRef.current;
    void getArtistFollow(artistId)
      .then((isFollowed) => {
        if (!cancelled && requestRevision === artistFollowRevisionRef.current) {
          setIsArtistFollowed(isFollowed);
        }
      })
      .catch(() => {
        if (!cancelled && requestRevision === artistFollowRevisionRef.current) {
          setIsArtistFollowed(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [artistId, userId]);

  useEffect(
    () =>
      subscribeArtistFollowChanges(
        ({ artistId: changedArtistId, isFollowed }) => {
          if (changedArtistId === artistId) {
            artistFollowRevisionRef.current += 1;
            setIsArtistFollowed(isFollowed);
          }
        },
      ),
    [artistId],
  );

  const toggleArtistFollow = async () => {
    if (!userId || artistFollowLoading) return;
    const nextFollowed = !isFollowingArtist;
    setArtistFollowLoading(true);
    try {
      await setArtistFollow(artistId, nextFollowed);
    } finally {
      setArtistFollowLoading(false);
    }
  };

  const artworkColor = artist?.attributes?.artwork?.bgColor
    ? `#${artist.attributes.artwork.bgColor.replace(/^#/, "")}`
    : "#000000";

  const poster = artist?.attributes?.editorialVideo?.primary?.variants?.poster;
  const artwork = artist?.attributes?.artwork;

  const renditions =
    poster?.variants?.renditions || artwork?.variants?.renditions || [];

  const imageSrcSet =
    renditions.length > 0
      ? renditions.map((r) => `${r.url} ${r.width}w`).join(", ")
      : poster?.url
        ? `${poster.url} 2400w`
        : artwork?.url
          ? `${artwork.url} 2400w`
          : "";

  const videoSrc = artist?.attributes?.editorialVideo?.primary?.video;
  const latestRelease = albums[0];
  const latestReleaseArtwork = latestRelease?.attributes.artwork;
  const latestReleaseArtworkColor = latestReleaseArtwork?.bgColor
    ? `#${latestReleaseArtwork.bgColor.replace(/^#/, "")}`
    : "var(--genericJoeColor)";
  const latestReleaseSrcSet = catalogArtworkSrcSet(
    latestReleaseArtwork,
    [296, 316, 592, 632],
  );
  const latestReleaseDate = formatReleaseDate(
    latestRelease?.attributes.releaseDate,
    "short",
  ).toUpperCase();
  const latestReleaseIsExplicit =
    latestRelease?.attributes.contentRating === "explicit";
  const latestReleaseTrackCount = latestRelease?.attributes.trackCount;
  const latestReleaseId = latestRelease?.id;
  const loadLatestRelease = useCallback(
    (signal?: AbortSignal) =>
      latestReleaseId
        ? getCatalogAlbum(latestReleaseId, signal)
        : Promise.resolve(null),
    [latestReleaseId],
  );
  const { data: latestReleaseCatalog } = useAsyncResource(
    loadLatestRelease,
    "Couldn't load album.",
    { enabled: Boolean(latestReleaseId) },
  );
  const loadSimilarArtists = useCallback(
    (signal?: AbortSignal) =>
      getCatalogSimilarArtists(artistId, {
        limit: SIMILAR_ARTIST_SHELF_PREVIEW_LIMIT + 1,
        signal,
      }),
    [artistId],
  );
  const { data: similarArtistsCatalog } = useAsyncResource(
    loadSimilarArtists,
    "Couldn't load similar artists.",
  );
  const similarArtistCards = useMemo(
    () =>
      similarArtistsCatalog ? mapCatalogArtists(similarArtistsCatalog) : [],
    [similarArtistsCatalog],
  );
  const latestReleaseTracks = useMemo(
    () =>
      latestRelease && latestReleaseCatalog
        ? mapCatalogTracks(latestReleaseCatalog, { albumId: latestRelease.id })
        : [],
    [latestRelease, latestReleaseCatalog],
  );
  const topSongPreview = songs.slice(0, 24);
  const hasArtistMusic = songs.length > 0 || albums.length > 0;
  const shouldShowMusicEmptyState =
    !hasArtistMusic && albumSections.appearsOn.albums.length === 0;
  const albumCards = mapCatalogAlbumResources(
    albumSections.albums.albums.slice(0, HOME_SHELF_PREVIEW_LIMIT),
    catalogAlbumReleaseYearCardOptions,
    albumSections.albums.artistResources,
  );
  const singleAndEpCards = mapCatalogAlbumResources(
    albumSections.singlesAndEps.albums.slice(0, HOME_SHELF_PREVIEW_LIMIT),
    catalogAlbumReleaseYearCardOptions,
    albumSections.singlesAndEps.artistResources,
  );
  const appearsOnCards = mapCatalogAlbumResources(
    albumSections.appearsOn.albums.slice(0, HOME_SHELF_PREVIEW_LIMIT),
    {},
    albumSections.appearsOn.artistResources,
  );
  const handleSelectAlbumSection = useCallback(
    async (section: AlbumShelfSection) => {
      if (loadedAlbumSections[section]) {
        openAlbumShelf(section);
        return;
      }

      try {
        openAlbumShelf(section);
        setLoadingAlbumSection(section);
        const sectionAlbums = await loadAlbumSection(section);
        setLoadedAlbumSections((current) => ({
          ...current,
          [section]: sectionAlbums,
        }));
      } catch {
        closeAlbumShelf();
      } finally {
        setLoadingAlbumSection((current) =>
          current === section ? null : current,
        );
      }
    },
    [closeAlbumShelf, loadAlbumSection, loadedAlbumSections, openAlbumShelf],
  );

  const handleSelectSimilarArtists = useCallback(async () => {
    if (currentSimilarArtistCards) {
      openSimilarArtists(artistId);
      return;
    }
    if (loadingSimilarArtists) return;

    try {
      openSimilarArtists(artistId);
      setLoadingSimilarArtistId(artistId);
      const catalog = await getCatalogSimilarArtists(artistId, { limit: 500 });
      setAllSimilarArtistCards({
        artistId,
        cards: mapCatalogArtists(catalog),
      });
    } catch {
      closeSimilarArtists();
    } finally {
      setLoadingSimilarArtistId((current) =>
        current === artistId ? null : current,
      );
    }
  }, [
    artistId,
    closeSimilarArtists,
    currentSimilarArtistCards,
    loadingSimilarArtists,
    openSimilarArtists,
  ]);

  const selectedAlbumShelf = useMemo(() => {
    if (!selectedAlbumSection) return null;
    const sectionAlbums = loadedAlbumSections[selectedAlbumSection];
    if (!sectionAlbums) return null;

    return {
      title: {
        albums: "Albums",
        singlesAndEps: "Singles & EPs",
        appearsOn: "Appears On",
      }[selectedAlbumSection],
      items: mapCatalogAlbumResources(
        sectionAlbums.albums,
        selectedAlbumSection === "appearsOn"
          ? undefined
          : catalogAlbumReleaseYearCardOptions,
        sectionAlbums.artistResources,
      ),
    };
  }, [loadedAlbumSections, selectedAlbumSection]);

  useAppScrollToTop(artistId);

  useAppScrollToTop(
    selectedAlbumSection ?? (selectedSimilarArtists ? "similar-artists" : null),
  );

  if (showLoading) {
    return <CatalogPageLoading />;
  }

  if (errorStatus === 404) return <NotFoundState />;

  if (error) return <RequestErrorState onRetry={() => void reload()} />;

  if (!artist) return <NotFoundState />;

  if (
    (selectedAlbumSection && loadingAlbumSection === selectedAlbumSection) ||
    (selectedSimilarArtists && loadingSimilarArtists)
  ) {
    return <ShelfDetailLoading />;
  }

  if (selectedAlbumShelf) {
    return (
      <ShelfDetailView shelf={selectedAlbumShelf} onBack={closeAlbumShelf} />
    );
  }

  if (selectedSimilarArtists && currentSimilarArtistCards) {
    return (
      <ShelfDetailView
        shelf={{ title: "Similar Artists", items: currentSimilarArtistCards }}
        onBack={closeSimilarArtists}
      />
    );
  }

  const playArtistStation = async () => {
    if (startingStation) return;

    setStartingStation(true);
    try {
      await createAndPlayArtistPlayStation(
        artistId,
        artist?.attributes.artwork?.url,
      );
    } catch {
      return;
    } finally {
      setStartingStation(false);
    }
  };

  return (
    <div className="artist-detail-page contents">
      <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) min-[484px]:pt-3">
        <div className="in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
          <div
            className={`${videoSrc ? "overflow-hidden relative h-[calc((100vw-var(--web-navigation-width))/2.28571)] min-h-81 min-[1000px]:max-h-[calc(1680px/var(--fixed-artwork-ratio-lg,2.5714285714))] min-[1000px]:relative min-[1000px]:z-(--z-default) min-[1260px]:h-[calc((100vw-var(--web-navigation-width))/2.57143)] min-[1260px]:max-h-[653.33333px] before:bg-transparent before:bg-none before:bg-top before:bg-no-repeat before:bg-cover before:content-[''] before:h-[calc((100vw-var(--sidebar-width-expanded,260px))/var(--fixed-artwork-ratio-lg,2.2857142857))] before:max-h-[calc(1680px/var(--fixed-artwork-ratio-sm,2.5714285714))] before:max-w-[1680px] before:absolute before:w-[calc(100vw-var(--sidebar-width-expanded,260px))] before:z-(--z-default) min-[1000px]:before:bg-(--background-color) min-[1000px]:before:bg-(image:--background-image-xs) min-[1260px]:before:bg-(image:--background-image) min-[1260px]:before:h-[calc((100vw-var(--sidebar-width-expanded,260px))/var(--fixed-artwork-ratio-sm,2.5714285714))] after:bg-[linear-gradient(0deg,rgba(0,0,0,.36)_0,rgba(0,0,0,.25)_36%,transparent)] after:bottom-0 after:block after:left-0 after:pointer-events-none after:absolute after:right-0 after:top-auto after:z-(--z-default) after:h-37.5" : "h-(--artistHeaderHeightXs,324px) overflow-hidden relative min-[1000px]:h-96.5 before:bg-transparent before:bg-none before:bg-top before:bg-no-repeat before:bg-cover before:content-[''] before:h-[calc((100vw-var(--sidebar-width-expanded,260px))/var(--fixed-artwork-ratio-lg,2.2857142857))] before:max-h-[calc(1680px/var(--fixed-artwork-ratio-sm,2.5714285714))] before:max-w-[1680px] before:absolute before:w-[calc(100vw-var(--sidebar-width-expanded,260px))] before:z-(--z-default) min-[1000px]:before:bg-(--background-color) min-[1000px]:before:bg-(image:--background-image-xs) min-[1260px]:before:bg-(image:--background-image) min-[1260px]:before:h-[calc((100vw-var(--sidebar-width-expanded,260px))/var(--fixed-artwork-ratio-sm,2.5714285714))] after:bg-[linear-gradient(0deg,rgba(0,0,0,.36)_0,rgba(0,0,0,.25)_36%,transparent)] after:bottom-0 after:block after:left-0 after:pointer-events-none after:absolute after:right-0 after:top-auto after:z-(--z-default) after:h-36.5"}`}
          >
            {videoSrc ? (
              <div className="rounded-[inherit] [--artist-header-aspect-ratio:2.2857142857] [--artwork-override-width:100vw] [--artwork-override-height:calc(var(--artwork-override-width)/var(--artist-header-aspect-ratio))] [--artwork-override-min-height:324px] [--artwork-override-max-width:1680px] [--artwork-override-max-height:calc(1680px/2.5714285714)] inset-s-auto static min-[484px]:[--artwork-override-width:calc(100vw-var(--web-navigation-width))] min-[484px]:[--artwork-override-height:calc(var(--artwork-override-width)/var(--artist-header-aspect-ratio))] min-[484px]:h-(--artwork-override-height) min-[484px]:max-h-(--artwork-override-max-height) min-[484px]:max-w-(--artwork-override-max-width) min-[484px]:min-h-(--artwork-override-min-height) min-[484px]:w-(--artwork-override-width)">
                <CardArtwork
                  variant="cover"
                  sizes="1200px"
                  artworkColors={{ bg: artworkColor, main: artworkColor }}
                  imageSrcSet={imageSrcSet}
                  title={artistName!}
                  altText={artistName}
                />

                {videoSrc && (
                  <div className="rounded-[inherit] size-full pointer-events-none absolute inset-0 z-(--z-default) min-h-81 overflow-hidden [-webkit-box-reflect:above]">
                    <AmbientVideo variant="artist" keepAlive src={videoSrc} />
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-[100%] justify-items-center pt-10 relative w-full z-[calc(var(--z-default)+1)] min-[1000px]:pt-20">
                <div className="rounded-[50%] col-span-full row-span-full size-43.5 filter-[blur(40px)] opacity-40 transform-[translateY(10px)_translateZ(0)] min-[1000px]:size-47.5">
                  <div className="rounded-[50%] size-full overflow-hidden z-(--z-default)">
                    <CardArtwork
                      variant="cover"
                      sizes="190px"
                      artworkColors={{ bg: artworkColor, main: artworkColor }}
                      imageSrcSet={imageSrcSet}
                      title={artistName!}
                      altText={artistName}
                    />
                    <div className="mt-2"></div>
                  </div>
                </div>

                <div className="rounded-[50%] shadow-[0_10px_25px_rgba(0,0,0,.1)] col-span-full row-span-full size-43.5 min-[1000px]:size-47.5">
                  <div className="rounded-[50%] size-full overflow-hidden z-(--z-default)">
                    <CardArtwork
                      variant="cover"
                      sizes="190px"
                      artworkColors={{ bg: artworkColor, main: artworkColor }}
                      imageSrcSet={imageSrcSet}
                      title={artistName!}
                      altText={artistName}
                    />
                    <div className="mt-2"></div>
                  </div>
                </div>
              </div>
            )}

            <div className="items-end bottom-0 grid [grid-template-areas:'._classical_favorite_menu'_'._._._.'_'badge_._._.'_'artist_._play_play'] grid-cols-[1fr_auto] grid-rows-[auto_minmax(16px,1fr)_auto_auto] size-full justify-end pt-5 px-(--bodyGutter) pb-5.75 absolute z-[calc(var(--z-default)+1)] min-[1000px]:[grid-template-areas:'badge_badge_._._.'_'play_artist_classical_favorite_menu'] min-[1000px]:grid-cols-[auto_1fr_auto_auto_auto] min-[1000px]:grid-rows-[auto_auto] min-[1000px]:h-auto">
              <h1 className="text-(--artist-header-name-color,var(--systemPrimary)) cursor-text [font:var(--header-emphasized)] [grid-area:artist] text-clip select-text line-clamp-2 [--artist-header-name-color:#fff] supports-[mask-image:linear-gradient(white,black)]:[-webkit-mask:linear-gradient(270deg,transparent,#000_36px)] supports-[mask-image:linear-gradient(white,black)]:[mask:linear-gradient(270deg,transparent,#000_36px)] supports-[mask-image:linear-gradient(white,black)]:[-webkit-mask-position:right] supports-[mask-image:linear-gradient(white,black)]:mask-right supports-[mask-image:linear-gradient(white,black)]:relative supports-[mask-image:linear-gradient(white,black)]:z-(--z-default)">
                {artistName}
              </h1>

              <span className="[--playButtonSize:36px] self-end [grid-area:play] h-(--playButtonSize) justify-self-end -translate-y-px w-(--playButtonSize) min-[1000px]:me-4">
                <button
                  aria-label={`Play ${artistName ?? "artist"} station`}
                  className="[--iconCircleFillBG:var(--playButtonCircleHoverColor,var(--keyColor,#000))] [--iconFillArrow:var(--playButtonIconHoverColor,#fff)] [--nonPlatterIconFill:var(--playButtonIconColor,#fff)] [--playingBarColor:var(--nonPlatterIconFill,#fff)] pointer-events-auto relative z-(--z-default) rounded-full block leading-0 not-focus:shadow-[0_2px_10px_rgba(0,0,0,0.2)]"
                  onClick={() => void playArtistStation()}
                  type="button"
                >
                  <svg
                    aria-hidden="true"
                    className="inline-block h-(--playButtonSize,30px) w-(--playButtonSize,30px) rounded-[50%] backdrop-filter-none bg-transparent"
                  >
                    <use href="#play-circle-fill"></use>
                  </svg>
                </button>
              </span>

              <span className="[--favoriteButtonBackground:transparent] [--favoriteButtonStarOutline:#fff] [--favoriteButtonStarCutout:#fff] [--favoriteButtonStarFill:transparent] [--favoriteButtonBackground-hover:transparent] [--favoriteButtonStarCutout-hover:#fff] [--favoriteButtonStarFill-hover:transparent] [--badgeColor:rgba(0,0,0,.5)] bg-[rgba(40,40,40,.5)] supports-[backdrop-filter:blur(10px)]:backdrop-saturate-180 supports-[backdrop-filter:blur(10px)]:backdrop-blur-[60px] rounded-full [grid-area:favorite] ms-2">
                <FavoriteActionButton
                  ariaLabel={isFollowingArtist ? `Undo Follow` : `Follow`}
                  disabled={!userId || artistFollowLoading}
                  onClick={() => void toggleArtistFollow()}
                  active={isFollowingArtist}
                />
              </span>

              <span className="artist-header__context-menu">
                <AmpContextMenuButton
                  context={{
                    kind: "artist",
                    artistId,
                    title: artistName ?? "Artist",
                    href: artistRoute(slug, artistId),
                    artworkUrl: artwork?.url,
                    isFavorite: isFollowingArtist,
                  }}
                  hasPlatter
                  className="more-button--material"
                />
              </span>
            </div>
          </div>
        </div>
      </div>

      {hasArtistMusic && (
        <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-3">
          <div className="in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
            <div className="pt-4 w-full"></div>
          </div>
        </div>
      )}

      {(hasArtistMusic || shouldShowMusicEmptyState) && (
        <div className="max-[999px]:[display:unset] flex pt-3 in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
          {latestRelease && (
            <div className="">
              <div className="flex justify-end items-center m-[0_var(--bodyGutter)_13px]">
                <div className="flex-1">
                  <h2 className="text-(--header-title-color,var(--systemPrimary,#000)) inline-block [font:var(--header-title-font,var(--title-2-emphasized))]">
                    <span dir="auto">Latest Release</span>
                  </h2>
                </div>
              </div>

              <div className="[--iconCircleFillBGOverride:transparent] items-center flex justify-start pb-8 ms-(--bodyGutter) w-[calc(100%-var(--bodyGutter))] min-[1000px]:w-[calc(50vw-var(--web-navigation-width,0)*2/4-50px)] min-[1260px]:w-[calc(40vw-var(--web-navigation-width,0)*2/5-44px)] min-[1580px]:w-[calc(25vw-var(--web-navigation-width,0)*2/8-35px)]">
                <div className="rounded-[7px] shadow-[0_1px_1px_rgba(0,0,0,0.01),0_2px_2px_rgba(0,0,0,0.01),0_4px_4px_rgba(0,0,0,0.02),0_8px_8px_rgba(0,0,0,0.03),0_14px_14px_rgba(0,0,0,0.03)] cursor-pointer relative [--scrimOpacity:0] hover:[--scrimOpacity:1]">
                  <div className="rounded-[7px] after:absolute after:inset-0 after:rounded-[inherit] after:bg-[#333333]/30 after:opacity-(--scrimOpacity,0) after:transition-opacity after:duration-100 after:ease-in after:z-1">
                    <CardArtwork
                      altText={latestRelease?.attributes.name ?? ""}
                      artworkColors={{
                        bg: latestReleaseArtworkColor,
                        main: latestReleaseArtworkColor,
                      }}
                      containerClassName="contain-content min-[415px]:[--artwork-override-width:165px] min-[1000px]:[--artwork-override-width:calc(165px*var(--aspect-ratio))] min-[1000px]:[--artwork-override-height:165px]"
                      imageSrcSet={latestReleaseSrcSet}
                      sizes="(max-width:1319px) 296px,(min-width:1320px) and (max-width:1679px) 316px,316px"
                      title={latestRelease?.attributes.name ?? ""}
                      variant="cover"
                    />
                  </div>

                  {latestRelease && (
                    <div
                      onClick={() =>
                        router.push(
                          albumRoute(
                            latestRelease.attributes.url,
                            latestRelease.id,
                          ),
                        )
                      }
                      className="media-card-interaction rounded-[inherit] size-full opacity-(--scrimOpacity,0) absolute top-0 transition-(--global-transition) z-[calc(var(--z-default)+1)]"
                    >
                      <CardPlayButton
                        ariaLabel={`Play ${latestRelease.attributes.name}`}
                        variant="cover"
                        onPlay={() => {
                          void playCatalogResource("albums", latestRelease.id);
                        }}
                      />
                      <CardContextMenu
                        id={`artist-latest-release-${latestRelease.id}`}
                        context={{
                          kind: "collection",
                          resourceId: latestRelease.id,
                          resourceType: "albums",
                          sourceOrigin: "catalog",
                          title: latestRelease.attributes.name,
                          subtitle: artistName,
                          artworkUrl: latestReleaseArtwork?.url,
                          href: albumRoute(
                            latestRelease.attributes.url,
                            latestRelease.id,
                          ),
                          userId,
                          songIds: latestReleaseTracks.map((track) => track.id),
                          trackSources: toTrackSources(latestReleaseTracks),
                          inLibrary: false,
                        }}
                      />
                    </div>
                  )}
                </div>

                <ul className="whitespace-normal ms-5 me-5">
                  {latestReleaseDate && (
                    <li className="text-(--systemSecondary) [font:var(--subhead-emphasized)] mb-1.5">
                      {latestReleaseDate}
                    </li>
                  )}

                  <li className="items-center flex">
                    <Link
                      className="[--badgeSize:calc(var(--explicitBadgeWidth,0px)+var(--favoriteBadgeWidth,0px))] text-(--systemPrimary) [font:var(--title-3-tall)] me-1 line-clamp-2 [--explicitBadgeWidth:12px]"
                      href={albumRoute(
                        latestRelease.attributes.url,
                        latestRelease.id,
                      )}
                    >
                      {latestRelease.attributes.name}
                    </Link>

                    {latestReleaseIsExplicit && (
                      <span
                        aria-label="Explicit"
                        className="mt-0.5 [--explicitBadgeSize:11px]"
                      >
                        <ExplicitBadgeIcon />
                      </span>
                    )}
                  </li>

                  {typeof latestReleaseTrackCount === "number" && (
                    <li className="text-(--systemSecondary) line-clamp-2 [font:var(--title-3-tall)]">
                      {latestReleaseTrackCount}{" "}
                      {latestReleaseTrackCount === 1 ? "song" : "songs"}
                    </li>
                  )}

                  <li className="mt-2.25">
                    <div className="flex shrink-0 items-stretch h-7">
                      <AddToLibraryButton
                        resourceType="albums"
                        resourceId={latestRelease.id}
                        title={latestRelease.attributes.name}
                        subtitle={artistName}
                        artworkUrl={latestReleaseArtwork?.url ?? ""}
                        sourceOrigin="catalog"
                        songIds={latestReleaseTracks.map((track) => track.id)}
                        trackSources={toTrackSources(latestReleaseTracks)}
                        variant="label"
                      />
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {songs.length > 0 && (
            <TrackLockupShelf
              items={topSongPreview}
              layout="TrackLockupsShelfNarrow"
              moreHref={artistTopSongsRoute(slug, artistId)}
              queue={songs}
              title="Top Songs"
            />
          )}

          {shouldShowMusicEmptyState && (
            <div className="text-(--systemSecondary) block max-w-full p-[64px_var(--bodyGutter)_76px] relative text-center w-full">
              <h2 className="block [font:var(--headline-emphasized)] mb-1.5 relative">
                No music available yet
              </h2>

              <p className="block [font:var(--body-tall)] mx-auto max-w-105 relative">
                This artist hasn&apos;t released any music or appeared on any
                collaborations yet.
              </p>
            </div>
          )}
        </div>
      )}

      {albumCards.length > 0 && (
        <MediaShelf
          shelfId="artist-albums"
          title="Albums"
          displayKind="MusicCoverShelf"
          items={albumCards}
          onSelect={
            albumSections.albums.albums.length > HOME_SHELF_PREVIEW_LIMIT
              ? () => void handleSelectAlbumSection("albums")
              : undefined
          }
        />
      )}

      <CatalogMusicVideosShelf resourceType="artists" resourceId={artistId} />

      {singleAndEpCards.length > 0 && (
        <MediaShelf
          shelfId="artist-singles-and-eps"
          title="Singles & EPs"
          displayKind="MusicCoverShelf"
          items={singleAndEpCards}
          onSelect={
            albumSections.singlesAndEps.albums.length > HOME_SHELF_PREVIEW_LIMIT
              ? () => void handleSelectAlbumSection("singlesAndEps")
              : undefined
          }
        />
      )}

      {appearsOnCards.length > 0 && (
        <MediaShelf
          shelfId="artist-appears-on"
          title="Appears On"
          displayKind="MusicCoverShelf"
          items={appearsOnCards}
          onSelect={
            albumSections.appearsOn.albums.length > HOME_SHELF_PREVIEW_LIMIT
              ? () => void handleSelectAlbumSection("appearsOn")
              : undefined
          }
        />
      )}

      <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-3 bg-(--opaqueShelfBG)">
        <div className="in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
          <div className="pt-4 w-full"></div>
        </div>
      </div>

      {(artistBiography ||
        artistOrigin ||
        artistBirthDate ||
        artistGenres.length > 0) && (
        <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-3 bg-(--opaqueShelfBG)">
          <div className="in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
            <div className="m-[0_var(--bodyGutter)_13px] items-center flex justify-end">
              <div className="flex-1">
                <h2 className="text-(--header-title-color,var(--systemPrimary,#000)) inline-block [font:var(--header-title-font,var(--title-2-emphasized))]">
                  <span dir="auto">About {artistName}</span>
                </h2>
              </div>
            </div>

            <div className="overflow-hidden pb-8 pt-3.25 relative px-(--bodyGutter) z-(--z-default)">
              <div className="min-[484px]:gap-x-5 min-[484px]:grid min-[484px]:grid-cols-[3fr_1fr] min-[1260px]:grid-cols-[3fr_2fr] min-[1580px]:grid-cols-[3fr_3fr]">
                <div>
                  {artistBiography && (
                    <p className="mb-5 whitespace-pre-wrap [font:var(--body-tall)]">
                      {artistBiography}
                    </p>
                  )}
                  <dl>
                    {artistOrigin && (
                      <>
                        <dt className="text-(--systemSecondary) [font:var(--subhead)] mb-px mt-0.75">
                          From
                        </dt>
                        <dd className="[font:var(--body-tall)]">
                          {artistOrigin}
                        </dd>
                      </>
                    )}
                    {artistBirthDate && (
                      <>
                        <dt className="text-(--systemSecondary) [font:var(--subhead)] mb-px mt-0.75">
                          Born
                        </dt>
                        <dd className="[font:var(--body-tall)]">
                          {formatReleaseDate(artistBirthDate, "long")}
                        </dd>
                      </>
                    )}
                    {artistGenres.length > 0 && (
                      <>
                        <dt className="text-(--systemSecondary) [font:var(--subhead)] mb-px mt-0.75">
                          Genre
                        </dt>
                        <dd className="[font:var(--body-tall)]">
                          {artistGenres.join(", ")}
                        </dd>
                      </>
                    )}
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {similarArtistCards.length > 0 && (
        <MediaShelf
          shelfId="artist-similar-artists"
          title="Similar Artists"
          displayKind="MusicCircleCoverShelf"
          contentType="artist"
          containerClassName="bg-(--opaqueShelfBG)"
          items={similarArtistCards.slice(
            0,
            SIMILAR_ARTIST_SHELF_PREVIEW_LIMIT,
          )}
          onSelect={
            similarArtistCards.length > SIMILAR_ARTIST_SHELF_PREVIEW_LIMIT
              ? () => void handleSelectSimilarArtists()
              : undefined
          }
        />
      )}
    </div>
  );
}
