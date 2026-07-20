import type { MediaCardProps } from "@/components/media/media-card.types";
import type {
  CatalogAlbumResource,
  CatalogArtistResource,
  CatalogArtwork,
  CatalogResponse,
  CatalogSongResource,
} from "./catalog.types";
import { catalogArtworkSrcSet, catalogArtworkUrl } from "./catalog.mapper";
import { artistRoute } from "./artist-route";
import { albumRoute } from "./album-route";
import { songRoute } from "./song-route";
import { formatArtistNames } from "@/lib/media/artist-names";

export type SearchResults = {
  songs: MediaCardProps[];
  artists: MediaCardProps[];
  albums: MediaCardProps[];
  isEmpty: boolean;
};

const CARD_WIDTHS = [296, 316, 592, 632];

function artworkColor(artwork: CatalogArtwork | undefined) {
  const normalized = artwork?.bgColor?.replace(/^#/, "").trim();
  return normalized && /^[0-9a-f]{6}$/i.test(normalized)
    ? `#${normalized}`
    : "#2c2c2e";
}

function baseCard(
  id: string,
  resourceType: string,
  artwork: CatalogArtwork | undefined,
): Pick<
  MediaCardProps,
  "id" | "resourceId" | "resourceType" | "imageUrl" | "imageSrcSet" | "artworkColors"
> {
  const color = artworkColor(artwork);
  return {
    id: `${resourceType}-${id}`,
    resourceId: id,
    resourceType,
    imageUrl: catalogArtworkUrl(artwork, 316),
    imageSrcSet: catalogArtworkSrcSet(artwork, CARD_WIDTHS),
    artworkColors: { bg: color, main: color },
  };
}

function mapSong(song: CatalogSongResource): MediaCardProps {
  return {
    ...baseCard(song.id, "songs", song.attributes.artwork),
    cardType: "collection",
    title: song.attributes.name,
    subtitle: formatArtistNames(song.attributes.artistName),
    slug: songRoute(song.id),
    altText: song.attributes.name,
  };
}

function mapArtist(artist: CatalogArtistResource): MediaCardProps {
  const url = artist.attributes.url;
  return {
    ...baseCard(artist.id, "artists", artist.attributes.artwork),
    cardType: "circle",
    title: artist.attributes.name,
    subtitle: "Nghệ sĩ",
    slug: url ? artistRoute(url, artist.id) : undefined,
    altText: artist.attributes.name,
  };
}

function mapAlbum(album: CatalogAlbumResource): MediaCardProps {
  const url = album.attributes.url;
  return {
    ...baseCard(album.id, "albums", album.attributes.artwork),
    cardType: "collection",
    title: album.attributes.name,
    subtitle: formatArtistNames(album.attributes.artistName),
    slug: url ? albumRoute(url, album.id) : undefined,
    altText: album.attributes.name,
  };
}

// The search response groups references in `data` (songs → artists → albums).
// Preserve that ordering per group while pulling the full resource from the
// `resources` maps.
export function mapSearchResults(response: CatalogResponse): SearchResults {
  const songs: MediaCardProps[] = [];
  const artists: MediaCardProps[] = [];
  const albums: MediaCardProps[] = [];

  for (const reference of response.data) {
    if (reference.type === "songs") {
      const song = response.resources.songs[reference.id];
      if (song) songs.push(mapSong(song));
    } else if (reference.type === "artists") {
      const artist = response.resources.artists[reference.id];
      if (artist) artists.push(mapArtist(artist));
    } else if (reference.type === "albums") {
      const album = response.resources.albums[reference.id];
      if (album) albums.push(mapAlbum(album));
    }
  }

  return {
    songs,
    artists,
    albums,
    isEmpty: !songs.length && !artists.length && !albums.length,
  };
}
