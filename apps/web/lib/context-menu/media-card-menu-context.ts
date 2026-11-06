import type { MediaCardProps } from "@/lib/media/media-card.types";
import type { ContextMenuContext } from "./types";

export function getMediaCardMenuContext(
  card: MediaCardProps,
): ContextMenuContext | undefined {
  if (card.menuContext) return card.menuContext;

  if (card.resourceType === "artists" && card.slug) {
    return {
      kind: "artist",
      artistId: card.resourceId,
      title: card.title,
      href: card.slug,
      artworkUrl: card.imageUrl,
    };
  }

  if (card.resourceType === "albums") {
    return {
      kind: "collection",
      resourceId: card.resourceId,
      resourceType: "albums",
      sourceOrigin: "catalog",
      isUserPlaylist: false,
      title: card.title,
      subtitle: card.subtitle,
      artworkUrl: card.imageUrl,
      href: card.slug,
      songIds: card.songIds,
      inLibrary: false,
    };
  }

  if (card.resourceType !== "playlists") return undefined;

  if (card.playlistKind === "favorite") {
    return {
      kind: "collection",
      resourceId: card.resourceId,
      resourceType: "playlists",
      sourceOrigin: "favorite",
      title: card.title,
      subtitle: card.subtitle,
      artworkUrl: card.imageUrl,
      href: card.slug,
      songIds: card.songIds,
      inLibrary: true,
    };
  }

  if (card.isUserPlaylist || card.playlistKind === "user") {
    return {
      kind: "collection",
      resourceId: card.resourceId,
      resourceType: "playlists",
      sourceOrigin: "user-playlist",
      isUserPlaylist: true,
      title: card.title,
      subtitle: card.subtitle,
      artworkUrl: card.imageUrl,
      href: card.slug,
      songIds: card.songIds,
      inLibrary: false,
    };
  }

  return {
    kind: "collection",
    resourceId: card.resourceId,
    resourceType: "playlists",
    sourceOrigin: "catalog",
    isUserPlaylist: false,
    title: card.title,
    subtitle: card.subtitle,
    artworkUrl: card.imageUrl,
    href: card.slug,
    songIds: card.songIds,
    inLibrary: false,
  };
}
