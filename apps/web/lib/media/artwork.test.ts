import { describe, expect, it } from "vitest";
import { getArtworkSrcSet } from "./artwork";

describe("getArtworkSrcSet", () => {
  it("uses standard poster renditions when Hero-specific crops are absent", () => {
    const srcSet = getArtworkSrcSet(
      {
        url: "https://cdn.example/poster-2400w.webp",
        variants: {
          renditions: [
            { url: "https://cdn.example/poster-450w.webp", width: 450 },
            { url: "https://cdn.example/poster-600w.webp", width: 600 },
            { url: "https://cdn.example/poster-1200w.webp", width: 1200 },
          ],
        },
      },
      [450, 600, 900, 1200],
      "hero",
    );

    expect(srcSet).toBe(
      "https://cdn.example/poster-450w.webp 450w, https://cdn.example/poster-600w.webp 600w, https://cdn.example/poster-1200w.webp 1200w",
    );
  });

  it("prefers Hero-specific renditions when they exist", () => {
    const srcSet = getArtworkSrcSet(
      {
        url: "https://cdn.example/default.webp",
        variants: {
          renditions: [{ url: "https://cdn.example/default-600w.webp", width: 600 }],
          hero: {
            renditions: [{ url: "https://cdn.example/hero-600w.webp", width: 600 }],
          },
        },
      },
      [600],
      "hero",
    );

    expect(srcSet).toBe("https://cdn.example/hero-600w.webp 600w");
  });
});
