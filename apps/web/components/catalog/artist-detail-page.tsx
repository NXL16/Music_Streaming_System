"use client";

import {
  CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { usePlayerStore } from "@/lib/player/use-player-store";
import { albumRoute } from "@/lib/catalog/album-route";
import { artistRoute, artistTopSongsRoute } from "@/lib/catalog/artist-route";
import { createAndPlayArtistPlayStation } from "@/lib/recommendations/artist-station";
import Link from "next/link";
import CardContextMenu from "../media/common/card-context-menu";
import CardPlayButton from "../media/common/card-play-button";
import CatalogPageLoading from "../loading/catalog-page-loading";
import { useMinimumLoadingDuration } from "@/lib/loading/use-minimum-loading-duration";
import { ExplicitBadgeIcon } from "../icons/explicit-badge-icon";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useFavoriteStore } from "@/lib/favorites/use-favorite-store";
import { AddSongToLibraryButton } from "../songs/add-song-to-library-button";
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
import {
  formatReleaseDate,
  formatReleaseYear,
} from "@/lib/format/release-date";
import type { CatalogArtistAlbumSectionData } from "@/lib/catalog/use-catalog-artist";
import { CatalogMusicVideosShelf } from "../music-videos/catalog-music-videos-shelf";
import { FavoriteActionButton } from "../songs/favorite-action-button";
import { PlaybackWaveform } from "../songs/playback-waveform";
import {
  getArtistFollow,
  setArtistFollow,
} from "@/lib/favorites/artist-follow.api";
import { subscribeArtistFollowChanges } from "@/lib/favorites/artist-follow-events";

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
  const { artist, albums, albumSections, songs, loading, loadAlbumSection } =
    useCatalogArtist(artistId);
  const showLoading = useMinimumLoadingDuration(loading);
  const setQueue = usePlayerStore((state) => state.setQueue);
  const currentSong = usePlayerStore((state) => state.currentSong);
  const playing = usePlayerStore((state) => state.playing);
  const togglePlayback = usePlayerStore((state) => state.togglePlayback);
  const userId = useAuthStore((state) => state.user?.userId);
  const favoriteSongIds = useFavoriteStore((state) => state.songIds);
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
  const [allSimilarArtistCards, setAllSimilarArtistCards] = useState<{
    artistId: string;
    cards: ReturnType<typeof mapCatalogArtists>;
  } | null>(null);
  const [loadingSimilarArtistId, setLoadingSimilarArtistId] = useState<
    string | null
  >(null);
  const topSongsDragRef = useRef<
    { startX: number; scrollLeft: number } | undefined
  >(undefined);
  const topSongsDraggedRef = useRef(false);
  const topSongsDragElementRef = useRef<HTMLUListElement | null>(null);
  const topSongsPendingScrollRef = useRef<number | undefined>(undefined);
  const topSongsDragFrameRef = useRef<number | undefined>(undefined);
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
  useEffect(
    () => () => {
      if (topSongsDragFrameRef.current !== undefined) {
        cancelAnimationFrame(topSongsDragFrameRef.current);
      }
    },
    [],
  );
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
        setSelectedAlbumSection(section);
        return;
      }

      try {
        setSelectedAlbumSection(section);
        setLoadingAlbumSection(section);
        const sectionAlbums = await loadAlbumSection(section);
        setLoadedAlbumSections((current) => ({
          ...current,
          [section]: sectionAlbums,
        }));
      } catch {
        setSelectedAlbumSection(null);
      } finally {
        setLoadingAlbumSection((current) =>
          current === section ? null : current,
        );
      }
    },
    [loadAlbumSection, loadedAlbumSections],
  );

  const handleSelectSimilarArtists = useCallback(async () => {
    if (currentSimilarArtistCards) {
      setSelectedSimilarArtistId(artistId);
      return;
    }
    if (loadingSimilarArtists) return;

    try {
      setSelectedSimilarArtistId(artistId);
      setLoadingSimilarArtistId(artistId);
      const catalog = await getCatalogSimilarArtists(artistId, { limit: 500 });
      setAllSimilarArtistCards({
        artistId,
        cards: mapCatalogArtists(catalog),
      });
    } catch {
      setSelectedSimilarArtistId((current) =>
        current === artistId ? null : current,
      );
    } finally {
      setLoadingSimilarArtistId((current) =>
        current === artistId ? null : current,
      );
    }
  }, [artistId, currentSimilarArtistCards, loadingSimilarArtists]);

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

  useAppScrollToTop(
    selectedAlbumSection ?? (selectedSimilarArtists ? "similar-artists" : null),
  );

  if (showLoading) {
    return <CatalogPageLoading />;
  }

  if (loadingAlbumSection || loadingSimilarArtists) {
    return <ShelfDetailLoading />;
  }

  if (selectedAlbumShelf) {
    return (
      <ShelfDetailView
        shelf={selectedAlbumShelf}
        onBack={() => setSelectedAlbumSection(null)}
      />
    );
  }

  if (selectedSimilarArtists && currentSimilarArtistCards) {
    return (
      <ShelfDetailView
        shelf={{ title: "Similar Artists", items: currentSimilarArtistCards }}
        onBack={() => setSelectedSimilarArtistId(null)}
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
    <>
      <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) min-[484px]:pt-3">
        <div className="in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
          <div
            className={`${videoSrc ? "overflow-hidden relative h-[calc((100vw-var(--web-navigation-width))/2.28571)] min-h-81 min-[1000px]:max-h-[calc(1680px/var(--fixed-artwork-ratio-lg,2.5714285714))] min-[1000px]:relative min-[1000px]:z-(--z-default) min-[1260px]:h-[calc((100vw-var(--web-navigation-width))/2.57143)] min-[1260px]:max-h-[653.33333px] before:bg-transparent before:bg-none before:bg-top before:bg-no-repeat before:bg-cover before:content-[''] before:h-[calc((100vw-var(--sidebar-width-expanded,260px))/var(--fixed-artwork-ratio-lg,2.2857142857))] before:max-h-[calc(1680px/var(--fixed-artwork-ratio-sm,2.5714285714))] before:max-w-[1680px] before:absolute before:w-[calc(100vw-var(--sidebar-width-expanded,260px))] before:z-(--z-default) min-[1000px]:before:bg-(--background-color) min-[1000px]:before:bg-(image:--background-image-xs) min-[1260px]:before:bg-(image:--background-image) min-[1260px]:before:h-[calc((100vw-var(--sidebar-width-expanded,260px))/var(--fixed-artwork-ratio-sm,2.5714285714))] after:bg-[linear-gradient(0deg,rgba(0,0,0,.36)_0,rgba(0,0,0,.25)_36%,transparent)] after:bottom-0 after:content-[''] after:block after:left-0 after:pointer-events-none after:absolute after:right-0 after:top-auto after:z-(--z-default) after:h-37.5" : "h-(--artistHeaderHeightXs,324px) overflow-hidden relative min-[1000px]:h-96.5 before:bg-transparent before:bg-none before:bg-top before:bg-no-repeat before:bg-cover before:content-[''] before:h-[calc((100vw-var(--sidebar-width-expanded,260px))/var(--fixed-artwork-ratio-lg,2.2857142857))] before:max-h-[calc(1680px/var(--fixed-artwork-ratio-sm,2.5714285714))] before:max-w-[1680px] before:absolute before:w-[calc(100vw-var(--sidebar-width-expanded,260px))] before:z-(--z-default) min-[1000px]:before:bg-(--background-color) min-[1000px]:before:bg-(image:--background-image-xs) min-[1260px]:before:bg-(image:--background-image) min-[1260px]:before:h-[calc((100vw-var(--sidebar-width-expanded,260px))/var(--fixed-artwork-ratio-sm,2.5714285714))] after:bg-[linear-gradient(0deg,rgba(0,0,0,.36)_0,rgba(0,0,0,.25)_36%,transparent)] after:bottom-0 after:content-[''] after:block after:left-0 after:pointer-events-none after:absolute after:right-0 after:top-auto after:z-(--z-default) after:h-36.5"}`}
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

      <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-3">
        <div className="in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
          <div className="pt-4 w-full"></div>
        </div>
      </div>

      <div className="max-[999px]:[display:unset] flex pt-3 in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
        <div>
          <div className="flex justify-end items-center m-[0_var(--bodyGutter)_13px]">
            <div className="flex-1">
              <h2 className="text-(--header-title-color,var(--systemPrimary,#000)) inline-block [font:var(--header-title-font,var(--title-2-emphasized))]">
                <span dir="auto">Latest Release</span>
              </h2>
            </div>
          </div>

          <div>
            <div className="[--iconCircleFillBGOverride:transparent] items-center flex justify-start pb-8 ms-(--bodyGutter) w-[calc(100%-var(--bodyGutter))] min-[1000px]:w-[calc(50vw-var(--web-navigation-width,0)*2/4-50px)] min-[1260px]:w-[calc(40vw-var(--web-navigation-width,0)*2/5-44px)] min-[1580px]:w-[calc(25vw-var(--web-navigation-width,0)*2/8-35px)]">
              <div className="rounded-[7px] shadow-[0_1px_1px_rgba(0,0,0,0.01),0_2px_2px_rgba(0,0,0,0.01),0_4px_4px_rgba(0,0,0,0.02),0_8px_8px_rgba(0,0,0,0.03),0_14px_14px_rgba(0,0,0,0.03)] cursor-pointer relative [--scrimOpacity:0] hover:[--scrimOpacity:1]">
                <div className="rounded-[7px] after:content-[''] after:absolute after:inset-0 after:rounded-[inherit] after:bg-[#333333]/30 after:opacity-(--scrimOpacity,0) after:transition-opacity after:duration-100 after:ease-in after:z-1">
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

              {latestRelease && (
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
              )}
            </div>
          </div>
        </div>

        <div className="min-[1000px]:flex-1 min-[1000px]:-ms-5 min-[1000px]:min-w-0">
          <div className="items-center flex justify-end m-[0_var(--bodyGutter)_13px]">
            <div className="flex-1">
              <h2 className="text-(--header-title-color,var(--systemPrimary,#000)) inline-block [font:var(--header-title-font,var(--title-2-emphasized))]">
                <Link
                  className="flex items-center gap-1 text-start hover:no-underline"
                  href={artistTopSongsRoute(slug, artistId)}
                >
                  <span>Top Songs</span>

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
                } as CSSProperties
              }
            >
              <div className="box-content -me-0.5 -ms-0.5 overflow-visible pe-0.5 ps-0.5 w-full">
                <ul
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
                          className="group items-center text-(--systemPrimary) grid grid-cols-[auto_auto_1fr_auto] pb-[7.5px] pt-[7.5px] relative w-full pe-(--trackLockupPaddingInlineEnd,14px) cursor-pointer after:[border-top:var(--keyline-border-style)] after:content-[''] after:inset-e-0 after:inset-s-0 after:absolute after:top-0 after:z-(--z-default)"
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
                </ul>
              </div>
            </section>
          </div>
        </div>
      </div>

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
    </>
  );
}
