// ==========================================
//                  REDIS
// ==========================================
export const TRANSCODE_QUEUE = "transcode_queue" as const;
export const SONG_COMPLETION_QUEUE = "song_completion_queue" as const;
export const SONG_COMPLETION_DLQ = "song_completion_queue:dlq" as const;
// A dedicated stream key avoids a WRONGTYPE conflict with the retired List
// key while keeping all cleanup traffic on Redis Streams.
export const SONG_ASSET_CLEANUP_STREAM = "song_asset_cleanup_stream" as const;
export const SONG_ASSET_CLEANUP_DLQ = "song_asset_cleanup_stream:dlq" as const;

export const authRefreshKey = (userId: string, deviceId: string): string =>
  `auth:refresh:${userId}:${deviceId}`;

export const authDevicesKey = (userId: string): string =>
  `auth:devices:${userId}`;

export const authAccessBlacklistKey = (jti: string): string =>
  `auth:blacklist:${jti}`;

export const authStateKey = (userId: string): string => `auth:state:${userId}`;

export const songCompletionProcessedKey = (
  songId: string,
  metadataVersion: number,
): string => `song_completion_processed:${songId}:${metadataVersion}`;

export const songCompletionLockKey = (songId: string): string =>
  `song_completion_lock:${songId}`;

type ArtworkRendition = { url: string; width: number };

/**
 * Builds a responsive srcSet by selecting the smallest available rendition
 * that satisfies each requested width. Invalid artwork metadata is ignored.
 */
export function getArtworkRenditionSrcSet(
  artwork: unknown,
  widths: readonly number[],
): string {
  if (!artwork || typeof artwork !== "object" || Array.isArray(artwork)) {
    return "";
  }

  const variants = (artwork as { variants?: unknown }).variants;
  if (!variants || typeof variants !== "object" || Array.isArray(variants)) {
    return "";
  }

  const renditions = (variants as { renditions?: unknown }).renditions;
  if (!Array.isArray(renditions)) return "";

  const available = renditions
    .flatMap((rendition): ArtworkRendition[] => {
      if (!rendition || typeof rendition !== "object") return [];
      const { url, width } = rendition as { url?: unknown; width?: unknown };
      return typeof url === "string" && typeof width === "number" && width > 0
        ? [{ url, width }]
        : [];
    })
    .sort((left, right) => left.width - right.width);

  if (!available.length) return "";

  const selected = new Map<number, string>();
  for (const width of widths) {
    const rendition =
      available.find((item) => item.width >= width) ?? available.at(-1);
    if (rendition) selected.set(rendition.width, rendition.url);
  }

  return [...selected.entries()]
    .sort(([left], [right]) => left - right)
    .map(([width, url]) => `${url} ${width}w`)
    .join(", ");
}

// ==========================================
// CONSTANTS & TYPES
// ==========================================
export const UserRole = {
  USER: "USER",
  ARTIST_PENDING: "ARTIST_PENDING",
  ARTIST: "ARTIST",
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN_USER_OPS: "ADMIN_USER_OPS",
  ADMIN_SECURITY_OPS: "ADMIN_SECURITY_OPS",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export interface JwtUser {
  userId: string;
  username: string;
  role: UserRole;
  deviceId: string;
  tokenVersion: number;
  jti: string;
  exp: number;
}

export interface JwtPayload {
  sub: string;
  username: string;
  role: UserRole;
  deviceId: string;
  tokenVersion: number;
  jti: string;
  exp: number;
}

export interface HttpExceptionResponseBody {
  message: string[] | string;
  code?: string;
  error?: string;
  statusCode?: number;
}

// ==========================================
//              ARTWORK THEME
// ==========================================

const ARTWORK_NEUTRAL_COLOR = "#2e2e2e";

type ArtworkRgb = { red: number; green: number; blue: number };
type ArtworkLab = { l: number; a: number; b: number };
type ArtworkBucket = ArtworkRgb &
  ArtworkLab & {
    count: number;
    edgeCount: number;
    cornerCount: number;
    edgeMask: number;
  };

export type ArtworkThemeSample = ArtworkRgb & {
  isEdge: boolean;
  isCorner?: boolean;
  edgeMask?: number;
};

function artworkRelativeLuminance({ red, green, blue }: ArtworkRgb) {
  const linear = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return linear(red) * 0.2126 + linear(green) * 0.7152 + linear(blue) * 0.0722;
}

/**
 * Returns whether black primary text has better contrast than white over the
 * supplied artwork color. Invalid values deliberately use the dark fallback.
 */
export function isLightArtworkThemeColor(value: string | undefined) {
  const hex = value?.replace(/^#/, "").trim();
  if (!hex || !/^[0-9a-f]{6}$/i.test(hex)) return false;
  return artworkRelativeLuminance({
    red: Number.parseInt(hex.slice(0, 2), 16),
    green: Number.parseInt(hex.slice(2, 4), 16),
    blue: Number.parseInt(hex.slice(4, 6), 16),
  }) > 0.179;
}

function artworkHsl({ red, green, blue }: ArtworkRgb) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { hue: 0, saturation: 0, lightness };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  const hue =
    max === r
      ? ((g - b) / delta) % 6
      : max === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4;
  return { hue: (hue * 60 + 360) % 360, saturation, lightness };
}

function artworkHslToRgb(
  hue: number,
  saturation: number,
  lightness: number,
): ArtworkRgb {
  if (saturation === 0) {
    const channel = Math.round(lightness * 255);
    return { red: channel, green: channel, blue: channel };
  }

  const normalizedHue = hue / 360;
  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const hueToChannel = (value: number) => {
    const normalized = (value + 1) % 1;
    if (normalized < 1 / 6) return p + (q - p) * 6 * normalized;
    if (normalized < 1 / 2) return q;
    if (normalized < 2 / 3) return p + (q - p) * (2 / 3 - normalized) * 6;
    return p;
  };

  return {
    red: Math.round(hueToChannel(normalizedHue + 1 / 3) * 255),
    green: Math.round(hueToChannel(normalizedHue) * 255),
    blue: Math.round(hueToChannel(normalizedHue - 1 / 3) * 255),
  };
}

function toneArtworkThemeColor(color: ArtworkRgb): ArtworkRgb {
  const { hue, saturation, lightness } = artworkHsl(color);
  if (artworkRelativeLuminance(color) <= 0.179) return color;

  const adjustment = lightness > 0.72 ? 0.12 : 0.08;

  return artworkHslToRgb(
    hue,
    saturation,
    Math.min(1, Math.max(0, lightness + adjustment)),
  );
}

function artworkLab({ red, green, blue }: ArtworkRgb): ArtworkLab {
  const linear = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  const r = linear(red);
  const g = linear(green);
  const b = linear(blue);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function artworkBuckets(samples: ArtworkThemeSample[]) {
  const buckets = new Map<string, ArtworkBucket>();
  for (const sample of samples) {
    const lab = artworkLab(sample);
    const key = `${Math.round(lab.l / 0.055)}:${Math.round((lab.a + 0.4) / 0.05)}:${Math.round((lab.b + 0.4) / 0.05)}`;
    const bucket = buckets.get(key) ?? { red: 0, green: 0, blue: 0, l: 0, a: 0, b: 0, count: 0, edgeCount: 0, cornerCount: 0, edgeMask: 0 };
    bucket.red += sample.red;
    bucket.green += sample.green;
    bucket.blue += sample.blue;
    bucket.l += lab.l;
    bucket.a += lab.a;
    bucket.b += lab.b;
    bucket.count += 1;
    bucket.edgeCount += Number(sample.isEdge);
    bucket.cornerCount += Number(sample.isCorner);
    bucket.edgeMask |= sample.edgeMask ?? 0;
    buckets.set(key, bucket);
  }
  return [...buckets.values()].map((bucket) => ({
    ...bucket,
    red: bucket.red / bucket.count,
    green: bucket.green / bucket.count,
    blue: bucket.blue / bucket.count,
    l: bucket.l / bucket.count,
    a: bucket.a / bucket.count,
    b: bucket.b / bucket.count,
  }));
}

function artworkCoverage(mask: number) {
  let count = 0;
  for (let value = mask; value > 0; value >>= 1) count += value & 1;
  return count;
}

function artworkRgbHex({ red, green, blue }: ArtworkRgb) {
  const channel = (value: number) =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

/** Stable edge-weighted selection that gently brightens only already-light artwork. */
export function selectArtworkThemeColor(samples: ArtworkThemeSample[]) {
  if (!samples.length) return ARTWORK_NEUTRAL_COLOR;
  const edgeCount = samples.filter((sample) => sample.isEdge).length;
  const cornerCount = samples.filter((sample) => sample.isCorner).length;
  const candidates = artworkBuckets(samples);
  if (!edgeCount || !candidates.length) return ARTWORK_NEUTRAL_COLOR;
  const score = (bucket: ArtworkBucket) => {
    const chroma = Math.min(1, Math.hypot(bucket.a, bucket.b) / 0.18);
    return bucket.edgeCount / edgeCount * 0.46 + bucket.count / samples.length * 0.24 + bucket.cornerCount / Math.max(cornerCount, 1) * 0.14 + artworkCoverage(bucket.edgeMask) / 4 * 0.1 + chroma * 0.06;
  };
  const neutralWinner = candidates.reduce((best, candidate) =>
    score(candidate) > score(best) ? candidate : best,
  );
  const thematicWinner = candidates
    .filter((candidate) => {
      const { saturation, lightness } = artworkHsl(candidate);
      return saturation >= 0.1 && lightness > 0.035;
    })
    .reduce<ArtworkBucket | null>((best, candidate) => !best || score(candidate) > score(best) ? candidate : best, null);
  const winner = thematicWinner && score(thematicWinner) >= score(neutralWinner) * 0.55
    ? thematicWinner
    : neutralWinner;
  return artworkRgbHex(toneArtworkThemeColor(winner));
}

export interface SessionState {
  deviceId: string;
  ipAddress?: string;
  userAgent?: string;
  lastSeenAt: number;
}

export interface AuthState {
  isActive: boolean;
  role: UserRole;
  tokenVersion: number;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
}
