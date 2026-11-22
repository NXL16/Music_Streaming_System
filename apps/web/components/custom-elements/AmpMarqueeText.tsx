import { ElementType } from "react";
import Link from "next/link";
import {
  PlayerBarMarquee,
  useMarqueeTrackState,
} from "@/components/layout/player-bar-marquee";
import { type PlayerSong } from "@/lib/player/use-player-store";
import { ArtistLinks } from "../media/artist-links";
import { ExplicitBadgeIcon } from "../icons/explicit-badge-icon";

const AmpCustomElement = "amp-marquee-text" as ElementType;

type AmpMarqueeTextProps = {
  isPrimary?: boolean;
  currentSong: PlayerSong | null;
  isPlaying?: boolean;
  onCloseModal?: () => void;
};

export default function AmpMarqueeText({
  isPrimary = false,
  currentSong,
  isPlaying = false,
  onCloseModal,
}: AmpMarqueeTextProps) {
  const currentSongId = currentSong?.id ?? null;
  const marqueeState = useMarqueeTrackState(currentSongId);
  const isExplicit = currentSong?.contentRating === "explicit";

  if (!currentSong) return null;

  return (
    <AmpCustomElement
      hydrated=""
      className={`${isPrimary ? "lcd-meta__primary" : "lcd-meta__secondary"}`}
      style={{
        "--marquee-line-padding": "20px",
        width: "100%",
      }}
    >
      <div className="lcd-meta-line-wrapper">
        {isPrimary ? (
          <div
            className={`lcd-meta-line ${marqueeState.isActive ? "is-marquee" : "not-marquee"} ${marqueeState.isAnimating ? "is-animating" : ""}`}
          >
            <div className="lcd-meta-line__string-container">
              <PlayerBarMarquee
                key={`title-${currentSong.id}`}
                className="lcd-meta-line__marquee-mask"
                isPlaybackActive={isPlaying}
                isDetail
                onOverflowChange={marqueeState.handleOverflowChange}
                onAnimatingChange={marqueeState.handleAnimatingChange}
              >
                <span className="lcd-meta-line__text-content">
                  <span className="lcd-meta-line__fragment">
                    {currentSong.title}
                  </span>

                  {isExplicit && (
                    <span
                      aria-label="Explicit"
                      className="lcd-meta-line__fragment lcd-meta-line__icon [--explicitBadgeSize:17px]"
                    >
                      <ExplicitBadgeIcon />
                    </span>
                  )}
                </span>
              </PlayerBarMarquee>

              <div className="marquee-text__menu-slot-wrapper"></div>
            </div>
          </div>
        ) : (
          <div
            className={`lcd-meta-line ${marqueeState.isActive ? "is-marquee" : "not-marquee"} ${marqueeState.isAnimating ? "is-animating" : ""}`}
          >
            <div className="lcd-meta-line__string-container">
              <PlayerBarMarquee
                key={`sub-${currentSong.id}`}
                className="lcd-meta-line__marquee-mask"
                isPlaybackActive={isPlaying}
                isDetail
                onOverflowChange={marqueeState.handleOverflowChange}
                onAnimatingChange={marqueeState.handleAnimatingChange}
              >
                <span className="lcd-meta-line__text-content">
                  <ArtistLinks
                    artists={currentSong.artists}
                    fallbackText={currentSong.artist}
                    linkClassName="text-inherit [text-decoration:none] hover:underline"
                    textClassName="text-inherit [text-decoration:none]"
                    onArtistClick={(event) => {
                      event.stopPropagation();
                      onCloseModal?.();
                    }}
                  />

                  {currentSong.album && (
                    <>
                      <span className="text-inherit [text-decoration:none]">
                        {" — "}
                      </span>
                      {currentSong.albumUrl ? (
                        <Link
                          href={currentSong.albumUrl}
                          onClick={(e) => {
                            e.stopPropagation();
                            onCloseModal?.();
                          }}
                          className="text-inherit [text-decoration:none] hover:underline"
                        >
                          {currentSong.album}
                        </Link>
                      ) : (
                        <span className="text-inherit [text-decoration:none]">
                          {currentSong.album}
                        </span>
                      )}
                    </>
                  )}
                </span>
              </PlayerBarMarquee>

              <div className="marquee-text__menu-slot-wrapper"></div>
            </div>
          </div>
        )}
      </div>
    </AmpCustomElement>
  );
}
