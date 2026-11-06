"use client";

import { useCallback } from "react";
import { useCatalogArtist } from "@/lib/catalog/use-catalog-artist";
import { useCatalogArtistSongs } from "@/lib/catalog/use-catalog-artist-songs";
import { getAllCatalogArtistSongs } from "@/lib/catalog/artist-song-pages";
import { usePlayerStore } from "@/lib/player/use-player-store";
import CatalogPageLoading from "../loading/catalog-page-loading";
import { RequestErrorState } from "../states/request-error-state";
import { NotFoundState } from "../states/not-found-state";
import { useMinimumLoadingDuration } from "@/lib/loading/use-minimum-loading-duration";
import { SongTable } from "../songs/song-table";

type ArtistTopSongsPageProps = {
  artistId: string;
};

export function ArtistTopSongsPage({ artistId }: ArtistTopSongsPageProps) {
  return <ArtistTopSongsContent key={artistId} artistId={artistId} />;
}

function ArtistTopSongsContent({ artistId }: ArtistTopSongsPageProps) {
  const {
    artist,
    loading: artistLoading,
    error: artistError,
    errorStatus: artistErrorStatus,
    reload: reloadArtist,
  } = useCatalogArtist(artistId, {
    includeAlbums: false,
    includeSongs: false,
  });
  const {
    songs,
    loading: songsLoading,
    loadingMore,
    error: songsError,
    hasMore,
    loadMore,
    reload: reloadSongs,
  } = useCatalogArtistSongs(artistId);
  const setQueue = usePlayerStore((state) => state.setQueue);
  const showInitialLoading = useMinimumLoadingDuration(
    artistLoading || songsLoading,
  );
  const playArtistSong = useCallback(
    async (songId: string) => {
      try {
        const queue = await getAllCatalogArtistSongs(artistId);
        const index = queue.findIndex((song) => song.id === songId);
        if (index >= 0) setQueue(queue, index);
      } catch {
        // Keep the current queue intact when a playback-page load fails.
      }
    },
    [artistId, setQueue],
  );

  if (showInitialLoading) return <CatalogPageLoading />;
  if (artistErrorStatus === 404) return <NotFoundState />;
  if (artistError || songsError)
    return (
      <RequestErrorState
        onRetry={() => {
          void reloadArtist();
          void reloadSongs();
        }}
      />
    );
  if (!artist) return <NotFoundState />;

  return (
    <SongTable
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={loadMore}
      onPlaySong={playArtistSong}
      songs={songs}
      title={`Top Songs by ${artist.attributes.name}`}
    />
  );
}
