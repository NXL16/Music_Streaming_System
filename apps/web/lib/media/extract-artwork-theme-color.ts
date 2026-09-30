import {
  selectArtworkThemeColor,
  type ArtworkThemeSample,
} from "@musical/shared-types";

const SAMPLE_SIZE = 64;
const EDGE_SIZE = 8;

export { selectArtworkThemeColor, type ArtworkThemeSample };

const RUNTIME_THEME_CACHE_LIMIT = 128;
const runtimeThemeColorCache = new Map<string, Promise<string | null>>();

function optimizedImageUrl(source: string) {
  const url = new URL("/_next/image", window.location.origin);
  url.searchParams.set("url", source);
  url.searchParams.set("w", String(SAMPLE_SIZE));
  url.searchParams.set("q", "75");
  return url.toString();
}

async function loadImage(source: string) {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  image.src = optimizedImageUrl(source);
  await image.decode();
  return image;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hexToHsl(color: string) {
  const value = color.replace(/^#/, "");
  const channels = [0, 2, 4].map(
    (offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255,
  );
  const [red, green, blue] = channels;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const lightness = (maximum + minimum) / 2;
  if (maximum === minimum) return { hue: 0, saturation: 0, lightness };

  const delta = maximum - minimum;
  const saturation =
    lightness > 0.5 ? delta / (2 - maximum - minimum) : delta / (maximum + minimum);
  const hue =
    maximum === red
      ? ((green - blue) / delta + (green < blue ? 6 : 0)) * 60
      : maximum === green
        ? ((blue - red) / delta + 2) * 60
        : ((red - green) / delta + 4) * 60;
  return { hue, saturation, lightness };
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const segment = hue / 60;
  const second = chroma * (1 - Math.abs((segment % 2) - 1));
  const [red, green, blue] =
    segment < 1
      ? [chroma, second, 0]
      : segment < 2
        ? [second, chroma, 0]
        : segment < 3
          ? [0, chroma, second]
          : segment < 4
            ? [0, second, chroma]
            : segment < 5
              ? [second, 0, chroma]
              : [chroma, 0, second];
  const offset = lightness - chroma / 2;
  return `#${[red, green, blue]
    .map((channel) =>
      Math.round((channel + offset) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/**
 * Artwork without persisted metadata needs a page-safe fallback. Preserve
 * neutral covers exactly, while taming only overly vivid or bright colours so
 * a user playlist never becomes a harsh full-page background.
 *
 * This is browser-only and intentionally does not alter Asset palette output.
 */
export function refineRuntimeArtworkThemeColor(color: string) {
  const normalized = /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "#2c2c2e";
  const { hue, saturation, lightness } = hexToHsl(normalized);
  if (saturation < 0.12) return normalized;
  return hslToHex(
    hue,
    Math.min(saturation, 0.44),
    clamp(lightness, 0.28, 0.64),
  );
}

function cacheRuntimeThemeColor(source: string, task: Promise<string | null>) {
  if (runtimeThemeColorCache.size >= RUNTIME_THEME_CACHE_LIMIT) {
    runtimeThemeColorCache.delete(runtimeThemeColorCache.keys().next().value!);
  }
  runtimeThemeColorCache.set(source, task);
  void task.catch(() => {
    // A transient image/CDN failure must be retried on the next visit instead
    // of leaving this artwork permanently cached as a failed request.
    runtimeThemeColorCache.delete(source);
  });
  return task;
}

/** Samples artwork pixels in the browser; color choice is shared with Asset. */
export async function extractArtworkThemeColor(source: string) {
  if (typeof window === "undefined" || !source) return null;
  const cached = runtimeThemeColorCache.get(source);
  if (cached) return cached;
  return cacheRuntimeThemeColor(
    source,
    loadImage(source).then((image) => {
      const canvas = document.createElement("canvas");
      canvas.width = SAMPLE_SIZE;
      canvas.height = SAMPLE_SIZE;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return null;

      context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      const pixels = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
      const samples: ArtworkThemeSample[] = [];
      for (let y = 0; y < SAMPLE_SIZE; y += 2) {
        for (let x = 0; x < SAMPLE_SIZE; x += 2) {
          const offset = (y * SAMPLE_SIZE + x) * 4;
          if (pixels[offset + 3] < 230) continue;
          const edgeMask =
            (x < EDGE_SIZE ? 1 : 0) |
            (x >= SAMPLE_SIZE - EDGE_SIZE ? 2 : 0) |
            (y < EDGE_SIZE ? 4 : 0) |
            (y >= SAMPLE_SIZE - EDGE_SIZE ? 8 : 0);
          samples.push({
            red: pixels[offset],
            green: pixels[offset + 1],
            blue: pixels[offset + 2],
            isEdge: edgeMask !== 0,
            isCorner:
              (x < EDGE_SIZE || x >= SAMPLE_SIZE - EDGE_SIZE) &&
              (y < EDGE_SIZE || y >= SAMPLE_SIZE - EDGE_SIZE),
            edgeMask,
          });
        }
      }
      return refineRuntimeArtworkThemeColor(selectArtworkThemeColor(samples));
    }),
  );
}
