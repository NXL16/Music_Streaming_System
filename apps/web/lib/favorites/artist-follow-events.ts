export const ARTIST_FOLLOW_CHANGED_EVENT = "artist-follow-changed";

export type ArtistFollowChangedDetail = {
  artistId: string;
  isFollowed: boolean;
};

const ARTIST_FOLLOW_SYNC_CHANNEL = "artist-follow-changes";

const artistFollowSyncChannel =
  typeof window !== "undefined" && "BroadcastChannel" in window
    ? new BroadcastChannel(ARTIST_FOLLOW_SYNC_CHANNEL)
    : null;

function dispatchArtistFollowChanged(detail: ArtistFollowChangedDetail) {
  window.dispatchEvent(
    new CustomEvent<ArtistFollowChangedDetail>(ARTIST_FOLLOW_CHANGED_EVENT, {
      detail,
    }),
  );
}

if (artistFollowSyncChannel) {
  artistFollowSyncChannel.onmessage = (
    event: MessageEvent<ArtistFollowChangedDetail>,
  ) => {
    const detail = event.data;
    if (!detail?.artistId || typeof detail.isFollowed !== "boolean") return;
    dispatchArtistFollowChanged(detail);
  };
}

export function notifyArtistFollowChanged(
  artistId: string,
  isFollowed: boolean,
) {
  const detail = { artistId, isFollowed };
  dispatchArtistFollowChanged(detail);
  artistFollowSyncChannel?.postMessage(detail);
}

export function subscribeArtistFollowChanges(
  listener: (detail: ArtistFollowChangedDetail) => void,
) {
  const handleChange = (event: Event) => {
    listener((event as CustomEvent<ArtistFollowChangedDetail>).detail);
  };
  window.addEventListener(ARTIST_FOLLOW_CHANGED_EVENT, handleChange);
  return () =>
    window.removeEventListener(ARTIST_FOLLOW_CHANGED_EVENT, handleChange);
}
