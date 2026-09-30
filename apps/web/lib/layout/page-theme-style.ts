import type { CSSProperties } from "react";
import { isLightArtworkThemeColor } from "@musical/shared-types";

type Rgb = {
  red: number;
  green: number;
  blue: number;
};

type SemanticPalette = {
  secondary: string;
  tertiary: string;
  divider: string;
};

const WHITE: Rgb = {
  red: 255,
  green: 255,
  blue: 255,
};

const LIGHT_BLEND_OPACITY = {
  secondary: 0.56,
  tertiary: 0.48,
  divider: 0.11,
} as const;

const DARK_DIVIDER_WHITE_OPACITY = 0.13;
const SHELF_CHANNEL_REDUCTION = 10;

const SKELETON_CONTRAST = {
  base: 1.45,
  mid: 1.65,
  highlight: 1.9,
} as const;

const SKELETON_BLEND = {
  light: { base: 0.08, mid: 0.13, highlight: 0.19 },
  dark: { base: 0.1, mid: 0.17, highlight: 0.25 },
} as const;

function clamp(value: number, min = 0, max = 255) {
  return Math.min(max, Math.max(min, value));
}

function parseHex(color: string): Rgb {
  const value = color.trim().replace(/^#/, "");

  if (!/^[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`Invalid hex color: "${color}"`);
  }

  return {
    red: Number.parseInt(value.slice(0, 2), 16),
    green: Number.parseInt(value.slice(2, 4), 16),
    blue: Number.parseInt(value.slice(4, 6), 16),
  };
}

function toHex({ red, green, blue }: Rgb) {
  return `#${[red, green, blue]
    .map((channel) => Math.round(clamp(channel)).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function isLightPageTheme(baseColor: string) {
  return isLightArtworkThemeColor(baseColor);
}

function mixRgb(from: Rgb, to: Rgb, amount: number): Rgb {
  return {
    red: from.red + (to.red - from.red) * amount,
    green: from.green + (to.green - from.green) * amount,
    blue: from.blue + (to.blue - from.blue) * amount,
  };
}

function relativeLuminance({ red, green, blue }: Rgb) {
  const linearize = (channel: number) => {
    const normalized = clamp(channel) / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return (
    linearize(red) * 0.2126 +
    linearize(green) * 0.7152 +
    linearize(blue) * 0.0722
  );
}

function contrastRatio(a: Rgb, b: Rgb) {
  const luminanceA = relativeLuminance(a);
  const luminanceB = relativeLuminance(b);
  return (
    (Math.max(luminanceA, luminanceB) + 0.05) /
    (Math.min(luminanceA, luminanceB) + 0.05)
  );
}

function deriveAccessibleColor(
  background: Rgb,
  target: Rgb,
  preferredBlend: number,
  minContrast: number,
) {
  const preferredColor = mixRgb(background, target, preferredBlend);
  if (contrastRatio(background, preferredColor) >= minContrast)
    return preferredColor;

  let low = preferredBlend;
  let high = 1;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const mid = (low + high) / 2;
    if (
      contrastRatio(background, mixRgb(background, target, mid)) >= minContrast
    )
      high = mid;
    else low = mid;
  }

  return mixRgb(background, target, high);
}

function deriveShelfColor(base: Rgb) {
  return toHex({
    red: base.red - SHELF_CHANNEL_REDUCTION,
    green: base.green - SHELF_CHANNEL_REDUCTION,
    blue: base.blue - SHELF_CHANNEL_REDUCTION,
  });
}

function multiplyChannel(channel: number, opacity: number) {
  // Match the browser compositing path: alpha-composite black first, round
  // that intermediate channel, then multiply it with the artwork channel.
  const composited = Math.round(channel * (1 - opacity));
  return Math.round((channel * composited) / 255);
}

function deriveLightPalette(base: Rgb): SemanticPalette {
  const derive = (opacity: number) =>
    toHex({
      red: multiplyChannel(base.red, opacity),
      green: multiplyChannel(base.green, opacity),
      blue: multiplyChannel(base.blue, opacity),
    });

  return {
    secondary: derive(LIGHT_BLEND_OPACITY.secondary),
    tertiary: derive(LIGHT_BLEND_OPACITY.tertiary),
    divider: derive(LIGHT_BLEND_OPACITY.divider),
  };
}

function deriveDarkDividerChannel(channel: number) {
  const composited = Math.round(
    channel * (1 - DARK_DIVIDER_WHITE_OPACITY) +
      255 * DARK_DIVIDER_WHITE_OPACITY,
  );
  return clamp(channel + composited);
}

function deriveDarkPalette(base: Rgb): SemanticPalette {
  return {
    secondary: toHex({
      red: base.red + 161,
      green: base.green + 161,
      blue: base.blue + 166,
    }),
    tertiary: toHex({
      red: base.red + 110,
      green: base.green + 110,
      blue: base.blue + 115,
    }),
    divider: toHex({
      red: deriveDarkDividerChannel(base.red),
      green: deriveDarkDividerChannel(base.green),
      blue: deriveDarkDividerChannel(base.blue),
    }),
  };
}

function deriveSemanticPalette(base: Rgb, isLight: boolean): SemanticPalette {
  return isLight ? deriveLightPalette(base) : deriveDarkPalette(base);
}

function deriveSemanticVariables(base: Rgb, isLight: boolean) {
  const palette = deriveSemanticPalette(base, isLight);

  if (isLight) {
    return {
      "--systemSecondary-vibrantOnLight-blended-plusD": palette.secondary,
      "--systemTertiary-vibrantOnLight-blended-plusD": palette.tertiary,
      "--labelDivider-vibrantOnLight-blended-plusD": palette.divider,
    };
  }

  return {
    "--systemSecondary-vibrantOnDark-blended-plusL": palette.secondary,
    "--systemTertiary-vibrantOnDark-blended-plusL": palette.tertiary,
    "--labelDivider-vibrantOnDark-blended-plusL": palette.divider,
  };
}

function deriveSkeletonVariables(base: Rgb, isLight: boolean) {
  const target = isLight ? { red: 0, green: 0, blue: 0 } : WHITE;
  const config = isLight ? SKELETON_BLEND.light : SKELETON_BLEND.dark;
  const derive = (amount: number, contrast: number) =>
    toHex(deriveAccessibleColor(base, target, amount, contrast));

  return {
    "--skeleton-base": derive(config.base, SKELETON_CONTRAST.base),
    "--skeleton-mid": derive(config.mid, SKELETON_CONTRAST.mid),
    "--skeleton-highlight": derive(
      config.highlight,
      SKELETON_CONTRAST.highlight,
    ),
  };
}

export function createPageThemeStyle(baseColor: string): CSSProperties {
  const base = parseHex(baseColor);

  const isLight = isLightPageTheme(baseColor);

  return {
    "--joe-color": toHex(base),
    "--opaqueShelfBG-blended-plusD": deriveShelfColor(base),
    ...deriveSemanticVariables(base, isLight),
    ...deriveSkeletonVariables(base, isLight),
  } as unknown as CSSProperties;
}
