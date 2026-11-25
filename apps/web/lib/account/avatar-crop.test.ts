import { describe, expect, it } from "vitest";
import {
  clampCropOffset,
  getCoverDimensions,
  getRotatedDimensions,
  normalizeRotation,
} from "./avatar-crop";

describe("avatar-crop math", () => {
  it("normalizes rotation into 90-degree quadrants", () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(90)).toBe(90);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(-90)).toBe(270);
  });

  it("swaps width and height for 90 and 270 degree rotations", () => {
    expect(getRotatedDimensions({ width: 1600, height: 900 }, 0)).toEqual({
      width: 1600,
      height: 900,
    });
    expect(getRotatedDimensions({ width: 1600, height: 900 }, 90)).toEqual({
      width: 900,
      height: 1600,
    });
  });

  it("scales rotated image to cover the crop diameter at zoom = 1", () => {
    const cover = getCoverDimensions({ width: 1600, height: 800 }, 240, 0);
    expect(cover).toEqual({ width: 480, height: 240 });

    const rotatedCover = getCoverDimensions(
      { width: 1600, height: 800 },
      240,
      90,
    );
    expect(rotatedCover).toEqual({ width: 240, height: 480 });
  });

  it("clamps pan offsets within available overflow at current zoom", () => {
    // At zoom = 1 on 1600x800, cover is 480x240 for a 240px circle:
    // horizontal overflow is (480 - 240) / 2 = 120px, vertical overflow is 0px.
    expect(
      clampCropOffset(
        { x: 200, y: 50 },
        { width: 1600, height: 800 },
        240,
        1,
        0,
      ),
    ).toEqual({ x: 120, y: 0 });

    expect(
      clampCropOffset(
        { x: -200, y: -50 },
        { width: 1600, height: 800 },
        240,
        2,
        0,
      ),
    ).toEqual({ x: -200, y: -50 });
  });
});
