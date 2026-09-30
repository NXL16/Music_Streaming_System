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
      className={`tracking-normal max-w-full [font:var(--title-2-emphasized)] ${
        isPrimary
          ? "text-(--lcd-primary-text-color,var(--systemPrimary)) min-w-0"
          : "min-h-4 relative [transition:color_.1s_ease-in] text-(--systemSecondary-onDark)"
      }`}
      style={{
        "--marquee-line-padding": "8px",
        width: "100%",
      }}
    >
      {isPrimary ? (
        <div
          className={`items-center box-border flex flex-row [justify-content:var(--lcd-justify-text,center)] overflow-clip relative [text-align:var(--lcd-justify-text,center)] [text-overflow:none] whitespace-nowrap w-full ${marqueeState.isActive ? "active grow shrink pe-1" : "inactive"} ${marqueeState.isAnimating ? "is-animating" : ""}`}
        >
          <div className="w-auto min-w-0 in-[.inactive]:relative in-[.inactive]:pe-0 in-[.active]:p-(--lcd-line-padding,0_10px)">
            <PlayerBarMarquee
              key={`title-${currentSong.id}`}
              className="w-full h-6.25 in-[.active]:[mask:var(--primary-paddle-controls-mask-hover,var(--stopped-marquee-mask,linear-gradient(270deg,transparent_var(--lcd-marquee-offset,35px),#000_calc(var(--lcd-marquee-offset,35px)+15px))))] in-[.active.is-animating]:[mask:var(--primary-paddle-controls-mask-hover,var(--animated-marquee-mask,linear-gradient(90deg,transparent_0,#000_var(--lcd-fade-length-start,15px),#000_calc(100%-15px-var(--lcd-marquee-offset,35px)),transparent_calc(100%-var(--lcd-marquee-offset,35px)))))]"
              isPlaybackActive={isPlaying}
              onOverflowChange={marqueeState.handleOverflowChange}
              onAnimatingChange={marqueeState.handleAnimatingChange}
            >
              <span className="flex items-center gap-[0.333em]">
                <span className="text-inherit [text-decoration:none]">
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
          </div>
        </div>
      ) : (
        <div className="w-full h-5.25 absolute -top-1.25">
          <div
            className={`items-center box-border flex flex-row [justify-content:var(--lcd-justify-text,center)] overflow-clip relative [text-align:var(--lcd-justify-text,center)] [text-overflow:none] whitespace-nowrap w-full ${marqueeState.isActive ? "active grow shrink pe-1" : "inactive"} ${marqueeState.isAnimating ? "is-animating" : ""}`}
          >
            <div className="min-w-0 w-auto in-[.active]:p-(--lcd-line-padding,0_10px) in-[.inactive]:pe-0 in-[.inactive]:relative">
              <PlayerBarMarquee
                key={`sub-${currentSong.id}`}
                className="w-full box-border h-6.25 p-[3px_0_2px] in-[.active]:[mask:var(--secondary-mask-hover,var(--stopped-marquee-mask,linear-gradient(270deg,transparent_var(--lcd-marquee-offset,35px),#000_calc(var(--lcd-marquee-offset,35px)+15px))))] in-[.active.is-animating]:[mask:var(--secondary-mask-hover,var(--animated-marquee-mask-small,linear-gradient(90deg,transparent_0,#000_var(--lcd-fade-length-start,15px),#000_calc(100%-15px-var(--lcd-marquee-offset,35px)),transparent_calc(100%-var(--lcd-marquee-offset,35px)))))]"
                isPlaybackActive={isPlaying}
                onOverflowChange={marqueeState.handleOverflowChange}
                onAnimatingChange={marqueeState.handleAnimatingChange}
              >
                <span className="flex items-center gap-[0.333em]">
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
            </div>
          </div>
        </div>
      )}
    </AmpCustomElement>
  );
}
