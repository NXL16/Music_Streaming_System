"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PlaylistDetailView, {
  type GenericArtwork,
  type GenericPlaylist,
  type GenericTrack,
} from "@/components/catalog/playlist-detail-view";
import CatalogPageLoading from "@/components/loading/catalog-page-loading";
import { http } from "@/lib/api/http";
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
} from "@/lib/playlists/playlist-events";

type Track = SongSummaryProjectionSource;

type PlaylistDetail = {
  id: string;
  name: string;
  description?: string;
  artwork?: GenericArtwork;
  songs: Track[];
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
  const [loading, setLoading] = useState(!isFavorites);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const showLoading = useMinimumLoadingDuration(
    loading || (isFavorites && (!favoriteLoaded || favoriteLoading)),
  );

  useEffect(() => {
    let active = true;

    if (isFavorites) {
      void hydrateFavorites();
    } else {
      http
        .get(`/playlists/${playlistId}`)
        .then((res) => {
          if (!active) return;
          setPlaylist(res.data.playlist ?? res.data);
          setError("");
        })
        .catch(() => {
          if (!active) return;
          setError("Could not load playlist.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }

    return () => {
      active = false;
    };
  }, [playlistId, isFavorites, hydrateFavorites, revision]);

  useEffect(() => {
    if (isFavorites) return;

    return subscribeLibraryResourcesChanged((change) => {
      if (
        change?.operation === "remove" &&
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
      if ((event as CustomEvent<string>).detail === playlistId) {
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

  if (error || (!isFavorites && !playlist)) {
    return (
      <div className="mx-(--bodyGutter) py-20 text-center text-(--keyColor)">
        {error || "Could not load playlist."}
      </div>
    );
  }

  // ── MAP DỮ LIỆU SANG CHUẨN GENERICPLAYLIST ──────────────────────────────
  const rawTracks = isFavorites ? favoriteSongs : playlist?.songs || [];

  const formattedTracks: GenericTrack[] = rawTracks.map(projectSongSummary);
  const playlistArtwork = isFavorites
    ? (favoriteCollection?.artwork as GenericArtwork | undefined) ?? {
        bgColor: "2c2c2e",
      }
    : resolvePlaylistArtwork(
        playlist?.artwork,
        formattedTracks[0]?.artworkUrl,
        "2c2c2e",
      );

  const formattedPlaylist: GenericPlaylist = {
    id: isFavorites ? "favorite" : playlist?.id || playlistId,
    title: isFavorites
      ? favoriteCollection?.title || "Favourite Songs"
      : playlist?.name || "Playlist",
    curatorName: user?.displayName || "You",
    description: isFavorites
      ? favoriteCollection?.description ||
        `Songs you loved • ${user?.displayName || "You"}`
      : playlist?.description || undefined,
    sourcePlaylistHref: isFavorites
      ? undefined
      : `/library/playlist/${encodeURIComponent(playlistId)}`,
    playlistKind: isFavorites ? "favorite" : "user",
    artwork: playlistArtwork,
    tracks: formattedTracks,
  };

  return <PlaylistDetailView playlist={formattedPlaylist} />;
}
