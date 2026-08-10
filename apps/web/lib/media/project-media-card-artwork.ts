import {
  getArtworkRenditionUrl,
  getArtworkSrcSet,
} from "@/lib/media/artwork";
import type { MediaCardProps } from "./media-card.types";

const coverWidths = [296, 316, 592, 632];
const heroWidths = [450, 600, 900, 1200];

/** Projects one canonical artwork into the rendition set needed by this card. */
export function projectMediaCardArtwork(card: MediaCardProps): MediaCardProps {
  const artwork = card.artwork;
  if (!artwork?.url) return card;

  const isHero = card.cardType === "hero";
  const variant = isHero ? "hero" : "default";
  const widths = isHero ? heroWidths : coverWidths;
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
