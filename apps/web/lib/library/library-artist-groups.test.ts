import { describe, expect, it } from "vitest";
import { groupLibraryAlbumsByArtists } from "./library-artist-groups";
import type { LibraryMediaCardResource } from "./library-resources.api";

const a = { id: "a", name: "A", url: "a" };
const b = { id: "b", name: "B", url: "b" };
function album(id: string, primaryArtists = [a, b]): LibraryMediaCardResource {
  return {
    resourceType: "albums",
    resourceId: id,
    title: id,
    subtitle: primaryArtists.map((artist) => artist.name).join(" & "),
    artworkUrl: "",
    catalogUrl: "",
    contentRating: "",
    artists: [a, b],
    primaryArtists: primaryArtists.map((artist) => ({ ...artist })),
  };
}

describe("Library artist groups", () => {
  it("includes a followed artist without saved albums", () => {
    const [group] = groupLibraryAlbumsByArtists([], [a]);
    expect(group.title).toBe("A");
    expect(group.artists[0].id).toBe("a");
    expect(group.albums).toEqual([]);
  });
  it("merges a followed artist with their saved albums and keeps them after unfollowing", () => {
    const saved = album("x", [a]);
    const groups = groupLibraryAlbumsByArtists([saved], [a]);
    expect(groups).toHaveLength(1);
    expect(groups[0].albums.map((item) => item.resourceId)).toEqual(["x"]);
    expect(groupLibraryAlbumsByArtists([saved], [])).toHaveLength(1);
  });
  it("keeps solo favourites separate from collaborative album groups", () => {
    const groups = groupLibraryAlbumsByArtists([album("x")], [a]);
    expect(groups).toHaveLength(2);
    expect(groups[0].title).toBe("A & B");
    expect(groups[1].title).toBe("A");
    expect(groups[1].albums).toEqual([]);
  });
  it("puts a collaboration in one group and merges reversed credits", () => {
    const groups = groupLibraryAlbumsByArtists([
      { ...album("x"), subtitle: "A, B" },
      album("y", [b, a]),
      album("z", [a]),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].title).toBe("A, B");
    expect(groups[0].artists.map((artist) => artist.id)).toEqual(["a", "b"]);
    expect(groups[0].albums.map((item) => item.resourceId)).toEqual(["x", "y"]);
    expect(groups[1].albums.map((item) => item.resourceId)).toEqual(["z"]);
  });
  it("excludes contributors, deduplicates albums and ignores playlists", () => {
    const saved = album("x", [a]);
    const groups = groupLibraryAlbumsByArtists([
      saved,
      saved,
      { ...album("p"), resourceType: "playlists" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].artists.map((artist) => artist.id)).toEqual(["a"]);
    expect(groups[0].albums).toHaveLength(1);
  });
  it("uses IDs to distinguish artists with the same name", () => {
    expect(
      groupLibraryAlbumsByArtists([
        album("x", [a]),
        album("y", [{ ...a, id: "other-a" }]),
      ]),
    ).toHaveLength(2);
  });
  it("keeps legacy credits intact without promoting contributors", () => {
    const saved = album("x");
    delete saved.primaryArtists;
    const [group] = groupLibraryAlbumsByArtists([saved]);
    expect(group.title).toBe("A & B");
    expect(group.artists).toEqual([]);
  });
  it("does not merge distinct legacy artist credits by stripping accents or punctuation", () => {
    const resources = ["Hoa", "Hoà", "A & B", "A B"].map((subtitle, index) => ({
      ...album(String(index), []),
      subtitle,
    }));
    expect(groupLibraryAlbumsByArtists(resources)).toHaveLength(4);
  });
  it("keeps the first primary artist in credit order for the header link and menu", () => {
    const saved = album("x", [b, a]);
    const artistArtwork = {
      url: "artist-b.jpg",
      bgColor: "",
      textColor1: "",
      textColor2: "",
      textColor3: "",
      textColor4: "",
      width: 72,
      height: 72,
      hasP3: false,
    };
    saved.artwork = { ...artistArtwork, url: "album.jpg" };
    saved.primaryArtists![0].artwork = artistArtwork;
    saved.primaryArtists![1].artwork = {
      ...artistArtwork,
      url: "artist-a.jpg",
    };
    const [group] = groupLibraryAlbumsByArtists([saved]);
    expect(group.artists[0].id).toBe("b");
    expect(group.title).toBe("B & A");
    expect(group.artwork?.url).toBe("artist-b.jpg");
    delete saved.primaryArtists![0].artwork;
    expect(groupLibraryAlbumsByArtists([saved])[0].artwork).toBeUndefined();
  });
  it("uses the leading display artist for artwork, link and menu when primary IDs have a different order", () => {
    const saved = album("x", [a, b]);
    saved.subtitle = "B & A";
    const artwork = {
      url: "artist-a.jpg",
      bgColor: "",
      textColor1: "",
      textColor2: "",
      textColor3: "",
      textColor4: "",
      width: 72,
      height: 72,
      hasP3: false,
    };
    saved.primaryArtists = [
      { ...a, artwork },
      { ...b, artwork: { ...artwork, url: "artist-b.jpg" } },
    ];
    const [group] = groupLibraryAlbumsByArtists([saved]);
    expect(group.title).toBe("B & A");
    expect(group.artists[0]).toEqual({ ...b, url: "/artist/b/b" });
    expect(group.artwork?.url).toBe("artist-b.jpg");
    expect(group.albums).toEqual([saved]);
  });
  it.each([
    ["A & B", "A & B & C", "C"],
    ["Hoà", "Hoà & Hoa", "Hoa"],
    ["B Ray", "B Ray & B", "B"],
  ])(
    "matches the full leading artist name %s without splitting or fuzzy collisions",
    (name, subtitle, otherName) => {
      const saved = album("x", [
        { ...a, name: otherName },
        { ...b, name },
      ]);
      saved.subtitle = subtitle;
      expect(groupLibraryAlbumsByArtists([saved])[0].artists[0].id).toBe("b");
    },
  );
});
