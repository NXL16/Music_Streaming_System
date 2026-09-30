import type {
  MediaCardArtist,
  MediaCardProps,
} from "@/lib/media/media-card.types";
import type {
  Artwork,
  CatalogResource,
  CatalogResourceAttributes,
  EditorialVideoAsset,
  RecommendationRef,
  RecommendationResponse,
} from "./recommendation.types";

import type { MediaShelfDisplayKind } from "@/components/media/media-shelf";
import { albumRoute } from "@/lib/catalog/album-route";
import { formatArtistNames } from "@/lib/media/artist-names";
import {
  createMediaResourceCard,
  type CanonicalMediaResourceType,
} from "@/lib/media/normalize-media-resource";
import { projectLinkedArtists } from "@/lib/media/project-linked-artists";

export type HomeShelf = {
  id: string;
  title: string;
  displayKind: MediaShelfDisplayKind;
  sourceDisplayKind: string;
  modelVersion: number;
  hasMore: boolean;
  headerArtwork?: {
    imageSrcSet: string;
    artworkColors: {
      bg: string;
      main: string;
    };
    altText: string;
  };
  sourceAlbumHref?: string;
  items: MediaCardProps[];
};

function formatColor(color: string | undefined) {
  const normalized = color?.replace(/^#/, "").trim();
  return normalized && /^[0-9a-f]{6}$/i.test(normalized)
    ? `#${normalized}`
    : undefined;
}

function compactArtworkSrcSet(artworkUrl: string) {
  const match = artworkUrl.match(/^(.*\/)\d+w(\.[a-z0-9]+)$/i);
  if (!match) return artworkUrl;

  const [, baseUrl, extension] = match;
  return [40, 80]
    .map((width) => `${baseUrl}${width}w${extension} ${width}w`)
    .join(", ");
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

type HeroBackgroundPalette = {
  bgColor?: string;
};

function getHeroBackgroundPalette(
  artwork: Artwork,
): HeroBackgroundPalette | undefined {
  if (!artwork.variants || typeof artwork.variants !== "object") {
    return undefined;
  }

  const hero = (artwork.variants as { hero?: unknown }).hero;
  if (!hero || typeof hero !== "object") return undefined;

  const palette = (hero as { palette?: unknown }).palette;
  if (!palette || typeof palette !== "object") return undefined;

  const value = palette as HeroBackgroundPalette;
  return {
    bgColor: value.bgColor,
  };
}

function isLightNeutralColor(color: string) {
  const normalized = color.replace(/^#/, "");
  const channels = /^[0-9a-f]{6}$/i.test(normalized)
    ? [
        Number.parseInt(normalized.slice(0, 2), 16),
        Number.parseInt(normalized.slice(2, 4), 16),
        Number.parseInt(normalized.slice(4, 6), 16),
      ]
    : undefined;
  const brightest = channels ? Math.max(...channels) : 0;
  const darkest = channels ? Math.min(...channels) : 0;
  const luminance = channels
    ? (0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]) / 255
    : 0;
  // Hero artwork commonly uses pastel or saturated bright colours. Dark
  // typography is for white, off-white, and light neutral areas only; vivid
  // bright artwork continues to use the white Hero type scale.
  return luminance >= 0.72 && brightest - darkest <= 56;
}

function heroMetadataTextColors(
  heroBackgroundColor: string,
  artworkBackgroundColor: string | undefined,
) {
  // Older Hero variants can carry a palette derived from an overly broad image
  // region. The original artwork palette is a reliable second signal and lets
  // existing cards recover without reprocessing their assets.
  const usesDarkText =
    isLightNeutralColor(heroBackgroundColor) ||
    (artworkBackgroundColor
      ? isLightNeutralColor(artworkBackgroundColor)
      : false);
  const primary = usesDarkText ? "#000000" : "#ffffff";

  return {
    primary,
    secondary: usesDarkText ? "#1d1d1f" : "#f5f5f7",
    tertiary: usesDarkText ? "#3a3a3c" : "#ebebf5",
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

function systemPlaylistHomeHeroVideo(
  attributes: CatalogResourceAttributes | undefined,
): EditorialVideoAsset | undefined {
  const homeHeroVideo = (
    attributes?.artwork?.variants as
      | {
          systemPlaylistMedia?: { homeHeroVideo?: EditorialVideoAsset };
        }
      | undefined
  )?.systemPlaylistMedia?.homeHeroVideo;
  return homeHeroVideo?.video ? homeHeroVideo : undefined;
}

function systemStationHomeHeroVideo(
  attributes: CatalogResourceAttributes | undefined,
): EditorialVideoAsset | undefined {
  const heroVideo = (
    attributes?.artwork?.variants as
      | { systemStationMedia?: { heroVideo?: EditorialVideoAsset } }
      | undefined
  )?.systemStationMedia?.heroVideo;
  return heroVideo?.video ? heroVideo : undefined;
}

function selectHeroVideo(
  resource: CatalogResource,
): EditorialVideoAsset | undefined {
  const attributes = resource.attributes;
  const editorialVideo = attributes?.editorialVideo;

  if (editorialVideo) {
    for (const key of PORTRAIT_VIDEO_KEYS) {
      const asset = editorialVideo[key];
      if (asset?.video) return asset;
    }
  }

  // System playlists persist their three breakpoint-specific video slots with
  // artwork. This fallback keeps an already published Home snapshot playable
  // when its catalog projection has not yet materialized `editorialVideo`.
  return (
    systemPlaylistHomeHeroVideo(attributes) ??
    systemStationHomeHeroVideo(attributes)
  );
}

function getDisplayKind(sourceKind: string): MediaShelfDisplayKind | undefined {
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

/**
 * Keeps each shelf's editorial/recommendation order as intact as possible,
 * while avoiding adjacent cards that render the same artwork.
 */
function sequenceShelfArtwork<
  T extends Pick<MediaCardProps, "id" | "imageUrl">,
>(items: T[]) {
  const remaining = [...items];
  const ordered: T[] = [];
  let previousArtwork = "";

  while (remaining.length > 0) {
    const nextIndex = remaining.findIndex(
      (item) => shelfArtworkKey(item) !== previousArtwork,
    );
    const [next] = remaining.splice(nextIndex >= 0 ? nextIndex : 0, 1);
    ordered.push(next);
    previousArtwork = shelfArtworkKey(next);
  }

  return ordered;
}

function shelfArtworkKey(item: Pick<MediaCardProps, "id" | "imageUrl">) {
  const checksum = item.imageUrl?.match(/(?:^|\/)([a-f0-9]{64})(?:\/|$)/i)?.[1];
  return checksum
    ? `checksum:${checksum.toLowerCase()}`
    : item.imageUrl || item.id;
}

function closestArtwork(
  artworks: Record<string, Artwork | undefined> | undefined,
  targetRatio: number,
  tolerance = Number.POSITIVE_INFINITY,
) {
  if (!artworks) return undefined;

  return Object.values(artworks)
    .filter((artwork): artwork is Artwork =>
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
  preferVideoPoster = false,
) {
  const editorialArtwork = attributes.editorialArtwork;
  const homeCardArtwork = (
    attributes.artwork?.variants as { homeCard?: Artwork } | undefined
  )?.homeCard;
  const artworkCandidates = {
    ...editorialArtwork,
    homeCardArtwork,
    standardArtwork: attributes.artwork,
  };

  let artwork: Artwork | undefined;

  if (isHero) {
    artwork =
      (preferVideoPoster ? videoAsset?.previewFrame : undefined) ??
      closestArtwork(artworkCandidates, 3 / 4, 0.08) ??
      closestArtwork(artworkCandidates, 3 / 4) ??
      videoAsset?.previewFrame;
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

  return projectLinkedArtists(
    artistRefs.flatMap((artistRef) => {
      const artist = artistResources[artistRef.id];
      const name = artist?.attributes?.name;
      const artistUrl = artist?.attributes?.url;
      if (!artist || !name || !artistUrl) return [];

      return [
        {
          id: artist.id,
          name,
          url: artistUrl,
        },
      ];
    }),
  );
}

function getCardType(
  resourceType: string,
  isHero: boolean,
  displayKind: MediaShelfDisplayKind,
): MediaCardProps["cardType"] {
  if (isHero) return "hero";
  if (displayKind === "MusicCircleCoverShelf") return "circle";
  if (resourceType === "stations") return "station";
  return "collection";
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

    const sourceAlbumId = section.attributes?.sourceAlbumId;
    const sourceAlbumName = section.attributes?.sourceAlbumName ?? sectionTitle;
    const sourceAlbumArtworkUrl = section.attributes?.sourceAlbumArtworkUrl;
    const sourceAlbumArtworkColor =
      formatColor(section.attributes?.sourceAlbumArtworkBgColor) ?? "#2c2c2e";

    const headerArtwork = sourceAlbumArtworkUrl
      ? {
          imageSrcSet: compactArtworkSrcSet(sourceAlbumArtworkUrl),
          artworkColors: {
            bg: sourceAlbumArtworkColor,
            main: sourceAlbumArtworkColor,
          },
          altText: sourceAlbumName,
        }
      : undefined;

    const sourceAlbumHref =
      sourceAlbumId && section.attributes?.sourceAlbumUrl
        ? albumRoute(section.attributes.sourceAlbumUrl, sourceAlbumId)
        : undefined;

    const refs = getSectionRefs(
      section.relationships?.contents?.data,
      section.relationships?.primaryContent?.data,
    );
    const hasPendingArtistStation = refs.some((ref) => {
      const resource = resolveResource(response, ref);
      return (
        resource?.type === "stations" &&
        resource.attributes?.kind === "artist-context" &&
        resource.attributes.stationArtworkReady !== true
      );
    });

    const items = refs.flatMap((ref) => {
      const resource = resolveResource(response, ref);
      if (!resource?.attributes) return [];
      const isArtistStationArtworkPending =
        resource.type === "stations" &&
        resource.attributes.kind === "artist-context" &&
        resource.attributes.stationArtworkReady !== true;
      if (isArtistStationArtworkPending) return [];

      const stationKind =
        resource.type === "stations" ? resource.attributes.kind : undefined;
      const isSystemMoodStation = stationKind === "system-mood";
      const isPersonalizedStation =
        stationKind === "personalized-user" ||
        stationKind === "personalized-discovery";
      const videoAsset = isHero ? selectHeroVideo(resource) : undefined;
      const isSystemStationWithHeroMedia =
        isSystemMoodStation || isPersonalizedStation;
      const artwork = selectArtwork(
        resource.attributes,
        videoAsset,
        isHero,
        isSystemStationWithHeroMedia,
      );
      if (!artwork?.url) return [];

      const heroBackgroundPalette = isHero
        ? getHeroBackgroundPalette(artwork)
        : undefined;
      const color =
        formatColor(heroBackgroundPalette?.bgColor ?? artwork.bgColor) ??
        "#2c2c2e";
      const heroTextColors = isHero
        ? heroMetadataTextColors(color, formatColor(artwork.bgColor))
        : undefined;
      const primaryTextColor =
        heroTextColors?.primary ??
        formatColor(artwork.textColor1) ??
        contrastTextColor(color);
      const secondaryTextColor =
        heroTextColors?.secondary ??
        formatColor(artwork.textColor2) ??
        primaryTextColor;
      const tertiaryTextColor = heroTextColors?.tertiary;
      const subtitle = getSubtitle(resource.attributes);
      const notes = resource.attributes.plainEditorialNotes;
      const isSystemMadeForYouPlaylist =
        resource.type === "playlists" &&
        resource.attributes.playlistType === "system-personalized";
      const isArtistStationForYou =
        resource.type === "stations" &&
        resource.attributes.kind === "artist-context";
      const isTopPicks =
        section.id === "user-top-picks" || section.id === "global-top-picks";
      const isListenAgainTopPickAlbum =
        section.id === "user-top-picks" &&
        resource.type === "albums" &&
        resource.id === section.attributes?.listenAgainAlbumId;
      // Remaining album cards in User Top Picks are reused from New Releases.
      const isNewReleaseTopPickAlbum =
        section.id === "user-top-picks" &&
        resource.type === "albums" &&
        !isListenAgainTopPickAlbum;
      const isMadeForYouTopPick =
        section.id === "user-top-picks" &&
        (isSystemMadeForYouPlaylist || isPersonalizedStation);
      const isMadeForYouShelf =
        section.id === "user-playlists-made-for-you" ||
        section.id === "global-playlists-made-for-you";
      const isContextStation =
        resource.type === "stations" &&
        (resource.attributes.kind === "song-context" ||
          resource.attributes.kind === "artist-context");
      const description = isContextStation || isPersonalizedStation
        ? undefined
        : isSystemMadeForYouPlaylist
          ? (resource.attributes.description?.short ??
            resource.attributes.description?.standard ??
            subtitle)
          : (notes?.short ??
            notes?.standard ??
            resource.attributes.description?.short ??
            resource.attributes.description?.standard ??
            subtitle);

      return [
        createMediaResourceCard(
          {
            id: resource.id,
            type: resource.type as CanonicalMediaResourceType,
            name: resource.attributes.name ?? notes?.name ?? "Untitled",
            url: resource.attributes.url,
            artistName: resource.attributes.artistName,
            curatorName: resource.attributes.curatorName,
            artwork,
            contentRating:
              resource.type === "albums"
                ? resource.attributes.contentRating
                : undefined,
            isUserPlaylist: Boolean(
              (resource.attributes as { isUserPlaylist?: boolean })
                .isUserPlaylist,
            ),
          },
          {
            cardType: getCardType(resource.type, isHero, displayKind),
            subtitle,
            artists: getArtists(response, resource),
            artworkColors: {
              bg: color,
              main: color,
              textPrimary: primaryTextColor,
              textSecondary: secondaryTextColor,
              ...(tertiaryTextColor ? { textTertiary: tertiaryTextColor } : {}),
            },
            ...(videoAsset?.video ? { videoSrc: videoAsset.video } : {}),
            typeTag:
              isTopPicks && isArtistStationForYou
                ? `Featuring ${resource.attributes.primaryArtistName ?? "Artist"}`
                : section.id === "user-top-picks" && isSystemMoodStation
                ? "Mood for You"
                : isListenAgainTopPickAlbum
                ? "Listen Again"
                : isNewReleaseTopPickAlbum
                ? "New Releases"
                : isMadeForYouTopPick
                ? "Made for You"
                : (isTopPicks
                  ? undefined
                  : (notes?.tag ?? (isHero ? sectionTitle : notes?.name))),
            showTypeTag: !(isSystemMadeForYouPlaylist && isMadeForYouShelf),
            showTitle: !isSystemMadeForYouPlaylist,
            hideHeroDescription:
              isHero && (isArtistStationForYou || isPersonalizedStation),
            description,
            altText: artwork.alt ?? resource.attributes.name,
          },
        ),
      ];
    });

    // Keep a Station shelf mounted while its composite covers are rendering.
    // Pending cards remain hidden; this prevents the seed artist artwork from
    // flashing while preserving the shelf position on Home.
    if (!items.length && !hasPendingArtistStation) return [];

    return [
      {
        id: section.id,
        title: sectionTitle,
        headerArtwork,
        sourceAlbumHref,
        displayKind,
        sourceDisplayKind,
        modelVersion: section.attributes?.version ?? 1,
        hasMore: Boolean(section.attributes?.hasSeeAll),
        items: sequenceShelfArtwork(items),
      },
    ];
  });
}
