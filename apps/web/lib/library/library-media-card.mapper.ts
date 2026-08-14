import type {
  MediaArtwork,
  MediaCardProps,
} from "@/lib/media/media-card.types";
import { createMediaResourceCard } from "@/lib/media/normalize-media-resource";
import { projectLinkedArtists } from "@/lib/media/project-linked-artists";
import { playlistArtworkVariants } from "@/lib/playlists/generated-playlist-cover";

export type LibraryMediaResource = {
  resourceType: "albums" | "playlists";
  resourceId: string;
  title: string;
  subtitle: string;
  artworkUrl: string;
  catalogUrl: string;
  contentRating: string;
  artists: Array<{ id: string; name: string; url: string }>;
  artwork?: MediaArtwork;
  songIds?: string[];
  createdAt?: string;
};

export type UserPlaylistSummary = {
  id: string;
  name: string;
  playlistKind?: "favorite" | "user";
  description?: string;
  trackCount?: number;
  createdAt?: number;
  artworkUrl?: string;
};

const LIBRARY_ARTWORK_COLOR = "34343b";
const PERSONAL_PLAYLIST_ARTWORK_COLOR = "4a4566";

/** Adapter for the authenticated Library API; pages never build routes/cards. */
export function projectLibraryMediaCard(
  resource: LibraryMediaResource,
): MediaCardProps {
  const isAlbum = resource.resourceType === "albums";
  const isFavoritePlaylist =
    resource.resourceType === "playlists" && resource.resourceId === "favorite";
  return createMediaResourceCard(
    {
      id: resource.resourceId,
      type: resource.resourceType,
      name: resource.title,
      url: isFavoritePlaylist
        ? "/library/playlist/favorite"
        : resource.catalogUrl,
      artistName: resource.subtitle,
      isUserPlaylist: isFavoritePlaylist,
      playlistKind: isFavoritePlaylist ? "favorite" : undefined,
      songIds: resource.songIds,
      artwork: resource.artwork ?? {
        url: resource.artworkUrl,
        variants: playlistArtworkVariants(resource.artworkUrl),
        bgColor: LIBRARY_ARTWORK_COLOR,
      },
      contentRating: resource.contentRating,
    },
    {
      cardType: "collection",
      subtitle: resource.subtitle || (isAlbum ? "Album" : "Playlist"),
      typeTag: isAlbum ? "Album" : "Playlist",
      artists: projectLinkedArtists(resource.artists),
    },
  );
}

export function projectUserPlaylistCard(
  playlist: UserPlaylistSummary,
): MediaCardProps {
  return createMediaResourceCard(
    {
      id: playlist.id,
      type: "playlists",
      name: playlist.name,
      url: `/library/playlist/${encodeURIComponent(playlist.id)}`,
      isUserPlaylist: true,
      playlistKind: playlist.playlistKind ?? "user",
      artwork: playlist.artworkUrl
        ? {
            url: playlist.artworkUrl,
            variants: playlistArtworkVariants(playlist.artworkUrl),
          }
        : { bgColor: PERSONAL_PLAYLIST_ARTWORK_COLOR },
    },
    {
      cardType: "collection",
      subtitle: playlist.description || `${playlist.trackCount ?? 0} songs`,
      typeTag: "Playlist",
    },
  );
}
