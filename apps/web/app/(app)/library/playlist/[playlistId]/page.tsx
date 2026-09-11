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
import {
  getCatalogPlaylist,
  getCatalogPlaylistTracks,
} from "@/lib/catalog/catalog.api";
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

export default function LibraryPlaylistDetailPage({ params }: PageProps) {
  const { playlistId } = use(params);
  const isFavorites = playlistId === "favorite" || playlistId === "favorites";
  const router = useRouter();

  const user = useAuthStore((state) => state.user);

  // ── Store & State cho trường hợp 1: Favorite ─────────────────────────────
  const favoriteSongs = useFavoriteStore((state) => state.songs);
  const favoriteCollection = useFavoriteStore((state) => state.collection);
  const favoriteLoading = useFavoriteStore((state) => state.loading);
  const favoriteLoaded = useFavoriteStore((state) => state.loaded);
  const hydrateFavorites = useFavoriteStore((state) => state.hydrate);

  // ── State cho trường hợp 2: Playlist do user tạo ─────────────────────────
  const [playlist, setPlaylist] = useState<PlaylistDetail | null>(null);
  const [catalogPlaylist, setCatalogPlaylist] =
    useState<GenericPlaylist | null>(null);
  const [loading, setLoading] = useState(!isFavorites);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [nextCursor, setNextCursor] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const pageRequestVersionRef = useRef(0);
  const seenCursorsRef = useRef(new Set<string>());
  const showLoading = useMinimumLoadingDuration(
    loading || (isFavorites && (!favoriteLoaded || favoriteLoading)),
  );

  useEffect(() => {
    let active = true;
    const requestVersion = ++pageRequestVersionRef.current;
    seenCursorsRef.current = new Set();
    queueMicrotask(() => {
      if (active) setLoadingMore(false);
    });

    if (isFavorites) {
      void hydrateFavorites();
    } else {
      void (async () => {
        try {
          const library = await getLibraryResources();
          const isSavedPlaylist = library.some(
            (resource) =>
              resource.resourceType === "playlists" &&
              resource.resourceId === playlistId,
          );
          if (!isSavedPlaylist) throw new Error("PLAYLIST_NOT_IN_LIBRARY");

          // A Library Playlist can be a saved public playlist or a personal
          // one. Resolve Catalog first: it is the authoritative source for
          // public ids, even when a seeded personal playlist shares that id.
          try {
            const catalog = await getCatalogPlaylist(playlistId);
            const playlistReference = catalog.data.find(
              (resource) => resource.type === "playlists",
            );
            const catalogResource = playlistReference
              ? catalog.resources.playlists[playlistReference.id]
              : catalog.resources.playlists[playlistId];
            if (catalogResource) {
              const attributes = catalogResource.attributes;
              if (!active || requestVersion !== pageRequestVersionRef.current)
                return;
              setCatalogPlaylist({
                id: playlistId,
                title: attributes.name,
                curatorName: attributes.curatorName || "",
                description:
                  attributes.descriptionStandard || attributes.descriptionShort || "",
                artwork: attributes.artwork,
                sourcePlaylistHref: `/library/playlist/${encodeURIComponent(playlistId)}`,
                playlistKind: "catalog",
                isLibraryView: true,
                tracks: mapCatalogTracks(catalog),
              });
              setPlaylist(null);
              setTracks([]);
              setNextCursor("");
              setError("");
              return;
            }
          } catch {
            // A private/user playlist is resolved through its own service below.
          }

          const [playlistDetail, firstPage] = await Promise.all([
            getUserPlaylist(playlistId),
            listUserPlaylistTracks(playlistId),
          ]);
          if (!active || requestVersion !== pageRequestVersionRef.current)
            return;
          setCatalogPlaylist(null);
          setPlaylist(playlistDetail);
          setTracks(firstPage.songs ?? []);
          setNextCursor(getSafeNextCursor(firstPage, seenCursorsRef.current));
          setError("");
        } catch {
          if (!active || requestVersion !== pageRequestVersionRef.current)
            return;
          setCatalogPlaylist(null);
          setError("Could not load playlist.");
        } finally {
          if (active && requestVersion === pageRequestVersionRef.current) {
            setLoading(false);
          }
        }
      })();
    }

    return () => {
      active = false;
    };
  }, [playlistId, isFavorites, hydrateFavorites, revision]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore || isFavorites || catalogPlaylist) return;
    const requestVersion = pageRequestVersionRef.current;
    setLoadingMore(true);
    try {
      const page = await listUserPlaylistTracks(playlistId, {
        cursor: nextCursor,
      });
      if (requestVersion !== pageRequestVersionRef.current) return;
      setTracks((current) => appendUniqueById(current, page.songs));
      setNextCursor(getSafeNextCursor(page, seenCursorsRef.current));
    } finally {
      if (requestVersion === pageRequestVersionRef.current)
        setLoadingMore(false);
    }
  }, [catalogPlaylist, isFavorites, loadingMore, nextCursor, playlistId]);

  const { sentinelRef: loadMoreSentinelRef, showLoadingMore } =
    useInfiniteScrollLoadMore({
      enabled: !isFavorites && !catalogPlaylist && Boolean(nextCursor),
      loading: loadingMore,
      onLoadMore: loadMore,
    });

  useEffect(() => {
    if (isFavorites) return;

    return subscribeLibraryResourcesChanged((change) => {
      if (
        (change?.operation === "pending-remove" ||
          change?.operation === "remove") &&
        change.resourceType === "playlists" &&
        change.resourceId === playlistId
      ) {
        router.replace("/home");
      }
    });
  }, [isFavorites, playlistId, router]);

  useEffect(() => {
    if (isFavorites) return;

    const handlePlaylistChanged = (event: Event) => {
      if (
        (event as CustomEvent<PlaylistChange>).detail?.playlistId === playlistId
      ) {
        setRevision((current) => current + 1);
      }
    };
    window.addEventListener(PLAYLIST_CHANGED_EVENT, handlePlaylistChanged);
    return () =>
      window.removeEventListener(PLAYLIST_CHANGED_EVENT, handlePlaylistChanged);
  }, [isFavorites, playlistId]);

  if (showLoading) {
    return <CatalogPageLoading />;
  }

  if (error || (!isFavorites && !playlist && !catalogPlaylist)) {
    return (
      <div className="mx-(--bodyGutter) py-20 text-center text-(--keyColor)">
        {error || "Could not load playlist."}
      </div>
    );
  }

  // ── MAP DỮ LIỆU SANG CHUẨN GENERICPLAYLIST ──────────────────────────────
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
            ? async () => mapCatalogTracks(await getCatalogPlaylistTracks(playlistId))
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
