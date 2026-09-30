import {
  isLightArtworkThemeColor,
  selectArtworkThemeColor,
  type ArtworkThemeSample,
} from "@musical/shared-types";
import sharp from "sharp";

const SAMPLE_SIZE = 64;
const EDGE_SIZE = 8;

export type ArtworkPalette = {
  bgColor: string;
  textColor1: string;
  textColor2: string;
  textColor3: string;
  textColor4: string;
  hasP3: boolean;
};

/**
 * The single source of truth for artwork page colors. It intentionally reads
 * only the source image, so it can be reused to refresh metadata without
 * transcoding artwork renditions or touching audio/video assets.
 */
export async function deriveArtworkPalette(source: Buffer): Promise<ArtworkPalette> {
  const { data, info } = await sharp(source)
    .removeAlpha()
    .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const samples: ArtworkThemeSample[] = [];
  for (let y = 0; y < SAMPLE_SIZE; y += 2) {
    for (let x = 0; x < SAMPLE_SIZE; x += 2) {
      const offset = (y * SAMPLE_SIZE + x) * info.channels;
      const edgeMask =
        (x < EDGE_SIZE ? 1 : 0) |
        (x >= SAMPLE_SIZE - EDGE_SIZE ? 2 : 0) |
        (y < EDGE_SIZE ? 4 : 0) |
        (y >= SAMPLE_SIZE - EDGE_SIZE ? 8 : 0);
      samples.push({
        red: data[offset] ?? 0,
        green: data[offset + 1] ?? 0,
        blue: data[offset + 2] ?? 0,
        isEdge: edgeMask !== 0,
        isCorner:
          (x < EDGE_SIZE || x >= SAMPLE_SIZE - EDGE_SIZE) &&
          (y < EDGE_SIZE || y >= SAMPLE_SIZE - EDGE_SIZE),
        edgeMask,
      });
    }
  }

  return artworkPaletteFromColor(selectArtworkThemeColor(samples));
}

/** Builds the matching text palette for a manually approved background color. */
export function artworkPaletteFromColor(value: string): ArtworkPalette {
  const bgColor = value.replace(/^#/, "").toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(bgColor)) {
    throw new Error("ARTWORK_THEME_COLOR_INVALID");
  }
  const red = Number.parseInt(bgColor.slice(0, 2), 16);
  const green = Number.parseInt(bgColor.slice(2, 4), 16);
  const blue = Number.parseInt(bgColor.slice(4, 6), 16);
  const foreground = isLightArtworkThemeColor(bgColor) ? 0 : 255;
  const textColor = (opacity: number) =>
    hexColor({
      red: Math.round(red * (1 - opacity) + foreground * opacity),
      green: Math.round(green * (1 - opacity) + foreground * opacity),
      blue: Math.round(blue * (1 - opacity) + foreground * opacity),
    });

  return {
    bgColor,
    textColor1: textColor(1),
    textColor2: textColor(0.82),
    textColor3: textColor(0.64),
    textColor4: textColor(0.46),
    hasP3: false,
  };
}

function hexColor(color: { red: number; green: number; blue: number }): string {
  return [color.red, color.green, color.blue]
    .map((channel) =>
      Math.max(0, Math.min(255, channel)).toString(16).padStart(2, "0"),
    )
    .join("");
}
