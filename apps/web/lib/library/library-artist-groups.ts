import type { LibraryMediaCardResource } from "./library-resources.api";
import { projectLinkedArtists } from "@/lib/media/project-linked-artists";
import type { CatalogArtwork } from "@/lib/catalog/catalog.types";
import type { FollowedArtist } from "@/lib/favorites/artist-follow.api";

type LibraryArtistGroup = {
  id: string;
  title: string;
  artists: ReturnType<typeof projectLinkedArtists>;
  artwork?: CatalogArtwork;
  albums: LibraryMediaCardResource[];
};

export function groupLibraryAlbumsByArtists(
  resources: LibraryMediaCardResource[],
  followedArtists: FollowedArtist[] = [],
): LibraryArtistGroup[] {
  const groups = new Map<string, LibraryArtistGroup>();
  const seenAlbums = new Set<string>();
  for (const album of resources) {
    if (album.resourceType !== "albums" || seenAlbums.has(album.resourceId))
      continue;
    seenAlbums.add(album.resourceId);
    const artists = projectLinkedArtists(album.primaryArtists ?? []);
    // Legacy display names cannot identify individual artists.
    const title = album.subtitle.trim() || "Unknown Artist";
    const credit = title.normalize("NFC").toLocaleLowerCase();
    let firstIndex = -1;
    artists.forEach((artist, index) => {
      const name = artist.name.trim().normalize("NFC").toLocaleLowerCase();
      if (
        credit.startsWith(name) &&
        /^(?:$|\s*(?:,|&|\band\b)\s*)/i.test(credit.slice(name.length)) &&
        (firstIndex < 0 || artist.name.length > artists[firstIndex].name.length)
      ) {
        firstIndex = index;
      }
    });
    if (firstIndex > 0) artists.unshift(...artists.splice(firstIndex, 1));
    const id = artists.length
      ? `artists:${JSON.stringify(artists.map((artist) => artist.id).sort())}`
      : `credit:${title.normalize("NFC").toLocaleLowerCase().replace(/\s+/g, " ")}`;
    const group = groups.get(id);
    if (group) {
      group.albums.push(album);
    } else {
      const artwork = album.primaryArtists?.find(
        (artist) => artist.id === artists[0]?.id,
      )?.artwork;
      groups.set(id, { id, title, artists, artwork, albums: [album] });
    }
  }
  for (const artist of followedArtists) {
    const id = `artists:${JSON.stringify([artist.id])}`;
    const group = groups.get(id);
    if (group) {
      group.artwork = artist.artwork ?? group.artwork;
    } else {
      groups.set(id, {
        id,
        title: artist.name,
        artists: projectLinkedArtists([artist]),
        artwork: artist.artwork,
        albums: [],
      });
    }
  }
  return [...groups.values()];
}
