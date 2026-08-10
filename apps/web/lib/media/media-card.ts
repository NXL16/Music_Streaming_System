import type {
  ContentRating,
  MediaCardProps,
} from "@/lib/media/media-card.types";
import {
  hydrateMediaEntity,
  type MediaEntitySource,
} from "@/lib/media/media-entity-store";

/**
 * The permissive input is intentional: API payloads are external data and can
 * contain values outside the UI contract. The factory exposes only normalized
 * values to media-card components.
 */
export type MediaCardInput = Omit<MediaCardProps, "contentRating"> & {
  contentRating?: unknown;
};

export function normalizeContentRating(
  value: unknown,
): ContentRating | undefined {
  return value === "explicit" || value === "clean" ? value : undefined;
}

/**
 * Creates the canonical UI model used by every media-card data source.
 * This factory is pure so it is safe to call from React render and useMemo.
 */
export function createMediaCard(
  { contentRating, ...card }: MediaCardInput,
): MediaCardProps {
  const normalizedContentRating = normalizeContentRating(contentRating);

  const mediaCard = normalizedContentRating
    ? { ...card, contentRating: normalizedContentRating }
    : card;
  return mediaCard;
}

/** Hydrates a card only from an event or API boundary, never from render. */
export function createAndHydrateMediaCard(
  input: MediaCardInput,
  source: MediaEntitySource,
): MediaCardProps {
  const card = createMediaCard(input);
  hydrateMediaEntity(card, source);
  return card;
}
