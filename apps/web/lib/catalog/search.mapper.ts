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
import { playSong } from "@/lib/player/play-song";
import { mapCatalogSong } from "./catalog.mapper";
import { mapCatalogMusicVideoCards } from "./music-video-cards";
import type { PlayerSong } from "@/lib/player/use-player-store";
import type { CatalogSearchShelfType } from "./catalog.api";

export type SearchResults = {
  hints: string[];
  ordered: MediaCardProps[];
  songs: MediaCardProps[];
  trackSongs: PlayerSong[];
  artists: MediaCardProps[];
  albums: MediaCardProps[];
  playlists: MediaCardProps[];
  musicVideos: MediaCardProps[];
  hasMore: boolean;
  shelfHasMore: Partial<Record<CatalogSearchShelfType, boolean>>;
  isEmpty: boolean;
};

function mapSong(
  response: CatalogResponse,
  song: CatalogSongResource,
): { card: MediaCardProps; track: PlayerSong } {
  const artists = catalogArtists(response, song.relationships.artists?.data);
  const albumReference = song.relationships.albums?.data[0];
  const releaseTrackId = albumReference?.meta?.releaseTrackId;
  const playbackSong = mapCatalogSong(response, song, {
    albumId: albumReference?.id,
  });

  return {
    card: createMediaResourceCard(
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
      onPlay: () => playSong(playbackSong),
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
    ),
    track: playbackSong,
  };
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

// Preserve the API's ranked order for Top Results while exposing each media
// type as a separate shelf.
export function mapSearchResults(
  response: CatalogResponse & {
    hints?: string[];
    shelfHasMore?: Partial<Record<CatalogSearchShelfType, boolean>>;
  },
): SearchResults {
  const songs: MediaCardProps[] = [];
  const trackSongs: PlayerSong[] = [];
  const artists: MediaCardProps[] = [];
  const albums: MediaCardProps[] = [];
  const playlists: MediaCardProps[] = [];
  const musicVideos = mapCatalogMusicVideoCards(response.musicVideos ?? [], {
    artistShelf: false,
  });
  const ordered: MediaCardProps[] = [];

  for (const reference of response.data) {
    if (reference.type === "songs") {
      const song = response.resources.songs[reference.id];
      if (song) {
        const { card, track } = mapSong(response, song);
        songs.push(card);
        trackSongs.push(track);
        ordered.push(card);
      }
    } else if (reference.type === "artists") {
      const artist = response.resources.artists[reference.id];
      if (artist) {
        const card = mapArtist(artist);
        artists.push(card);
        ordered.push(card);
      }
    } else if (reference.type === "albums") {
      const album = response.resources.albums[reference.id];
      if (album) {
        const card = mapAlbum(
          album,
          catalogArtists(response, album.relationships.artists?.data),
        );
        albums.push(card);
        ordered.push(card);
      }
    } else if (reference.type === "playlists") {
      const playlist = response.resources.playlists[reference.id];
      if (playlist) {
        const card = mapPlaylist(playlist);
        playlists.push(card);
        ordered.push(card);
      }
    }
  }

  return {
    hints: response.hints ?? [],
    ordered,
    songs,
    trackSongs,
    artists,
    albums,
    playlists,
    musicVideos,
    hasMore: response.hasMore ?? false,
    shelfHasMore: response.shelfHasMore ?? {},
    isEmpty:
      !songs.length && !artists.length && !albums.length && !playlists.length,
  };
}
