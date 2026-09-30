import { describe, expect, it } from "vitest";
import { createPageThemeStyle, isLightPageTheme } from "./page-theme-style";

describe("createPageThemeStyle", () => {
  it("subtracts ten from every shelf channel", () => {
    const style = createPageThemeStyle("#2e2e2e") as Record<string, string>;
    expect(style).toMatchObject({
      "--joe-color": "#2e2e2e",
      "--opaqueShelfBG-blended-plusD": "#242424",
    });
  });

  it("uses the same shelf reduction for light artwork", () => {
    const style = createPageThemeStyle("#f6cecd") as Record<string, string>;
    expect(style).toMatchObject({
      "--opaqueShelfBG-blended-plusD": "#ecc4c3",
      "--systemSecondary-vibrantOnLight-blended-plusD": "#684a48",
      "--systemTertiary-vibrantOnLight-blended-plusD": "#7b5656",
      "--labelDivider-vibrantOnLight-blended-plusD": "#d39492",
    });
  });

  it("keeps deep vivid artwork hue across the dark label hierarchy", () => {
    const style = createPageThemeStyle("#002e5e") as Record<string, string>;

    expect(style).toMatchObject({
      "--joe-color": "#002e5e",
      "--opaqueShelfBG-blended-plusD": "#002454",
      "--systemSecondary-vibrantOnDark-blended-plusL": "#a1cfff",
      "--systemTertiary-vibrantOnDark-blended-plusL": "#6e9cd1",
      "--labelDivider-vibrantOnDark-blended-plusL": "#2177d1",
    });
  });

  it("matches the dark compositing sequence", () => {
    const style = createPageThemeStyle("#44080b") as Record<string, string>;

    expect(style).toMatchObject({
      "--opaqueShelfBG-blended-plusD": "#3a0001",
      "--systemSecondary-vibrantOnDark-blended-plusL": "#e5a9b1",
      "--systemTertiary-vibrantOnDark-blended-plusL": "#b2767e",
      "--labelDivider-vibrantOnDark-blended-plusL": "#a03036",
    });
  });

  it("uses light mode for white", () => {
    const style = createPageThemeStyle("#ffffff") as Record<string, string>;
    expect(style).toMatchObject({
      "--joe-color": "#ffffff",
      "--opaqueShelfBG-blended-plusD": "#f5f5f5",
      "--systemSecondary-vibrantOnLight-blended-plusD": "#707070",
      "--systemTertiary-vibrantOnLight-blended-plusD": "#858585",
      "--labelDivider-vibrantOnLight-blended-plusD": "#e3e3e3",
    });
  });

  it("selects mode by readable text contrast, not an arbitrary midpoint", () => {
    expect(isLightPageTheme("#ff0000")).toBe(true);
    expect(isLightPageTheme("#003360")).toBe(false);
    expect(isLightPageTheme("#050505")).toBe(false);
  });
});
