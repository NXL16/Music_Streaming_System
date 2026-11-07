"use client";

import MediaLockupGridShelf from "@/components/media/media-lockup-grid-shelf";
import MediaShelf from "@/components/media/media-shelf";
import { ShelfDetailView } from "@/components/media/shelf-detail-view";
import SearchResultsMobile from "@/components/search/search-results-mobile";
import { TrackLockupShelf } from "@/components/songs/track-lockup-shelf";
import { SongTable } from "@/components/songs/song-table";
import { COMPACT_MUSIC_VIDEO_GRID_STYLE } from "@/components/music-videos/music-video-grid-style";
import CatalogPageLoading from "@/components/loading/catalog-page-loading";
import { RequestErrorState } from "@/components/states/request-error-state";
import type { MediaCardProps } from "@/components/media/media-card.types";
import type { SearchResults as SearchResultsData } from "@/lib/catalog/search.mapper";
import { useAppScrollToTop } from "@/lib/layout/use-app-scroll-to-top";
import { useMediaQuery } from "@/hooks/use-media-query";
import { CATALOG_SEARCH_TOP_RESULTS_PREVIEW_LIMIT } from "@musical/shared-constants";
import type { CatalogSearchShelfType } from "@/lib/catalog/catalog.api";
import { recordCatalogSearchSelection } from "@/lib/catalog/search-click-tracking";
import { usePlayerStore } from "@/lib/player/use-player-store";
import type { PlayerSong } from "@/lib/player/use-player-store";

type CardDetailShelfType = Exclude<CatalogSearchShelfType, "songs">;

const EXPANDABLE_SHELF_DETAILS: Record<
  CardDetailShelfType,
  { title: string; items: (results: SearchResultsData) => MediaCardProps[] }
> = {
  artists: { title: "Artists", items: (results) => results.artists },
  albums: { title: "Albums", items: (results) => results.albums },
  playlists: { title: "Playlists", items: (results) => results.playlists },
  "music-videos": {
    title: "Music Videos",
    items: (results) => results.musicVideos,
  },
};

export type SearchResultsProps = {
  term: string;
  results: SearchResultsData;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  isTopResultsExpanded: boolean;
  onExpandTopResults: () => void;
  onCollapseTopResults: () => void;
  expandedResults: SearchResultsData;
  expandedLoading: boolean;
  expandedError: string | null;
  onRetryExpanded: () => void;
  shelfResults: SearchResultsData;
  shelfLoading: boolean;
  shelfError: string | null;
  expandedShelfType: CatalogSearchShelfType | null;
  expandedShelfResults: SearchResultsData;
  expandedShelfLoading: boolean;
  expandedShelfError: string | null;
  expandedSongShelfSongs: PlayerSong[];
  expandedSongShelfHasMore: boolean;
  expandedSongShelfLoadingMore: boolean;
  expandedSongShelfError: string | null;
  onExpandShelf: (type: CatalogSearchShelfType) => void;
  onCollapseShelf: () => void;
  onRetryExpandedShelf: () => void;
  onLoadMoreExpandedSongs: () => void;
};

export default function SearchResults({
  term,
  results,
  loading,
  error,
  onRetry,
  isTopResultsExpanded,
  onExpandTopResults,
  onCollapseTopResults,
  expandedResults,
  expandedLoading,
  expandedError,
  onRetryExpanded,
  shelfResults,
  shelfLoading,
  shelfError,
  expandedShelfType,
  expandedShelfResults,
  expandedShelfLoading,
  expandedShelfError,
  expandedSongShelfSongs,
  expandedSongShelfHasMore,
  expandedSongShelfLoadingMore,
  expandedSongShelfError,
  onExpandShelf,
  onCollapseShelf,
  onRetryExpandedShelf,
  onLoadMoreExpandedSongs,
}: SearchResultsProps) {
  const isMobile = useMediaQuery("(max-width: 483px)");
  const setQueue = usePlayerStore((state) => state.setQueue);
  const hasResults = !results.isEmpty || !shelfResults.isEmpty;
  const hasMoreTopResults = results.hasMore;
  const topResultItems = isTopResultsExpanded
    ? [...results.ordered, ...expandedResults.ordered]
    : results.ordered;
  const expandedShelf =
    expandedShelfType && expandedShelfType !== "songs"
      ? EXPANDABLE_SHELF_DETAILS[expandedShelfType]
      : null;

  useAppScrollToTop(
    isTopResultsExpanded
      ? "search-top-results"
      : expandedShelfType
        ? `search-${expandedShelfType}`
        : null,
  );

  if (
    isTopResultsExpanded &&
    !expandedError &&
    expandedLoading &&
    expandedResults.isEmpty
  ) {
    return <CatalogPageLoading />;
  }

  if (isTopResultsExpanded && expandedError) {
    return <RequestErrorState onRetry={onRetryExpanded} />;
  }

  if (isTopResultsExpanded && hasResults) {
    return (
      <MediaLockupGridShelf
        isDetail
        items={topResultItems}
        onBack={onCollapseTopResults}
        title="Top Results"
      />
    );
  }

  if (
    expandedShelfType &&
    expandedShelfType !== "songs" &&
    !expandedShelfError &&
    expandedShelfLoading &&
    expandedShelfResults.isEmpty
  ) {
    return <CatalogPageLoading />;
  }

  if (
    expandedShelfType &&
    expandedShelfType !== "songs" &&
    expandedShelfError
  ) {
    return <RequestErrorState onRetry={onRetryExpandedShelf} />;
  }

  if (expandedShelfType === "songs") {
    if (expandedSongShelfError) {
      return <RequestErrorState onRetry={onLoadMoreExpandedSongs} />;
    }

    return (
      <SongTable
        hasMore={expandedSongShelfHasMore}
        loadingMore={expandedSongShelfLoadingMore}
        onBack={onCollapseShelf}
        onLoadMore={onLoadMoreExpandedSongs}
        onPlaySong={(songId) => {
          recordCatalogSearchSelection("songs", songId);
          const songIndex = expandedSongShelfSongs.findIndex(
            (song) => song.id === songId,
          );
          if (songIndex >= 0) setQueue(expandedSongShelfSongs, songIndex);
        }}
        songs={expandedSongShelfSongs}
        title="Songs"
      />
    );
  }

  if (expandedShelf) {
    return (
      <ShelfDetailView
        onBack={onCollapseShelf}
        shelf={{
          title: expandedShelf.title,
          items: [
            ...expandedShelf.items(shelfResults),
            ...expandedShelf.items(expandedShelfResults),
          ],
        }}
      />
    );
  }

  if (error || shelfError) {
    return <RequestErrorState onRetry={onRetry} />;
  }

  if (!hasResults && (loading || shelfLoading)) {
    return null;
  }

  if (!hasResults) {
    return (
      <div className="flex min-h-[calc(100dvh-100px)] items-center justify-center px-(--bodyGutter) text-center">
        <p className="text-(--systemSecondary,#a1a1a6)">
          No results found for “{term}”.
        </p>
      </div>
    );
  }

  if (isMobile) {
    return (
      <SearchResultsMobile results={results} shelfResults={shelfResults} />
    );
  }

  return (
    <>
      {results.ordered.length > 0 && (
        <MediaLockupGridShelf
          items={results.ordered.slice(
            0,
            CATALOG_SEARCH_TOP_RESULTS_PREVIEW_LIMIT,
          )}
          title="Top Results"
          onTitleClick={hasMoreTopResults ? onExpandTopResults : undefined}
        />
      )}

      {shelfResults.artists.length > 0 && (
        <MediaShelf
          contentType="artist"
          displayKind="MusicCircleCoverShelf"
          items={shelfResults.artists}
          onTitleClick={
            shelfResults.shelfHasMore.artists
              ? () => onExpandShelf("artists")
              : undefined
          }
          title="Artists"
        />
      )}

      {shelfResults.albums.length > 0 && (
        <MediaShelf
          displayKind="MusicCoverShelf"
          items={shelfResults.albums}
          onTitleClick={
            shelfResults.shelfHasMore.albums
              ? () => onExpandShelf("albums")
              : undefined
          }
          title="Albums"
        />
      )}

      {shelfResults.trackSongs.length > 0 && (
        <TrackLockupShelf
          items={shelfResults.trackSongs}
          onMore={
            shelfResults.shelfHasMore.songs
              ? () => onExpandShelf("songs")
              : undefined
          }
          queue={shelfResults.trackSongs}
          onSongOpen={(song) => recordCatalogSearchSelection("songs", song.id)}
          secondaryMetadata="primary-artists"
          title="Songs"
        />
      )}

      {shelfResults.playlists.length > 0 && (
        <MediaShelf
          displayKind="MusicCoverShelf"
          items={shelfResults.playlists}
          onTitleClick={
            shelfResults.shelfHasMore.playlists
              ? () => onExpandShelf("playlists")
              : undefined
          }
          title="Playlists"
        />
      )}

      {shelfResults.musicVideos.length > 0 && (
        <MediaShelf
          displayKind="MusicVideoShelf"
          gridStyle={COMPACT_MUSIC_VIDEO_GRID_STYLE}
          items={shelfResults.musicVideos}
          onTitleClick={
            shelfResults.shelfHasMore["music-videos"]
              ? () => onExpandShelf("music-videos")
              : undefined
          }
          title="Music Videos"
        />
      )}

      {loading && hasResults && (
        <p aria-live="polite" className="sr-only">
          Updating search results
        </p>
      )}
    </>
  );
}
