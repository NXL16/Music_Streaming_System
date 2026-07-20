import type {
  MediaCardArtist,
  MediaCardProps,
} from "@/components/media/media-card.types";
import type {
  Artwork,
  CatalogResource,
  CatalogResourceAttributes,
  EditorialVideoAsset,
  RecommendationRef,
  RecommendationResponse,
} from "./recommendation.types";

import type { MediaShelfDisplayKind } from "@/components/media/media-shelf";
import { artistRoute } from "@/lib/catalog/artist-route";
import { albumRoute } from "@/lib/catalog/album-route";
import { songRoute } from "@/lib/catalog/song-route";
import { formatArtistNames } from "@/lib/media/artist-names";
import {
  getArtworkRenditionUrl,
  getArtworkSrcSet,
} from "@/lib/media/artwork";

export type HomeShelf = {
  id: string;
  title: string;
  displayKind: MediaShelfDisplayKind;
  sourceDisplayKind: string;
  hasMore: boolean;
  items: MediaCardProps[];
};

function artworkUrl(
  artwork: Artwork,
  width: number,
  useHeroRenditions = false,
) {
  return getArtworkRenditionUrl(
    artwork,
    width,
    useHeroRenditions ? "hero" : "default",
  );
}

function artworkSrcSet(
  artwork: Artwork,
  fallbackSizes: Array<[width: number, height?: number]>,
  useHeroRenditions = false,
) {
  return getArtworkSrcSet(
    artwork,
    fallbackSizes.map(([width]) => width),
    useHeroRenditions ? "hero" : "default",
  );
}

function formatColor(color: string | undefined) {
  const normalized = color?.replace(/^#/, "").trim();
  return normalized && /^[0-9a-f]{6}$/i.test(normalized)
    ? `#${normalized}`
    : undefined;
}

function contrastTextColor(backgroundColor: string) {
  const normalized = backgroundColor.replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return "#ffffff";

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;

  return luminance > 0.52 ? "#000000" : "#ffffff";
}

type HeroTextPalette = {
  bgColor?: string;
  textColor1?: string;
  textColor2?: string;
  textColor3?: string;
  textColor4?: string;
  scrimColor?: string;
  scrimOpacity?: number;
};

function getHeroTextPalette(artwork: Artwork): HeroTextPalette | undefined {
  if (!artwork.variants || typeof artwork.variants !== "object") {
    return undefined;
  }

  const hero = (artwork.variants as { hero?: unknown }).hero;
  if (!hero || typeof hero !== "object") return undefined;

  const palette = (hero as { palette?: unknown }).palette;
  if (!palette || typeof palette !== "object") return undefined;

  const value = palette as HeroTextPalette;
  return {
    bgColor: value.bgColor,
    textColor1: value.textColor1,
    textColor2: value.textColor2,
    textColor3: value.textColor3,
    textColor4: value.textColor4,
    scrimColor: value.scrimColor,
    scrimOpacity:
      typeof value.scrimOpacity === "number" ? value.scrimOpacity : undefined,
  };
}

function resolveResource(
  response: RecommendationResponse,
  ref: RecommendationRef,
): CatalogResource | undefined {
  const resources = response.resources;
  if (!resources) return undefined;

  switch (ref.type) {
    case "albums":
      return resources.albums[ref.id];
    case "playlists":
      return resources.playlists[ref.id];
    case "stations":
      return resources.stations[ref.id];
    case "artists":
      return resources.artists[ref.id];
    case "songs":
      return resources.songs[ref.id];
    case "editorial-items":
      return resources.editorialItems[ref.id];
    default:
      return undefined;
  }
}

const PORTRAIT_VIDEO_KEYS = [
  "primary",
  "motionTallVideo3x4",
  "motionDetailTall",
] as const;

function selectHeroVideo(
  resource: CatalogResource,
): EditorialVideoAsset | undefined {
  const editorialVideo = resource.attributes?.editorialVideo;
  if (!editorialVideo) return undefined;

  for (const key of PORTRAIT_VIDEO_KEYS) {
    const asset = editorialVideo[key];
    if (asset?.video) return asset;
  }

  return undefined;
}

function getDisplayKind(
  sourceKind: string,
): MediaShelfDisplayKind | undefined {
  if (
    sourceKind === "MusicNotesHeroShelf" ||
    sourceKind === "MusicSuperHeroShelf"
  ) {
    return "MusicNotesHeroShelf";
  }

  if (
    sourceKind === "MusicCoverShelf" ||
    sourceKind === "MusicConcertsEmptyShelf"
  ) {
    return "MusicCoverShelf";
  }

  if (sourceKind === "MusicCircleCoverShelf") {
    return "MusicCircleCoverShelf";
  }

  if (sourceKind === "MusicSocialCardShelf") {
    return "MusicSocialCardShelf";
  }

  return undefined;
}

function getSectionRefs(
  contents: RecommendationRef[] | undefined,
  primaryContent: RecommendationRef[] | undefined,
) {
  const seen = new Set<string>();

  return [...(contents ?? []), ...(primaryContent ?? [])].filter((ref) => {
    const key = `${ref.type}:${ref.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function closestArtwork(
  artworks: Record<string, Artwork | undefined> | undefined,
  targetRatio: number,
  tolerance = Number.POSITIVE_INFINITY,
) {
  if (!artworks) return undefined;

  return Object.values(artworks)
    .filter(
      (artwork): artwork is Artwork =>
        Boolean(
          artwork?.url &&
            artwork.width > 0 &&
            artwork.height > 0 &&
            Math.abs(artwork.width / artwork.height - targetRatio) <= tolerance,
        ),
    )
    .sort(
      (left, right) =>
        Math.abs(left.width / left.height - targetRatio) -
        Math.abs(right.width / right.height - targetRatio),
    )[0];
}

function selectArtwork(
  attributes: CatalogResourceAttributes,
  videoAsset: EditorialVideoAsset | undefined,
  isHero: boolean,
) {
  const editorialArtwork = attributes.editorialArtwork;
  const artworkCandidates = {
    ...editorialArtwork,
    standardArtwork: attributes.artwork,
    videoPreview: videoAsset?.previewFrame,
  };

  let artwork: Artwork | undefined;

  if (isHero) {
    artwork =
      videoAsset?.previewFrame ??
      editorialArtwork?.superHeroTall ??
      editorialArtwork?.staticDetailTall ??
      closestArtwork(artworkCandidates, 3 / 4, 0.08) ??
      closestArtwork(artworkCandidates, 3 / 4);
  } else {
    artwork =
      editorialArtwork?.staticDetailSquare ??
      closestArtwork(
        {
          standardArtwork: attributes.artwork,
          videoPreview: videoAsset?.previewFrame,
        },
        1,
        0.08,
      ) ??
      closestArtwork(editorialArtwork, 1, 0.08) ??
      closestArtwork(artworkCandidates, 1);
  }

  if (!artwork && attributes.artwork?.url) {
    artwork = attributes.artwork;
  }

  return artwork;
}

function getSubtitle(attributes: CatalogResourceAttributes) {
  if (attributes.artistName) return formatArtistNames(attributes.artistName);
  if (attributes.curatorName) return attributes.curatorName;

  return Array.isArray(attributes.artistNames)
    ? attributes.artistNames.join(", ")
    : formatArtistNames(attributes.artistNames ?? "");
}

function getArtists(
  response: RecommendationResponse,
  resource: CatalogResource,
): MediaCardArtist[] {
  const artistRefs = resource.relationships?.artists?.data ?? [];
  const artistResources = response.resources?.artists;
  if (!artistResources) return [];

  return artistRefs.flatMap((artistRef) => {
    const artist = artistResources[artistRef.id];
    const name = artist?.attributes?.name;
    const artistUrl = artist?.attributes?.url;
    if (!artist || !name || !artistUrl) return [];

    return [
      {
        id: artist.id,
        name,
        url: artistRoute(artistUrl, artist.id),
      },
    ];
  });
}

function getCardType(
  resourceType: string,
  isHero: boolean,
  displayKind: MediaShelfDisplayKind,
): MediaCardProps["cardType"] {
  if (isHero) return "hero";
  if (displayKind === "MusicCircleCoverShelf") return "circle";
  if (displayKind === "MusicSocialCardShelf") return "social";
  if (resourceType === "stations") return "station";
  return "collection";
}

function getResourceSlug(resource: CatalogResource) {
  if (resource.type === "albums") {
    const albumUrl = resource.attributes?.url;
    return albumUrl ? albumRoute(albumUrl, resource.id) : undefined;
  }
  if (resource.type === "playlists") {
    return `/playlist/${encodeURIComponent(resource.id)}`;
  }
  if (resource.type === "songs") {
    return songRoute(resource.id);
  }
  if (resource.type === "artists") {
    const artistUrl = resource.attributes?.url;
    return artistUrl ? artistRoute(artistUrl, resource.id) : undefined;
  }
  return resource.attributes?.url;
}

export function mapHomeRecommendations(
  response: RecommendationResponse,
): HomeShelf[] {
  if (!response.resources) return [];

  return response.data.flatMap((sectionRef) => {
    if (sectionRef.type !== "personal-recommendation") return [];

    const section = response.resources?.personalRecommendation[sectionRef.id];
    const sourceDisplayKind = section?.attributes?.display?.kind;
    if (!section || !sourceDisplayKind) return [];

    const displayKind = getDisplayKind(sourceDisplayKind);
    if (!displayKind) return [];

    const isHero =
      sourceDisplayKind === "MusicNotesHeroShelf" ||
      sourceDisplayKind === "MusicSuperHeroShelf";
    const sectionTitle =
      section.attributes?.title?.stringForDisplay ??
      section.attributes?.titleWithoutName?.stringForDisplay ??
      "For You";
    const refs = getSectionRefs(
      section.relationships?.contents?.data,
      section.relationships?.primaryContent?.data,
    );

    const items = refs.flatMap((ref) => {
      const resource = resolveResource(response, ref);
      if (!resource?.attributes) return [];

      const videoAsset = isHero ? selectHeroVideo(resource) : undefined;
      const artwork = selectArtwork(resource.attributes, videoAsset, isHero);
      if (!artwork?.url) return [];

      const heroPalette = isHero ? getHeroTextPalette(artwork) : undefined;
      const color =
        formatColor(heroPalette?.bgColor ?? artwork.bgColor) ?? "#2c2c2e";
      const primaryTextColor =
        formatColor(heroPalette?.textColor1 ?? artwork.textColor1) ??
        contrastTextColor(color);
      const secondaryTextColor =
        formatColor(heroPalette?.textColor2 ?? artwork.textColor2) ??
        primaryTextColor;
      const tertiaryTextColor = formatColor(heroPalette?.textColor3);
      const scrimColor = formatColor(heroPalette?.scrimColor);
      const subtitle = getSubtitle(resource.attributes);
      const notes = resource.attributes.plainEditorialNotes;

      return [
        {
          id: `${resource.type}-${resource.id}`,
          resourceId: resource.id,
          resourceType: resource.type,
          cardType: getCardType(resource.type, isHero, displayKind),
          title: resource.attributes.name ?? notes?.name ?? "Untitled",
          subtitle,
          slug: getResourceSlug(resource),
          artists: getArtists(response, resource),
          imageUrl: isHero
            ? artworkUrl(artwork, 600, true)
            : artworkUrl(artwork, 632),
          imageSrcSet: isHero
            ? artworkSrcSet(artwork, [
                [450, 600],
                [600, 800],
              [900, 1200],
              [1200, 1600],
              ], true)
            : artworkSrcSet(artwork, [
                [296],
                [316],
                [592],
                [632],
              ]),
          artworkColors: {
            bg: color,
            main: color,
            textPrimary: primaryTextColor,
            textSecondary: secondaryTextColor,
            ...(tertiaryTextColor ? { textTertiary: tertiaryTextColor } : {}),
            ...(scrimColor && heroPalette?.scrimOpacity !== undefined
              ? {
                  textScrimColor: scrimColor,
                  textScrimOpacity: heroPalette.scrimOpacity,
                }
              : {}),
          },
          ...(videoAsset?.video ? { videoSrc: videoAsset.video } : {}),
          typeTag: notes?.tag ?? (isHero ? sectionTitle : notes?.name),
          description:
            notes?.short ??
            notes?.standard ??
            resource.attributes.description?.short ??
            resource.attributes.description?.standard ??
            subtitle,
          altText: artwork.alt ?? resource.attributes.name,
        },
      ];
    });

    if (!items.length) return [];

    return [
      {
        id: section.id,
        title: sectionTitle,
        displayKind,
        sourceDisplayKind,
        hasMore: Boolean(section.attributes?.hasSeeAll),
        items,
      },
    ];
  });
}
