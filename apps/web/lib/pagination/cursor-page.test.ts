import { describe, expect, it } from "vitest";
import { appendUniqueById, getSafeNextCursor } from "./cursor-page";

describe("cursor page guards", () => {
  it("deduplicates overlapping page boundaries while preserving order", () => {
    expect(
      appendUniqueById([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }]),
    ).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
  });

  it("accepts each non-empty cursor only once", () => {
    const seen = new Set<string>();
    expect(getSafeNextCursor({ hasMore: true, nextCursor: "next" }, seen)).toBe(
      "next",
    );
    expect(getSafeNextCursor({ hasMore: true, nextCursor: "next" }, seen)).toBe(
      "",
    );
  });

  it("stops on no-more, empty, or malformed cursor metadata", () => {
    const seen = new Set<string>();
    expect(
      getSafeNextCursor({ hasMore: false, nextCursor: "next" }, seen),
    ).toBe("");
    expect(getSafeNextCursor({ hasMore: true, nextCursor: "  " }, seen)).toBe(
      "",
    );
    expect(getSafeNextCursor({ hasMore: true }, seen)).toBe("");
  });
});
