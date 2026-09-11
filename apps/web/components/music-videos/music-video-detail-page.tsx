"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatReleaseDate } from "@/lib/format/release-date";
import { useCatalogSong } from "@/lib/catalog/use-catalog-song";
import { useCatalogMusicVideo } from "@/lib/catalog/use-catalog-music-video";
import {
  getCatalogArtistMusicVideoPage,
  getCatalogRelatedMusicVideos,
} from "@/lib/catalog/music-videos.api";
import { useAsyncResource } from "@/lib/api/use-async-resource";
import { mapCatalogMusicVideoCards } from "@/lib/catalog/music-video-cards";
import { ArtistLinks } from "@/components/media/artist-links";
import { ExplicitBadgeIcon } from "@/components/icons/explicit-badge-icon";
import { projectLinkedArtists } from "@/lib/media/project-linked-artists";
import CardArtwork from "../media/common/card-artwork";
import MediaShelf from "../media/media-shelf";
import type { MediaCardProps } from "../media/media-card.types";
import { ShelfDetailView } from "../media/shelf-detail-view";
import { ARTIST_MUSIC_VIDEO_GRID_STYLE } from "./catalog-music-videos-shelf";
import { playCatalogMusicVideo } from "@/lib/catalog/play-catalog-music-video";
import CatalogPageLoading from "../loading/catalog-page-loading";
import { useMinimumLoadingDuration } from "@/lib/loading/use-minimum-loading-duration";
import { useFavoriteStore } from "@/lib/favorites/use-favorite-store";
import { preloadAmbientHlsRuntime } from "@/components/custom-elements/ambient-hls-player";

type MusicVideoDetailPageProps = { songVideoId: string };

const MORE_BY_ARTIST_PREVIEW_LIMIT = 10;
const MORE_BY_PAGE_SIZE = MORE_BY_ARTIST_PREVIEW_LIMIT + 1;
const YOU_MIGHT_ALSO_LIKE_LIMIT = 10;

export function MusicVideoDetailPage({
  songVideoId,
}: MusicVideoDetailPageProps) {
  const { data: video, loading, error } = useCatalogMusicVideo(songVideoId);
  const showLoading = useMinimumLoadingDuration(loading);
  const releaseTrackId = video?.releaseTrackId ?? "";
  const { song: sourceSong } = useCatalogSong(releaseTrackId);
  const isFavorite = useFavoriteStore((state) =>
    sourceSong ? state.songIds.has(sourceSong.id) : false,
  );
  const hydrateFavorites = useFavoriteStore((state) => state.hydrate);
  useEffect(() => {
    void hydrateFavorites();
  }, [hydrateFavorites]);
  useEffect(() => {
    preloadAmbientHlsRuntime();
  }, []);
  const primaryArtist =
    video?.artists.find((artist) => artist.isPrimary) ?? video?.artists[0];
  const loadMoreByArtist = useCallback(
    (signal?: AbortSignal) =>
      primaryArtist
        ? getCatalogArtistMusicVideoPage(
            primaryArtist.artistId,
            { limit: MORE_BY_PAGE_SIZE },
            signal,
          )
        : Promise.resolve({ videos: [], nextCursor: "" }),
    [primaryArtist],
  );
  const { data: moreByPage } = useAsyncResource(
    loadMoreByArtist,
    "Không thể tải Music Video khác của artist.",
  );
  const loadRelatedVideos = useCallback(
    (signal?: AbortSignal) =>
      getCatalogRelatedMusicVideos(
        songVideoId,
        YOU_MIGHT_ALSO_LIKE_LIMIT,
        signal,
      ),
    [songVideoId],
  );
  const { data: relatedVideos } = useAsyncResource(
    loadRelatedVideos,
    "Không thể tải Music Video gợi ý.",
  );
  const [selectedShelf, setSelectedShelf] = useState<{
    songVideoId: string;
    title: string;
    items: MediaCardProps[];
    nextCursor: string;
    loadingMore: boolean;
  } | null>(null);
  const moreByVideos = useMemo(
    () => moreByPage?.videos.filter((item) => item.id !== video?.id) ?? [],
    [moreByPage?.videos, video?.id],
  );
  const moreByCards = useMemo(
    () =>
      mapCatalogMusicVideoCards(moreByVideos, {
        artistShelf: true,
      }),
    [moreByVideos],
  );
  const relatedCards = useMemo(
    () =>
      mapCatalogMusicVideoCards(
        relatedVideos?.filter((item) => item.id !== video?.id) ?? [],
        { artistShelf: false },
      ),
    [relatedVideos, video?.id],
  );
  const loadNextMoreByPage = useCallback(async () => {
    if (
      !selectedShelf?.nextCursor ||
      selectedShelf.loadingMore ||
      !primaryArtist
    ) {
      return;
    }
    const { nextCursor } = selectedShelf;
    setSelectedShelf((current) =>
      current ? { ...current, loadingMore: true } : current,
    );
    try {
      const page = await getCatalogArtistMusicVideoPage(
        primaryArtist.artistId,
        {
          limit: MORE_BY_PAGE_SIZE,
          cursor: nextCursor,
        },
      );
      const nextItems = mapCatalogMusicVideoCards(
        page.videos.filter((item) => item.id !== video?.id),
        { artistShelf: true },
      );
      setSelectedShelf((current) => {
        if (!current || current.nextCursor !== nextCursor) return current;
        const ids = new Set(current.items.map((item) => item.id));
        return {
          ...current,
          items: [
            ...current.items,
            ...nextItems.filter((item) => !ids.has(item.id)),
          ],
          nextCursor: page.nextCursor,
          loadingMore: false,
        };
      });
    } catch {
      setSelectedShelf((current) =>
        current ? { ...current, loadingMore: false } : current,
      );
    }
  }, [primaryArtist, selectedShelf, video?.id]);

  if (error) {
    return (
      <main className="mx-(--bodyGutter) pt-8">
        <p className="text-(--systemSecondary)">{error}</p>
      </main>
    );
  }

  if (showLoading) {
    return <CatalogPageLoading />;
  }

  if (!video) {
    return (
      <main className="mx-(--bodyGutter) pt-8">
        <p className="text-(--systemSecondary)">Không tìm thấy Music Video.</p>
      </main>
    );
  }

  const artists = projectLinkedArtists(
    video.artists.map(({ artistId, name, url }) => ({
      id: artistId,
      name,
      url,
    })),
  );
  const releaseDate = formatReleaseDate(
    sourceSong?.releaseDate || video.releaseDate,
    "long",
  );
  const posterUrl = video.posterUrl || video.songArtwork?.url || undefined;
  const artworkProps = {
    title: video.songTitle,
    altText: `${video.songTitle} Music Video`,
    imageSrcSet: video.posterSrcSet || posterUrl || "/assets/artwork/1x1.gif",
    artworkColors: {
      bg: video.songArtwork?.bgColor || "#2c2c2e",
      main: video.songArtwork?.bgColor || "#2c2c2e",
    },
    aspectRatio: "1.7777777777777777",
    sizes: "(max-width: 999px) 100vw, 790px",
    priority: true,
  };
  const albumName = sourceSong?.album || video.albumName;
  const albumHref = sourceSong?.albumUrl;
  const headerIsExplicit =
    (sourceSong?.contentRating || video.contentRating).toLowerCase() ===
    "explicit";
  const detailLine =
    albumName || releaseDate ? (
      <>
        {albumName &&
          (albumHref ? (
            <Link className="hover:underline" href={albumHref}>
              {albumName}
            </Link>
          ) : (
            <span>{albumName}</span>
          ))}
        {albumName && releaseDate && <span> · </span>}
        {releaseDate && <span>{releaseDate}</span>}
      </>
    ) : null;
  const openVideo = () => void playCatalogMusicVideo(video, sourceSong);
  if (selectedShelf?.songVideoId === songVideoId) {
    return (
      <ShelfDetailView
        shelf={selectedShelf}
        onBack={() => setSelectedShelf(null)}
        hasMore={Boolean(selectedShelf.nextCursor)}
        loadingMore={selectedShelf.loadingMore}
        onLoadMore={loadNextMoreByPage}
      />
    );
  }

  return (
    <>
      <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width)">
        <div className="">
          <div className="pb-8 pt-10 px-(--bodyGutter) min-[1000px]:flex min-[1000px]:relative min-[1000px]:z-[calc(var(--z-default)+10)]">
            <div className="items-center flex flex-col min-w-0 w-full min-[1000px]:flex-row">
              <div className="flex justify-center w-full min-[1000px]:[--artwork-override-width:calc(50vw-var(--web-navigation-width,0)*1.5/3-50px)] min-[1000px]:w-[calc(50vw-var(--web-navigation-width,0)*1.5/3-50px)] min-[1000px]:block min-[1260px]:[--artwork-override-width:calc(50vw-var(--web-navigation-width,0)*2/4-50px)] min-[1260px]:w-[calc(50vw-var(--web-navigation-width,0)*2/4-50px)] min-[1580px]:[--artwork-override-width:calc(50vw-var(--web-navigation-width,0)*2.5/5-50px)] min-[1580px]:w-[calc(50vw-var(--web-navigation-width,0)*2.5/5-50px)] min-[1940px]:[--artwork-override-width:790px] min-[1940px]:w-197.5">
                <div className="rounded-[7px] shadow-[0_10px_20px_0_var(--radiosityShadowColor)] relative w-full z-(--radiosity-effect-shadow-z,var(--z-default)) group">
                  <div className="filter-[blur(20px)_saturate(2)] size-full opacity-40 absolute transform-[scale(.88)] origin-[bottom_center] z-(--radiosity-effect-z,var(--z-default)) dark:opacity-30">
                    <CardArtwork variant="cover" {...artworkProps} />
                  </div>

                  <CardArtwork variant="cover" {...artworkProps} />

                  <div className="[--playButtonSize:34px] [--iconCircleFillBGOverride:transparent] bg-(--lockupHoverBGColor) bottom-0 size-full inset-x-0 m-auto opacity-0 absolute top-0 z-1 group-hover:opacity-100 group-hover:[transition:var(--global-transition)]">
                    <button
                      type="button"
                      onClick={openVideo}
                      aria-label={`Play ${video.songTitle}`}
                      className="[--iconCircleFillBG:var(--iconCircleFillBGOverride,var(--systemQuaternary))] [--iconFillArrow:var(--playButtonIconColor,#fff)] rounded-[50%] pointer-events-auto [--nonPlatterIconFill:var(--playButtonIconColor,#fff)] [--playingBarColor:var(--nonPlatterIconFill,#fff)] block leading-0 bottom-0 h-(--playButtonSize) inset-x-0 m-auto absolute top-0 w-(--playButtonSize) z-1 hover:[--iconCircleFillBG:var(--playButtonCircleHoverColor,var(--keyColor,#000))] hover:[--iconFillArrow:var(--playButtonIconHoverColor,#fff)]"
                    >
                      <svg
                        aria-hidden="true"
                        className="inline-block size-(--playButtonSize,30px) rounded-[50%] bg-(--systemStandardThinMaterialSover) backdrop-saturate-180 backdrop-blur-[60px] hover:bg-transparent hover:backdrop-filter-none"
                        data-icon-state="play"
                      >
                        <use href="#play-circle-fill"></use>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-1.5 relative text-ellipsis w-full z-(--z-default) min-[1000px]:mt-5 min-[1000px]:items-start min-[1000px]:flex min-[1000px]:flex-1 min-[1000px]:flex-col min-[1000px]:justify-center min-[1000px]:min-w-50 min-[1000px]:pt-0 min-[1000px]:ps-5">
                <h1 className="[font:var(--large-title-semibold)] leading-1 pt-2 text-ellipsis">
                  <span dir="auto">{video.songTitle}</span>

                  <span className="inline-flex items-center gap-1 ms-1 [--explicitBadgeSize:19px] [--favoriteBadgeSize:14px] [--favoriteBadgeMarginInlineStart:1px] has-[.explicit-wrapper]:ms-[6.5px] max-[999px]:[--explicitBadgeSize:16px]">
                    {headerIsExplicit && (
                      <span className="explicit-wrapper relative top-[0.7px]">
                        <span>
                          <ExplicitBadgeIcon />
                        </span>
                      </span>
                    )}

                    {isFavorite && (
                      <span className="ms-(--favoriteBadgeMarginInlineStart,2px)">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 64 64"
                          width="64"
                          height="64"
                          className="inline-block fill-(--favoriteBadgeColor,var(--keyColor)) size-(--favoriteBadgeSize,9px) align-[2px]"
                        >
                          <path d="M13.559 60.051c1.102.86 2.5.565 4.166-.645l14.218-10.455L46.19 59.406c1.666 1.21 3.037 1.505 4.166.645 1.102-.833 1.344-2.204.672-4.166l-5.618-16.718 14.353-10.32c1.666-1.183 2.338-2.42 1.908-3.764-.43-1.29-1.693-1.935-3.763-1.908l-17.605.108-5.348-16.8C34.308 4.496 33.34 3.5 31.944 3.5c-1.372 0-2.34.995-2.984 2.984L23.61 23.283l-17.605-.108c-2.07-.027-3.333.618-3.763 1.908-.457 1.344.242 2.58 1.909 3.763l14.352 10.321-5.617 16.718c-.672 1.962-.43 3.333.672 4.166Z"></path>
                        </svg>
                      </span>
                    )}
                  </span>
                </h1>

                <p className="text-(--keyColor) [font:var(--large-title)]">
                  <ArtistLinks
                    artists={artists}
                    fallbackText={video.artistName}
                  />
                </p>

                <div className="text-(--systemSecondary) [font:var(--subhead-emphasized)] mt-0.75">
                  {detailLine}
                </div>
                <div className="mt-7"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {primaryArtist && moreByCards.length > 0 && (
        <MediaShelf
          title={`More by ${primaryArtist.name}`}
          displayKind="MusicVideoShelf"
          items={moreByCards.slice(0, MORE_BY_ARTIST_PREVIEW_LIMIT)}
          shelfId={`music-video-more-by-${songVideoId}`}
          gridStyle={ARTIST_MUSIC_VIDEO_GRID_STYLE}
          onSelect={
            moreByCards.length > MORE_BY_ARTIST_PREVIEW_LIMIT ||
            Boolean(moreByPage?.nextCursor)
              ? () =>
                  setSelectedShelf({
                    songVideoId,
                    title: `More by ${primaryArtist.name}`,
                    items: moreByCards,
                    nextCursor: moreByPage?.nextCursor ?? "",
                    loadingMore: false,
                  })
              : undefined
          }
        />
      )}

      {relatedCards.length > 0 && (
        <MediaShelf
          title="You Might Also Like"
          displayKind="MusicVideoShelf"
          items={relatedCards}
          shelfId={`music-video-related-${songVideoId}`}
          gridStyle={ARTIST_MUSIC_VIDEO_GRID_STYLE}
        />
      )}
    </>
  );
}
