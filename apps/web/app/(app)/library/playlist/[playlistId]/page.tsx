"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PlaylistDetailView, {
  type GenericArtwork,
  type GenericPlaylist,
  type GenericTrack,
} from "@/components/catalog/playlist-detail-view";
import CatalogPageLoading from "@/components/loading/catalog-page-loading";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useFavoriteStore } from "@/lib/favorites/use-favorite-store";
import { useMinimumLoadingDuration } from "@/lib/loading/use-minimum-loading-duration";
import {
  projectSongSummary,
  type SongSummaryProjectionSource,
} from "@/lib/songs/project-song-summary";
import { subscribeLibraryResourcesChanged } from "@/lib/library/library-resources.api";
import {
  PLAYLIST_CHANGED_EVENT,
  type PlaylistChange,
} from "@/lib/playlists/playlist-events";
import { playlistArtworkVariants } from "@/lib/playlists/generated-playlist-cover";
import { getCatalogPlaylist } from "@/lib/catalog/catalog.api";
import { mapCatalogTracks } from "@/lib/catalog/catalog.mapper";
import { getLibraryResources } from "@/lib/library/library-resources.api";
import {
  getUserPlaylist,
  getAllUserPlaylistTracks,
  listUserPlaylistTracks,
} from "@/lib/playlists/user-playlists.api";
import { useInfiniteScrollLoadMore } from "@/lib/pagination/use-infinite-scroll-sentinel";
import {
  appendUniqueById,
  getSafeNextCursor,
} from "@/lib/pagination/cursor-page";
import Loading from "@/app/loading";
import { RequestErrorState } from "@/components/states/request-error-state";
import { NotFoundState } from "@/components/states/not-found-state";
import { getApiErrorStatus } from "@/lib/api/api-error";
import { useCachedQuery } from "@/lib/api/use-cached-query";
import { setCachedQuery } from "@/lib/api/query-cache";

type Track = SongSummaryProjectionSource;

type PlaylistDetail = {
  id: string;
  name: string;
  description?: string;
  artwork?: GenericArtwork;
  artworkUrl?: string;
};

function resolvePlaylistArtwork(
  artwork: GenericArtwork | undefined,
  fallbackArtworkUrl: string | undefined,
  fallbackBgColor: string,
): GenericArtwork {
  if (artwork?.url || !fallbackArtworkUrl) {
    return artwork ?? { bgColor: fallbackBgColor };
  }

  return {
    ...artwork,
    url: fallbackArtworkUrl,
    bgColor: artwork?.bgColor ?? fallbackBgColor,
  };
}

interface PageProps {
  params: Promise<{ playlistId: string }>;
}

type LibraryPlaylistSnapshot = {
  playlist: PlaylistDetail | null;
  catalogPlaylist: GenericPlaylist | null;
  tracks: Track[];
  nextCursor: string;
  seenCursors: Set<string>;
};

async function loadLibraryPlaylist(
  playlistId: string,
  signal: AbortSignal,
): Promise<LibraryPlaylistSnapshot | null> {
  const library = await getLibraryResources();
  signal.throwIfAborted();
  if (
    !library.some(
      (resource) =>
        resource.resourceType === "playlists" &&
        resource.resourceId === playlistId,
    )
  )
    return null;
  // Catalog owns public IDs even when a seeded user playlist has the same ID.
  try {
    const catalog = await getCatalogPlaylist(playlistId, signal);
    const reference = catalog.data.find(
      (resource) => resource.type === "playlists",
    );
    const resource = catalog.resources.playlists[reference?.id ?? playlistId];
    if (resource) {
      const attributes = resource.attributes;
      return {
        playlist: null,
        catalogPlaylist: {
          id: playlistId,
          title: attributes.name,
          curatorName: attributes.curatorName || "",
          description:
            attributes.descriptionStandard || attributes.descriptionShort || "",
          artwork: attributes.artwork,
          sourcePlaylistHref:
            "/library/playlist/" + encodeURIComponent(playlistId),
          playlistKind: "catalog",
          isLibraryView: true,
          tracks: mapCatalogTracks(catalog),
        },
        tracks: [],
        nextCursor: "",
        seenCursors: new Set(),
      };
    }
  } catch (error) {
    if (getApiErrorStatus(error) !== 404) throw error;
  }
  const [playlist, firstPage] = await Promise.all([
    getUserPlaylist(playlistId),
    listUserPlaylistTracks(playlistId),
  ]);
  signal.throwIfAborted();
  const seenCursors = new Set<string>();
  return {
    playlist,
    catalogPlaylist: null,
    tracks: firstPage.songs ?? [],
    nextCursor: getSafeNextCursor(firstPage, seenCursors),
    seenCursors,
  };
}

export default function LibraryPlaylistDetailPage({ params }: PageProps) {
  const { playlistId } = use(params);
  const userId = useAuthStore((state) => state.user?.userId);
  return (
    <LibraryPlaylistContent
      key={playlistId + ":" + (userId ?? "guest")}
      playlistId={playlistId}
    />
  );
}

function LibraryPlaylistContent({ playlistId }: { playlistId: string }) {
  const isFavorites = playlistId === "favorite" || playlistId === "favorites";
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const favoriteSongs = useFavoriteStore((state) => state.songs);
  const favoriteCollection = useFavoriteStore((state) => state.collection);
  const favoriteLoading = useFavoriteStore((state) => state.loading);
  const favoriteLoaded = useFavoriteStore((state) => state.loaded);
  const hydrateFavorites = useFavoriteStore((state) => state.hydrate);
  const cacheKey =
    "library:playlist-detail:" +
    encodeURIComponent(playlistId) +
    ":" +
    (user?.userId ?? "guest");
  const load = useCallback(
    (signal: AbortSignal) => loadLibraryPlaylist(playlistId, signal),
    [playlistId],
  );
  const {
    data,
    loading,
    error,
    errorStatus,
    reload: reloadResource,
  } = useCachedQuery(cacheKey, load, "Could not load playlist.", {
    enabled: !isFavorites && Boolean(user),
  });
  const [pagination, setPagination] = useState<{
    source: LibraryPlaylistSnapshot;
    value: LibraryPlaylistSnapshot;
  } | null>(null);
  const current = data && pagination?.source === data ? pagination.value : data;
  const playlist = current?.playlist ?? null;
  const catalogPlaylist = current?.catalogPlaylist ?? null;
  const tracks = current?.tracks ?? [];
  const nextCursor = current?.nextCursor ?? "";
  const [loadingMore, setLoadingMore] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  const showLoading = useMinimumLoadingDuration(
    (loading && !current) ||
      (isFavorites && (!favoriteLoaded || favoriteLoading)),
  );

  useEffect(() => {
    if (isFavorites) void hydrateFavorites();
  }, [isFavorites, hydrateFavorites]);
  useEffect(
    () => () => {
      activeRequest.current?.abort();
    },
    [],
  );

  const reload = useCallback(() => {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setLoadingMore(false);
    return reloadResource();
  }, [reloadResource]);

  const loadMore = useCallback(async () => {
    if (
      !data ||
      loading ||
      !current?.nextCursor ||
      isFavorites ||
      current.catalogPlaylist ||
      activeRequest.current
    )
      return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoadingMore(true);
    try {
      const page = await listUserPlaylistTracks(playlistId, {
        cursor: current.nextCursor,
      });
      if (controller.signal.aborted) return;
      const seenCursors = new Set(current.seenCursors);
      const next = {
        ...current,
        tracks: appendUniqueById(current.tracks, page.songs),
        nextCursor: getSafeNextCursor(page, seenCursors),
        seenCursors,
      };
      setCachedQuery(cacheKey, next);
      setPagination({ source: data, value: next });
    } catch {
      return;
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }, [cacheKey, current, data, isFavorites, loading, playlistId]);

  const { sentinelRef: loadMoreSentinelRef, showLoadingMore } =
    useInfiniteScrollLoadMore({
      enabled:
        !loading && !isFavorites && !catalogPlaylist && Boolean(nextCursor),
      loading: loadingMore,
      onLoadMore: loadMore,
    });

  useEffect(() => {
    if (isFavorites) return;
    return subscribeLibraryResourcesChanged((change) => {
      if (
        change?.resourceType !== "playlists" ||
        change.resourceId !== playlistId
      )
        return;
      if (
        change.operation === "pending-remove" ||
        change.operation === "remove"
      ) {
        activeRequest.current?.abort();
        activeRequest.current = null;
        setLoadingMore(false);
        router.replace("/home");
      } else if (change.operation !== "pin" && change.operation !== "unpin")
        void reload();
    });
  }, [isFavorites, playlistId, reload, router]);

  useEffect(() => {
    if (isFavorites) return;
    const changed = (event: Event) => {
      if (
        (event as CustomEvent<PlaylistChange>).detail?.playlistId === playlistId
      )
        void reload();
    };
    window.addEventListener(PLAYLIST_CHANGED_EVENT, changed);
    return () => window.removeEventListener(PLAYLIST_CHANGED_EVENT, changed);
  }, [isFavorites, playlistId, reload]);

  if (showLoading) return <CatalogPageLoading />;
  if (!isFavorites && (errorStatus === 404 || (!data && !error)))
    return <NotFoundState />;
  if (error) return <RequestErrorState onRetry={() => void reload()} />;

  const formattedTracks: GenericTrack[] = isFavorites
    ? favoriteSongs.map(projectSongSummary)
    : catalogPlaylist
      ? catalogPlaylist.tracks
      : tracks.map(projectSongSummary);
  const playlistArtwork = isFavorites
    ? ((favoriteCollection?.artwork as GenericArtwork | undefined) ?? {
        bgColor: "2c2c2e",
      })
    : resolvePlaylistArtwork(
        playlist?.artworkUrl
          ? {
              url: playlist.artworkUrl,
              variants: playlistArtworkVariants(playlist.artworkUrl),
            }
          : playlist?.artwork,
        formattedTracks[0]?.artworkUrl,
        "2c2c2e",
      );

  const formattedPlaylist: GenericPlaylist = catalogPlaylist ?? {
    id: isFavorites ? "favorite" : playlist?.id || playlistId,
    title: isFavorites
      ? favoriteCollection?.title || "Favourite Songs"
      : playlist?.name || "Playlist",
    curatorName: user?.displayName || "You",
    sourcePlaylistHref: isFavorites
      ? undefined
      : `/library/playlist/${encodeURIComponent(playlistId)}`,
    playlistKind: isFavorites ? "favorite" : "user",
    isLibraryView: true,
    artwork: playlistArtwork,
    tracks: formattedTracks,
  };

  return (
    <PlaylistDetailView
      playlist={formattedPlaylist}
      showMetadata={!showLoadingMore}
      resolvePlaybackTracks={
        isFavorites
          ? undefined
          : catalogPlaylist
            ? async () => mapCatalogTracks(await getCatalogPlaylist(playlistId))
            : async () =>
                (await getAllUserPlaylistTracks(playlistId)).map(
                  projectSongSummary,
                )
      }
      afterTracks={
        !isFavorites && !catalogPlaylist && (showLoadingMore || nextCursor) ? (
          <>
            {showLoadingMore && <Loading fullScreen={false} size={26} />}
            {nextCursor && (
              <div
                aria-hidden="true"
                ref={loadMoreSentinelRef}
                style={{ height: 1 }}
              />
            )}
          </>
        ) : null
      }
    />
  );
}
