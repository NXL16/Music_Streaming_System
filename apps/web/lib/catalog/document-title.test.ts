import { describe, expect, it } from "vitest";
import {
  formatAlbumDocumentTitle,
  formatArtistDocumentTitle,
  formatPlaylistDocumentTitle,
  formatSongDocumentTitle,
} from "./document-title";

describe("formatAlbumDocumentTitle", () => {
  it("formats standard album, single, and EP titles with artist", () => {
    expect(
      formatAlbumDocumentTitle({
        name: "ABC",
        artistName: "Artist XYZ",
        releaseType: "album",
      }),
    ).toBe("ABC - Album by Artist XYZ - 404hz Melodies");

    expect(
      formatAlbumDocumentTitle({
        name: "ABC - Single",
        artistName: "Artist XYZ",
        releaseType: "single",
      }),
    ).toBe("ABC - Single - Album by Artist XYZ - 404hz Melodies");

    expect(
      formatAlbumDocumentTitle({
        name: "ABC",
        artistName: "Artist XYZ",
        releaseType: "single",
      }),
    ).toBe("ABC - Single - Album by Artist XYZ - 404hz Melodies");

    expect(
      formatAlbumDocumentTitle({
        name: "ABC",
        artistName: "Artist XYZ",
        releaseType: "ep",
      }),
    ).toBe("ABC - EP - Album by Artist XYZ - 404hz Melodies");
  });

  it("falls back cleanly when artist is missing or name is empty", () => {
    expect(
      formatAlbumDocumentTitle({
        name: "ABC",
        artistName: "",
        releaseType: "album",
      }),
    ).toBe("ABC - 404hz Melodies");

    expect(formatAlbumDocumentTitle({ name: "   " })).toBeNull();
  });
});

describe("formatPlaylistDocumentTitle", () => {
  it("formats playlist title and ignores empty names", () => {
    expect(formatPlaylistDocumentTitle("ABC")).toBe(
      "ABC - Playlist - 404hz Melodies",
    );
    expect(formatPlaylistDocumentTitle("   ")).toBeNull();
  });
});

describe("formatSongDocumentTitle", () => {
  it("formats song title with primary artist and falls back when missing", () => {
    expect(
      formatSongDocumentTitle({
        title: "MỘT NGÀY NÀO ĐÓ",
        artistName: "Hoàng Dũng, Đen & Bạn Nhạc.",
      }),
    ).toBe(
      "MỘT NGÀY NÀO ĐÓ - Song with Lyric by Hoàng Dũng, Đen & Bạn Nhạc. - 404hz Melodies",
    );

    expect(formatSongDocumentTitle({ title: "ABC", artistName: "" })).toBe(
      "ABC - 404hz Melodies",
    );
    expect(formatSongDocumentTitle({ title: "" })).toBeNull();
  });
});

describe("formatArtistDocumentTitle", () => {
  it("formats artist title and ignores empty names", () => {
    expect(formatArtistDocumentTitle("Hoàng Dũng")).toBe(
      "Hoàng Dũng - 404hz Melodies",
    );
    expect(formatArtistDocumentTitle("")).toBeNull();
  });
});
