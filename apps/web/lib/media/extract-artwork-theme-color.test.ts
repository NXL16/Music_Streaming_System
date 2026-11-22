import { afterEach, describe, expect, it, vi } from "vitest";
import {
  refineRuntimeArtworkThemeColor,
  selectArtworkThemeColor,
  type ArtworkThemeSample,
  extractArtworkThemeColor,
  getCachedArtworkThemeColor,
} from "./extract-artwork-theme-color";

afterEach(() => vi.unstubAllGlobals());

it("exposes the resolved artwork palette synchronously on the next visit", async () => {
  const pixels = new Uint8ClampedArray(64 * 64 * 4);
  for (let i = 0; i < pixels.length; i += 4)
    pixels.set([128, 128, 128, 255], i);
  const decode = vi.fn(async () => undefined);
  vi.stubGlobal("window", { location: { origin: "https://music.test" } });
  vi.stubGlobal(
    "Image",
    class {
      decode = decode;
    },
  );
  vi.stubGlobal("document", {
    createElement: () => ({
      getContext: () => ({
        drawImage: vi.fn(),
        getImageData: () => ({ data: pixels }),
      }),
    }),
  });
  const source = "https://images.test/cached-palette.png";
  expect(getCachedArtworkThemeColor(source)).toBeUndefined();
  const resolved = await extractArtworkThemeColor(source);
  expect(resolved).toMatch(/^#[0-9a-f]{6}$/);
  expect(getCachedArtworkThemeColor(source)).toBe(resolved);
  await extractArtworkThemeColor(source);
  expect(decode).toHaveBeenCalledTimes(1);
});

function samples(
  color: Omit<ArtworkThemeSample, "isEdge">,
  count: number,
  isEdge: boolean,
  edgeMask = isEdge ? 15 : 0,
) {
  return Array.from({ length: count }, () => ({ ...color, isEdge, edgeMask }));
}

describe("selectArtworkThemeColor", () => {
  it("keeps a white cover white", () => {
    expect(
      selectArtworkThemeColor(
        samples({ red: 255, green: 255, blue: 255 }, 64, true),
      ),
    ).toBe("#ffffff");
  });

  it("keeps a black cover black", () => {
    expect(
      selectArtworkThemeColor(samples({ red: 0, green: 0, blue: 0 }, 64, true)),
    ).toBe("#000000");
  });

  it("prioritizes a substantial colored edge over a different center color", () => {
    const border = samples({ red: 34, green: 94, blue: 180 }, 64, true);
    const center = samples({ red: 190, green: 38, blue: 50 }, 180, false);

    expect(selectArtworkThemeColor([...border, ...center])).toBe("#225eb4");
  });

  it("keeps a black border background over colorful center details", () => {
    const blackBorder = samples({ red: 0, green: 0, blue: 0 }, 80, true);
    const magentaCenter = samples(
      { red: 192, green: 20, blue: 133 },
      48,
      false,
    );

    expect(selectArtworkThemeColor([...blackBorder, ...magentaCenter])).toBe(
      "#000000",
    );
  });

  it("brightens a light azure border while preserving its hue", () => {
    expect(
      selectArtworkThemeColor(
        samples({ red: 0, green: 129, blue: 204 }, 64, true),
      ),
    ).toBe("#009bf5");
  });
});

describe("refineRuntimeArtworkThemeColor", () => {
  it("preserves neutral artwork exactly", () => {
    expect(refineRuntimeArtworkThemeColor("#ffffff")).toBe("#ffffff");
    expect(refineRuntimeArtworkThemeColor("#2c2c2e")).toBe("#2c2c2e");
  });

  it("tones down a vivid bright fallback without changing its hue family", () => {
    expect(refineRuntimeArtworkThemeColor("#ff6a00")).toBe("#b87647");
  });
});
