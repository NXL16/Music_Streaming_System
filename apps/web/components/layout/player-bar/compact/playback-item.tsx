import AmpContextMenuButton from "@/components/custom-elements/AmpContextMenuButton";
import AmpLcdMetadata from "@/components/custom-elements/AmpLcdMetadata";
import CardArtwork from "@/components/media/common/card-artwork";
import { FavoriteActionButton } from "@/components/songs/favorite-action-button";
import { useAuthStore } from "@/lib/auth/auth-store";
import { toggleSongFavorite } from "@/lib/favorites/toggle-song-favorite";
import { useFavoriteStore } from "@/lib/favorites/use-favorite-store";
import { playerSongKey, PlayerSong } from "@/lib/player/use-player-store";
import dynamic from "next/dynamic";
import { useState } from "react";

const AmbientVideo = dynamic(
  () => import("@/components/custom-elements/AmpVideo"),
  { ssr: false, loading: () => null },
);

type PlaybackItemProps = {
  isPlaying: boolean;
  currentSong: PlayerSong | null;
  artworkSrcSet: string;
  variant?: "large" | "compact";
  onTogglePlayback?: () => void;
  closeModal: () => void;
};

export default function PlaybackItem({
  isPlaying,
  currentSong,
  artworkSrcSet,
  variant = "large",
  onTogglePlayback,
  closeModal,
}: PlaybackItemProps) {
  const artworkColor = currentSong?.artworkBgColor ?? "var(--genericJoeColor)";
  const artworkColors = { bg: artworkColor, main: artworkColor };
  const userId = useAuthStore((state) => state.user?.userId);
  const isCurrentSongFavorite = useFavoriteStore((state) =>
    currentSong ? state.songKeys.has(playerSongKey(currentSong)) : false,
  );

  const [isFavoriteSaving, setIsFavoriteSaving] = useState(false);
  const ArtworkWrapper = onTogglePlayback ? "button" : "div";

  const handleFavoriteClick = async () => {
    if (!currentSong || isFavoriteSaving) return;

    setIsFavoriteSaving(true);
    try {
      await toggleSongFavorite(
        currentSong.id,
        currentSong.sourceAlbumId ?? currentSong.albumId,
      );
    } finally {
      setIsFavoriteSaving(false);
    }
  };

  const mainArtwork = currentSong ? (
    <CardArtwork
      key={artworkSrcSet}
      variant="cover"
      sizes="(max-width:1319px) 450px,(min-width:1320px) and (max-width:1679px) 600px,600px"
      title={currentSong.title}
      imageSrcSet={artworkSrcSet}
      artworkColors={artworkColors}
      containerClassName="contents after:hidden"
    />
  ) : null;

  return (
    <div
      className={`playback-item playback-item--${variant}${isPlaying ? "" : " is-paused"}`}
    >
      <div className="artwork-container__cp">
        <ArtworkWrapper
          type={onTogglePlayback ? "button" : undefined}
          className="artwork-button"
          aria-label={
            onTogglePlayback ? (isPlaying ? "Pause" : "Play") : undefined
          }
          onClick={onTogglePlayback}
          disabled={onTogglePlayback ? !currentSong?.playbackUrl : undefined}
        >
          <div
            className={`now-playing-artwork now-playing-artwork--${variant}`}
          >
            {currentSong?.albumVideoSrc ? (
              <div className="artwork-container__video">
                {mainArtwork}
                <div className="video-artwork__container">
                  <AmbientVideo
                    src={currentSong.albumVideoSrc}
                    variant="artist"
                    keepAlive
                  />
                </div>
              </div>
            ) : (
              mainArtwork
            )}
          </div>
        </ArtworkWrapper>
      </div>

      <div className="metadata">
        {currentSong && (
          <div className="metadata-container">
            <div className="metadata__song-details">
              <AmpLcdMetadata
                currentSong={currentSong}
                containerClassName="lcd-metadata__mb"
                isPlaying={isPlaying}
                onCloseModal={closeModal}
              />

              <div className="items-center flex gap-4 justify-end static  [--contextMenuCircleFillOverride:var(--systemQuaternary-onDark)] [--favoriteButtonSize:28px] [--favoriteButtonBackground:var(--systemQuaternary-onDark)] [--favoriteButtonStarOutline:var(--systemPrimary-onDark)] [--favoriteButtonStarCutout:var(--systemSecondary-onDark)] [--favoriteButtonStarFill:transparent] [--favoriteButtonBackground-hover:var(--favoriteButtonBackground)] [--favoriteButtonStarOutline-hover:var(--favoriteButtonStarOutline)] [--favoriteButtonStarCutout-hover:var(--favoriteButtonStarCutout)] [--favoriteButtonStarFill-hover:var(--favoriteButtonStarFill)]">
                <FavoriteActionButton
                  ariaLabel={
                    isCurrentSongFavorite
                      ? "Remove from favourites"
                      : "Add to favourites"
                  }
                  disabled={isFavoriteSaving}
                  onClick={() => void handleFavoriteClick()}
                  active={isCurrentSongFavorite}
                />

                <AmpContextMenuButton
                  id={`song-${currentSong.id}`}
                  context={{
                    kind: "song",
                    songId: currentSong.id,
                    releaseTrackId: currentSong.releaseTrackId,
                    sourceAlbumId:
                      currentSong.sourceAlbumId ?? currentSong.albumId,
                    title: currentSong.title,
                    userId,
                    isFavorite: isCurrentSongFavorite,
                  }}
                  hasPlatter
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
