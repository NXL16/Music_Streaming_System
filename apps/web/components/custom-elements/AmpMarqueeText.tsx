import { ElementType } from "react";
import Link from "next/link";
import {
  PlayerBarMarquee,
  useMarqueeTrackState,
} from "@/components/layout/player-bar-marquee";
import { type PlayerSong } from "@/lib/player/use-player-store";
import { ArtistLinks } from "../media/artist-links";

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
                      className="text-inherit [text-decoration:none] inline-block relative top-[1.6px] [--explicitBadgeSize:15.5px]"
                    >
                      <svg
                        viewBox="0 0 9 9"
                        width="9"
                        height="9"
                        className="inline-block align-baseline h-(--explicitBadgeSize,auto) w-(--explicitBadgeSize,auto) text-current"
                        aria-hidden="true"
                      >
                        <path
                          fill="currentColor"
                          d="M3.9 7h1.9c.4 0 .7-.2.7-.5s-.3-.4-.7-.4H4.1V4.9h1.5c.4 0 .7-.1.7-.4 0-.3-.3-.5-.7-.5H4.1V2.9h1.7c.4 0 .7-.2.7-.5 0-.2-.3-.4-.7-.4H3.9c-.6 0-.9.3-.9.7v3.7c0 .3.3.6.9.6zM1.6 0h5.8C8.5 0 9 .5 9 1.6v5.9C9 8.5 8.5 9 7.4 9H1.6C.5 9 0 8.5 0 7.4V1.6C0 .5.5 0 1.6 0z"
                        ></path>
                      </svg>
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
