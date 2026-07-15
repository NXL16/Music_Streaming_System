import type { PlayerSong } from "@/lib/player/use-player-store";
import type {
  CatalogArtwork,
  CatalogResponse,
} from "./catalog.types";
import { artistRoute } from "./artist-route";
import {
  getArtworkRenditionUrl,
  getArtworkSrcSet,
} from "@/lib/media/artwork";
import { albumRoute } from "./album-route";
import { songRoute } from "./song-route";

export function catalogArtworkUrl(
  artwork: CatalogArtwork | undefined,
  size: number,
) {
  return getArtworkRenditionUrl(artwork, size);
}

export function catalogArtworkSrcSet(
  artwork: CatalogArtwork | undefined,
  widths: number[],
): string {
  return getArtworkSrcSet(artwork, widths);
}

export function mapCatalogTracks(response: CatalogResponse): PlayerSong[] {
  const directTracks = response.data.filter(
    (reference) => reference.type === "songs",
  );
  const root = response.data[0];
  const relationshipTracks =
    root?.type === "albums"
      ? response.resources.albums[root.id]?.relationships.tracks?.data
      : root?.type === "playlists"
        ? response.resources.playlists[root.id]?.relationships.tracks?.data
        : undefined;
  const orderedTracks =
    directTracks.length > 0 ? directTracks : (relationshipTracks ?? []);
  // A song may belong to an album and a separate Single. When this mapper is
  // called for an album endpoint, that root album is the listener's playback
  // context; the song's first album relationship is only its canonical link.
  const contextAlbum =
    root?.type === "albums" ? response.resources.albums[root.id] : undefined;

  return orderedTracks.flatMap((reference) => {
    if (reference.type !== "songs") return [];
    const song = response.resources.songs[reference.id];
    if (!song) return [];

    const artists =
      song.relationships.artists?.data.flatMap((artistReference) => {
        const artist = response.resources.artists[artistReference.id];
        if (!artist) return [];

        return [
          {
            id: artist.id,
            name: artist.attributes.name,
            url: artistRoute(artist.attributes.url, artist.id),
          },
        ];
      }) ?? [];
    const albumReference = song.relationships.albums?.data[0];
    const album = albumReference
      ? response.resources.albums[albumReference.id]
      : undefined;
    const playbackAlbum = contextAlbum ?? album;
    const playbackAlbumId = playbackAlbum?.id ?? albumReference?.id;
    const playbackAlbumUrl = playbackAlbum?.attributes.url;
    const playbackArtwork =
      contextAlbum?.attributes.artwork ??
      album?.attributes.artwork ??
      song.attributes.artwork;

    return [
      {
        id: song.id,
        title: song.attributes.name,
        url: songRoute(song.id),
        artist: song.attributes.artistName,
        artists,
        album: playbackAlbum?.attributes.name ?? song.attributes.albumName,
        albumId: playbackAlbumId,
        albumUrl:
          playbackAlbumId && playbackAlbumUrl
            ? albumRoute(playbackAlbumUrl, playbackAlbumId)
            : undefined,
        durationSec: Math.round(song.attributes.durationInMillis / 1000),
        artworkUrl: catalogArtworkUrl(playbackArtwork, 316),
        artworkSrcSet: catalogArtworkSrcSet(playbackArtwork, [
          296,
          316,
          592,
          632,
        ]),
        thumbnailArtworkSrcSet: catalogArtworkSrcSet(playbackArtwork, [40, 80]),
        artworkBgColor: playbackArtwork?.bgColor
          ? `#${playbackArtwork.bgColor.replace(/^#/, "")}`
          : undefined,
        releaseDate: song.attributes.releaseDate,
        contentRating: song.attributes.contentRating,
        playbackUrl: `mse:${song.id}`,
      },
    ];
  });
}
