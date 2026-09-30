import type { MediaCardProps } from "@/lib/media/media-card.types";
import type {
  CatalogAlbumResource,
  CatalogArtistResource,
  CatalogPlaylistResource,
  CatalogResponse,
  CatalogSongResource,
} from "./catalog.types";
import { formatArtistNames } from "@/lib/media/artist-names";
import { formatReleaseYear } from "@/lib/format/release-date";
import { createMediaResourceCard } from "@/lib/media/normalize-media-resource";
import { catalogArtists, catalogArtistsFromResources } from "./catalog-artists";
import { songRoute } from "./song-route";
import { projectPlayerSong } from "@/lib/songs/project-song-summary";
import { usePlayerStore } from "@/lib/player/use-player-store";

export type SearchResults = {
  songs: MediaCardProps[];
  artists: MediaCardProps[];
  albums: MediaCardProps[];
  playlists: MediaCardProps[];
  isEmpty: boolean;
};

function mapSong(
  response: CatalogResponse,
  song: CatalogSongResource,
): MediaCardProps {
  const artists = catalogArtists(response, song.relationships.artists?.data);
  const albumReference = song.relationships.albums?.data[0];
  const releaseTrackId = albumReference?.meta?.releaseTrackId;
  const playbackSong = projectPlayerSong({
    id: song.id,
    releaseTrackId,
    title: song.attributes.name,
    artist: formatArtistNames(song.attributes.artistName),
    artists,
    album: song.attributes.albumName,
    albumId: albumReference?.id,
    hasLyrics: song.attributes.hasLyrics,
    durationSec: Math.round(song.attributes.durationInMillis / 1000),
    artworkUrl: song.attributes.artwork?.url,
    releaseDate: song.attributes.releaseDate,
    contentRating: song.attributes.contentRating,
  });

  return createMediaResourceCard(
    {
      id: song.id,
      type: "songs",
      name: song.attributes.name,
      artistName: formatArtistNames(song.attributes.artistName),
      artwork: song.attributes.artwork,
    },
    {
      cardType: "collection",
      artists,
      slug: releaseTrackId
        ? songRoute(song.attributes.name, releaseTrackId)
        : undefined,
      onPlay: () => usePlayerStore.getState().setQueue([playbackSong]),
      menuContext: {
        kind: "song",
        songId: song.id,
        releaseTrackId,
        title: song.attributes.name,
        subtitle: formatArtistNames(song.attributes.artistName),
        artworkUrl: playbackSong.artworkUrl,
        sourceAlbumId: albumReference?.id,
        albumHref: playbackSong.albumUrl,
      },
    },
  );
}

function mapArtist(artist: CatalogArtistResource): MediaCardProps {
  return createMediaResourceCard(
    {
      id: artist.id,
      type: "artists",
      name: artist.attributes.name,
      url: artist.attributes.url,
      artwork: artist.attributes.artwork,
    },
    { cardType: "circle", subtitle: "Nghệ sĩ" },
  );
}

export function mapCatalogArtists(response: CatalogResponse): MediaCardProps[] {
  return response.data.flatMap((reference) => {
    if (reference.type !== "artists") return [];
    const artist = response.resources.artists[reference.id];
    return artist ? [mapArtist(artist)] : [];
  });
}

function mapAlbum(
  album: CatalogAlbumResource,
  artists?: MediaCardProps["artists"],
): MediaCardProps {
  return createMediaResourceCard(
    {
      id: album.id,
      type: "albums",
      name: album.attributes.name,
      url: album.attributes.url,
      artistName: formatArtistNames(album.attributes.artistName),
      artwork: album.attributes.artwork,
      contentRating: album.attributes.contentRating,
    },
    {
      cardType: "collection",
      artists,
    },
  );
}

function mapPlaylist(playlist: CatalogPlaylistResource): MediaCardProps {
  return createMediaResourceCard(
    {
      id: playlist.id,
      type: "playlists",
      name: playlist.attributes.name,
      url: playlist.attributes.url,
      curatorName: playlist.attributes.curatorName || "Playlist",
      artwork: playlist.attributes.artwork,
    },
    { cardType: "collection" },
  );
}

type CatalogAlbumCardOptions = {
  subtitle?: (album: CatalogAlbumResource) => string;
};

export const catalogAlbumReleaseYearCardOptions: CatalogAlbumCardOptions = {
  subtitle: (album) => formatReleaseYear(album.attributes.releaseDate),
};

export function mapCatalogAlbums(
  response: CatalogResponse,
  options: CatalogAlbumCardOptions = {},
): MediaCardProps[] {
  return response.data.flatMap((reference) => {
    if (reference.type !== "albums") return [];
    const album = response.resources.albums[reference.id];
    if (!album) return [];

    const card = mapAlbum(
      album,
      catalogArtists(response, album.relationships.artists?.data),
    );
    const subtitle = options.subtitle?.(album);

    return [
      subtitle === undefined ? card : { ...card, subtitle, artists: undefined },
    ];
  });
}

export function mapCatalogAlbumResources(
  albums: CatalogAlbumResource[],
  options: CatalogAlbumCardOptions = {},
  artistResources?: Record<string, CatalogArtistResource>,
): MediaCardProps[] {
  return albums.map((album) => {
    const card = mapAlbum(
      album,
      artistResources
        ? catalogArtistsFromResources(
            artistResources,
            album.relationships.artists?.data,
          )
        : undefined,
    );
    const subtitle = options.subtitle?.(album);

    return subtitle === undefined
      ? card
      : { ...card, subtitle, artists: undefined };
  });
}

export function mapCatalogPlaylists(
  response: CatalogResponse,
): MediaCardProps[] {
  return response.data.flatMap((reference) => {
    if (reference.type !== "playlists") return [];
    const playlist = response.resources.playlists[reference.id];
    return playlist ? [mapPlaylist(playlist)] : [];
  });
}

// The search response groups references in `data` (songs → artists → albums
// → playlists). Preserve that ordering per group while pulling the full
// resource from the `resources` maps.
export function mapSearchResults(response: CatalogResponse): SearchResults {
  const songs: MediaCardProps[] = [];
  const artists: MediaCardProps[] = [];
  const albums: MediaCardProps[] = [];
  const playlists: MediaCardProps[] = [];

  for (const reference of response.data) {
    if (reference.type === "songs") {
      const song = response.resources.songs[reference.id];
      if (song) songs.push(mapSong(response, song));
    } else if (reference.type === "artists") {
      const artist = response.resources.artists[reference.id];
      if (artist) artists.push(mapArtist(artist));
    } else if (reference.type === "albums") {
      const album = response.resources.albums[reference.id];
      if (album) {
        albums.push(
          mapAlbum(
            album,
            catalogArtists(response, album.relationships.artists?.data),
          ),
        );
      }
    } else if (reference.type === "playlists") {
      const playlist = response.resources.playlists[reference.id];
      if (playlist) playlists.push(mapPlaylist(playlist));
    }
  }

  return {
    songs,
    artists,
    albums,
    playlists,
    isEmpty:
      !songs.length && !artists.length && !albums.length && !playlists.length,
  };
}
