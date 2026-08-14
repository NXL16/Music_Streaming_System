import { albumRoute } from "@/lib/catalog/album-route";
import { artistRoute } from "@/lib/catalog/artist-route";
import { playlistRoute } from "@/lib/catalog/playlist-route";
import { songRoute } from "@/lib/catalog/song-route";
import { getArtworkRenditionUrl, getArtworkSrcSet } from "@/lib/media/artwork";
import { createMediaCard } from "@/lib/media/media-card";
import {
  hydrateMediaEntity,
  type MediaEntitySource,
} from "@/lib/media/media-entity-store";
import type {
  MediaArtwork,
  MediaCardArtist,
  MediaCardProps,
} from "@/lib/media/media-card.types";

export type CanonicalMediaResourceType =
  | "albums"
  | "artists"
  | "playlists"
  | "songs"
  | "stations"
  | "editorial-items";

export type MediaResourceSource = {
  id: string;
  type: CanonicalMediaResourceType;
  name: string;
  url?: string;
  artistName?: string;
  curatorName?: string;
  artwork?: MediaArtwork;
  contentRating?: unknown;
  isUserPlaylist?: boolean;
  playlistKind?: MediaCardProps["playlistKind"];
  songIds?: string[];
};

export type MediaResourceProjection = {
  cardType: MediaCardProps["cardType"];
  subtitle?: string;
  artwork?: MediaArtwork;
  artists?: MediaCardArtist[];
  description?: string;
  typeTag?: string;
  videoSrc?: string;
  altText?: string;
  slug?: string;
  imageUrl?: string;
  imageSrcSet?: string;
  artworkColors?: MediaCardProps["artworkColors"];
};

const COVER_WIDTHS = [296, 316, 592, 632];
const HERO_WIDTHS = [450, 600, 900, 1200];

function slugifyStationName(name: string) {
  const slug = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "station";
}

/** The only place that turns canonical resource metadata into an app route. */
export function mediaResourceRoute(resource: MediaResourceSource) {
  switch (resource.type) {
    case "albums":
      return resource.url ? albumRoute(resource.url, resource.id) : undefined;
    case "artists":
      return resource.url ? artistRoute(resource.url, resource.id) : undefined;
    case "playlists":
      if (resource.playlistKind === "favorite") {
        return "/library/playlist/favorite";
      }
      return resource.isUserPlaylist
        ? resource.url || `/library/playlist/${encodeURIComponent(resource.id)}`
        : playlistRoute(resource.url ?? "", resource.id);
    case "songs":
      return songRoute(resource.id);
    case "stations":
      return `/station/${encodeURIComponent(slugifyStationName(resource.name))}/${encodeURIComponent(resource.id)}`;
    case "editorial-items":
      return resource.url;
  }
}

export function normalizeArtworkColor(artwork: MediaArtwork | undefined) {
  const normalized = artwork?.bgColor?.replace(/^#/, "").trim();
  return normalized && /^[0-9a-f]{6}$/i.test(normalized)
    ? `#${normalized}`
    : "#2c2c2e";
}

function resolvePlaylistKind(
  resource: MediaResourceSource,
): MediaCardProps["playlistKind"] {
  if (resource.type !== "playlists") return resource.playlistKind;
  if (resource.playlistKind) return resource.playlistKind;
  if (resource.isUserPlaylist && resource.id === "favorite") {
    return "favorite";
  }
  return resource.isUserPlaylist ? "user" : "catalog";
}

/**
 * Projects source-specific API data into the one card model every renderer
 * consumes. Layout controls cardType; metadata, URLs, colors, and srcSet are
 * always derived here.
 */
export function createMediaResourceCard(
  resource: MediaResourceSource,
  projection: MediaResourceProjection,
): MediaCardProps {
  const artwork = projection.artwork ?? resource.artwork;
  const isHero = projection.cardType === "hero";
  const color = normalizeArtworkColor(artwork);
  const playlistKind = resolvePlaylistKind(resource);

  return createMediaCard({
    id: `${resource.type}-${resource.id}`,
    resourceId: resource.id,
    resourceType: resource.type,
    songIds: resource.songIds,
    isUserPlaylist: resource.isUserPlaylist,
    playlistKind,
    cardType: projection.cardType,
    title: resource.name,
    subtitle:
      projection.subtitle ?? resource.artistName ?? resource.curatorName ?? "",
    slug: projection.slug ?? mediaResourceRoute({ ...resource, playlistKind }),
    contentRating: resource.contentRating,
    artists: projection.artists,
    imageUrl:
      projection.imageUrl ??
      getArtworkRenditionUrl(
        artwork,
        isHero ? 600 : 316,
        isHero ? "hero" : "default",
      ),
    imageSrcSet:
      projection.imageSrcSet ??
      getArtworkSrcSet(
        artwork,
        isHero ? HERO_WIDTHS : COVER_WIDTHS,
        isHero ? "hero" : "default",
      ),
    artwork,
    artworkColors: projection.artworkColors ?? { bg: color, main: color },
    description: projection.description,
    typeTag: projection.typeTag,
    videoSrc: projection.videoSrc,
    altText: projection.altText ?? resource.name,
  });
}

/** Hydrates a normalized resource only at API/event boundaries. */
export function createAndHydrateMediaResourceCard(
  resource: MediaResourceSource,
  projection: MediaResourceProjection,
  source: MediaEntitySource,
) {
  const card = createMediaResourceCard(resource, projection);
  hydrateMediaEntity(card, source);
  return card;
}
