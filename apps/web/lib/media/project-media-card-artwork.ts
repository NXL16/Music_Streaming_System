import { getArtworkRenditionUrl, getArtworkSrcSet } from "@/lib/media/artwork";
import {
  COVER_ARTWORK_WIDTHS,
  HERO_ARTWORK_WIDTHS,
} from "@/lib/media/artwork-slots";
import type { MediaCardProps } from "./media-card.types";

/** Projects one canonical artwork into the rendition set needed by this card. */
export function projectMediaCardArtwork(card: MediaCardProps): MediaCardProps {
  const artwork = card.artwork;
  if (!artwork?.url) return card;

  const isHero = card.cardType === "hero";
  const variant = isHero ? "hero" : "default";
  const widths = isHero ? [...HERO_ARTWORK_WIDTHS] : [...COVER_ARTWORK_WIDTHS];
  const fallbackColor = artwork.bgColor?.replace(/^#/, "");

  return {
    ...card,
    imageUrl: getArtworkRenditionUrl(artwork, isHero ? 600 : 316, variant),
    imageSrcSet: getArtworkSrcSet(artwork, widths, variant),
    artworkColors: fallbackColor
      ? {
          ...card.artworkColors,
          bg: `#${fallbackColor}`,
          main: `#${fallbackColor}`,
        }
      : card.artworkColors,
  };
}
