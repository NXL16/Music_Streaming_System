import sharp from 'sharp';

/** Shared with both Station renderers; keep preview implementations in sync. */
export async function detectStationArtworkBackgroundColor(
  source: Buffer,
): Promise<string> {
  const { data } = await sharp(source)
    .rotate()
    .resize(72, 72, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const buckets = new Map<string, number>();
  for (let index = 0; index < data.length; index += 16) {
    const [red, green, blue, alpha] = [
      data[index],
      data[index + 1],
      data[index + 2],
      data[index + 3],
    ];
    if (alpha < 220) continue;
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const lightness = (maximum + minimum) / 510;
    if (lightness < 0.22 || lightness > 0.9) continue;
    const saturation = maximum === 0 ? 0 : (maximum - minimum) / maximum;
    const key = [red, green, blue]
      .map((channel) => Math.min(255, Math.floor(channel / 24) * 24 + 12))
      .join(',');
    buckets.set(key, (buckets.get(key) || 0) + 1 + saturation * 5);
  }
  const winner = [...buckets.entries()].sort(
    (left, right) => right[1] - left[1],
  )[0];
  if (!winner) return '#808080';
  return vividHue(
    ...(winner[0].split(',').map(Number) as [number, number, number]),
  );
}

export function stationArtworkBackgroundSvg(color: string): string {
  const top = darken(color, 0.52);
  const middle = darken(color, 0.2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><defs><linearGradient id="background" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${top}"/><stop offset=".48" stop-color="${middle}"/><stop offset="1" stop-color="${color}"/></linearGradient></defs><rect width="1080" height="1080" fill="url(#background)"/><text x="1028" y="48" text-anchor="end" dominant-baseline="hanging" fill="rgba(255,255,255,.86)" font-family="Inter,Arial,sans-serif" font-size="58" font-weight="700">404Hz</text></svg>`;
}

function vividHue(red: number, green: number, blue: number): string {
  const channels = [red, green, blue].map((channel) => channel / 255);
  const maximum = Math.max(...channels);
  const minimum = Math.min(...channels);
  const chroma = maximum - minimum;
  if (chroma === 0) return '#808080';
  const [r, g, b] = channels;
  const hue =
    (60 *
      (maximum === r
        ? ((g - b) / chroma) % 6
        : maximum === g
          ? (b - r) / chroma + 2
          : (r - g) / chroma + 4) +
      360) %
    360;
  const segment = hue / 60;
  const secondary = 1 - Math.abs((segment % 2) - 1);
  const brightness = 0.86;
  const saturation = 0.81;
  const rgb = [
    segment < 1
      ? 1
      : segment < 2
        ? secondary
        : segment < 4
          ? 0
          : segment < 5
            ? secondary
            : 1,
    segment < 1 ? secondary : segment < 3 ? 1 : segment < 4 ? secondary : 0,
    segment < 2 ? 0 : segment < 3 ? secondary : segment < 5 ? 1 : secondary,
  ];
  return `#${rgb
    .map((value) =>
      Math.round(brightness * (1 - saturation + value * saturation) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`.toUpperCase();
}

function darken(color: string, amount: number): string {
  const value = color.replace('#', '');
  return `rgb(${[0, 2, 4].map((offset) => Math.round(Number.parseInt(value.slice(offset, offset + 2), 16) * (1 - amount))).join(',')})`;
}
