type ArtworkRendition = {
  url?: string;
  width?: number;
};

type ArtworkSource = {
  url?: string;
  variants?: unknown;
};

export type ArtworkVariant = "default" | "hero";

function getRenditions(
  artwork: ArtworkSource | undefined,
  variant: ArtworkVariant = "default",
): ArtworkRendition[] {
  const variants = artwork?.variants;
  if (!variants || typeof variants !== "object" || Array.isArray(variants)) {
    return [];
  }

  const renditions =
    variant === "hero"
      ? (variants as { hero?: { renditions?: unknown } }).hero?.renditions
      : (variants as { renditions?: unknown }).renditions;
  if (!Array.isArray(renditions)) return [];

  return renditions
    .filter(
      (rendition): rendition is ArtworkRendition =>
        !!rendition &&
        typeof rendition === "object" &&
        typeof (rendition as ArtworkRendition).url === "string" &&
        typeof (rendition as ArtworkRendition).width === "number" &&
        (rendition as ArtworkRendition).width! > 0,
    )
    .sort((left, right) => (left.width ?? 0) - (right.width ?? 0));
}

export function getArtworkRenditionUrl(
  artwork: ArtworkSource | undefined,
  minimumWidth: number,
  variant: ArtworkVariant = "default",
): string {
  if (!artwork?.url) return "";

  const renditions = getRenditions(artwork, variant);
  return (
    renditions.find((rendition) => (rendition.width ?? 0) >= minimumWidth)
      ?.url ??
    renditions.at(-1)?.url ??
    artwork.url
  );
}

export function getArtworkSrcSet(
  artwork: ArtworkSource | undefined,
  widths: number[],
  variant: ArtworkVariant = "default",
): string {
  const renditions = getRenditions(artwork, variant);
  if (!renditions.length) {
    // The original has no verified intrinsic width. Do not advertise it as
    // multiple smaller candidates: doing so makes the browser select a fake
    // 40w/80w image while downloading the full-size original.
    return artwork?.url ?? "";
  }

  const selected = new Map<number, string>();
  for (const width of widths) {
    const rendition =
      renditions.find((item) => (item.width ?? 0) >= width) ??
      renditions.at(-1);
    if (rendition?.url && rendition.width) {
      selected.set(rendition.width, rendition.url);
    }
  }

  return [...selected.entries()]
    .sort(([left], [right]) => left - right)
    .map(([width, url]) => `${url} ${width}w`)
    .join(", ");
}
