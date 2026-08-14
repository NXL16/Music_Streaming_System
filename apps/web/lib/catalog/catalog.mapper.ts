import type { PlayerSong } from "@/lib/player/use-player-store";
import { projectPlayerSong } from "@/lib/songs/project-song-summary";
import type { CatalogArtwork, CatalogResponse } from "./catalog.types";
import { getArtworkRenditionUrl, getArtworkSrcSet } from "@/lib/media/artwork";
import { catalogArtists } from "./catalog-artists";

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

function mapTrackArtists(
  response: CatalogResponse,
  song: CatalogResponse["resources"]["songs"][string],
) {
  return catalogArtists(response, song.relationships.artists?.data);
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

    const artists = mapTrackArtists(response, song);
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
      projectPlayerSong({
        id: song.id,
        title: song.attributes.name,
        artist: song.attributes.artistName,
        artists,
        album: playbackAlbum?.attributes.name ?? song.attributes.albumName,
        albumId: playbackAlbumId,
        albumUrl: playbackAlbumUrl,
        albumVideoSrc:
          playbackAlbum?.attributes.editorialVideo?.primary?.video,
        hasLyrics: song.attributes.hasLyrics,
        durationSec: Math.round(song.attributes.durationInMillis / 1000),
        artworkUrl: catalogArtworkUrl(playbackArtwork, 316),
        artworkSrcSet: catalogArtworkSrcSet(
          playbackArtwork,
          [296, 316, 592, 632],
        ),
        thumbnailArtworkSrcSet: catalogArtworkSrcSet(playbackArtwork, [40, 80]),
        artworkBgColor: playbackArtwork?.bgColor
          ? `#${playbackArtwork.bgColor.replace(/^#/, "")}`
          : undefined,
        releaseDate: song.attributes.releaseDate,
        contentRating: song.attributes.contentRating,
      }),
    ];
  });
}
