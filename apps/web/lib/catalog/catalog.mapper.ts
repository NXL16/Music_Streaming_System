import type { PlayerSong } from "@/lib/player/use-player-store";
import { projectPlayerSong } from "@/lib/songs/project-song-summary";
import type { CatalogArtwork, CatalogResponse } from "./catalog.types";
import {
  getArtworkRenditionUrl,
  getArtworkSrcSet,
  type ArtworkVariant,
} from "@/lib/media/artwork";
import { catalogArtists } from "./catalog-artists";
import { artistRoute } from "./artist-route";

export function catalogArtworkUrl(
  artwork: CatalogArtwork | undefined,
  size: number,
) {
  return getArtworkRenditionUrl(artwork, size);
}

export function catalogArtworkSrcSet(
  artwork: CatalogArtwork | undefined,
  widths: number[],
  variant: ArtworkVariant = "default",
): string {
  return getArtworkSrcSet(artwork, widths, variant);
}

type CatalogSongProjectionOptions = {
  albumId?: string;
  contextAlbumId?: string;
  releaseTrackId?: string;
};

/** Projects one catalog Song into the shared PlayerSong contract. */
export function mapCatalogSong(
  response: CatalogResponse,
  song: CatalogResponse["resources"]["songs"][string],
  options: CatalogSongProjectionOptions = {},
): PlayerSong {
  const artists = catalogArtists(response, song.relationships.artists?.data);
  const albumReferences = song.relationships.albums?.data ?? [];
  const albumReference = albumReferences[0];
  const contextAlbum = options.contextAlbumId
    ? response.resources.albums[options.contextAlbumId]
    : undefined;
  const requestedAlbum = options.albumId
    ? response.resources.albums[options.albumId]
    : undefined;
  const album = albumReference
    ? response.resources.albums[albumReference.id]
    : undefined;
  const playbackAlbum = contextAlbum ?? requestedAlbum ?? album;
  const playbackAlbumId = playbackAlbum?.id ?? albumReference?.id;
  const releaseTrackId =
    options.releaseTrackId ??
    albumReferences.find((item) => item.id === playbackAlbumId)?.meta
      ?.releaseTrackId;
  const playbackArtwork =
    contextAlbum?.attributes.artwork ??
    playbackAlbum?.attributes.artwork ??
    song.attributes.artwork;

  return projectPlayerSong({
    id: song.id,
    releaseTrackId,
    title: song.attributes.name,
    artist: playbackAlbum?.attributes.artistName ?? song.attributes.artistName,
    songArtistName: song.attributes.artistName,
    artists,
    credits: [
      ...(song.attributes.credits ?? []).map((credit) => {
        const artist = response.resources.artists[credit.artistId];
        const artistUrl = credit.url ?? artist?.attributes.url;
        return {
          id: credit.artistId,
          name: credit.name,
          url: artistUrl ? artistRoute(artistUrl, credit.artistId) : undefined,
          role: credit.role,
          position: credit.position,
          isPrimary: credit.isPrimary,
          artworkUrl: catalogArtworkUrl(artist?.attributes.artwork, 80),
        };
      }),
      ...(song.attributes.contributorCredits ?? []),
    ],
    album: playbackAlbum?.attributes.name ?? song.attributes.albumName,
    albumId: playbackAlbumId,
    sourceAlbumId: playbackAlbumId,
    albumUrl: playbackAlbum?.attributes.url,
    albumVideoSrc: playbackAlbum?.attributes.editorialVideo?.primary?.video,
    hasLyrics: song.attributes.hasLyrics,
    durationSec: Math.round(song.attributes.durationInMillis / 1000),
    artworkUrl: catalogArtworkUrl(playbackArtwork, 316),
    mediaSessionArtworkUrl: catalogArtworkUrl(playbackArtwork, 632),
    artworkSrcSet: catalogArtworkSrcSet(playbackArtwork, [296, 316, 592, 632]),
    thumbnailArtworkSrcSet: catalogArtworkSrcSet(playbackArtwork, [40, 80]),
    artworkBgColor: playbackArtwork?.bgColor
      ? `#${playbackArtwork.bgColor.replace(/^#/, "")}`
      : undefined,
    releaseDate: song.attributes.releaseDate,
    contentRating: song.attributes.contentRating,
  });
}

export function mapCatalogTracks(
  response: CatalogResponse,
  options?: { albumId?: string },
): PlayerSong[] {
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
  const contextAlbumId = root?.type === "albums" ? root.id : undefined;

  return orderedTracks.flatMap((reference) => {
    if (reference.type !== "songs") return [];
    const song = response.resources.songs[reference.id];
    if (!song) return [];

    const albumReferences = song.relationships.albums?.data ?? [];
    const requestedAlbum = options?.albumId
      ? response.resources.albums[options.albumId]
      : undefined;
    // A supplied albumId is a navigation contract, not a hint. Reject it if
    // this song is not a track on that release instead of silently rendering
    // an unrelated first relationship.
    if (
      options?.albumId &&
      (!requestedAlbum ||
        !albumReferences.some((reference) => reference.id === options.albumId))
    ) {
      return [];
    }
    return [
      mapCatalogSong(response, song, {
        albumId: options?.albumId,
        contextAlbumId,
        releaseTrackId: reference.meta?.releaseTrackId,
      }),
    ];
  });
}
