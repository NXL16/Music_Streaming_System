import { ElementType } from "react";
import Link from "next/link";
import { ExplicitBadgeIcon } from "../icons/explicit-badge-icon";
import {
  PlayerBarMarquee,
  useMarqueeTrackState,
} from "@/components/layout/player-bar-marquee";
import { useFormattedArtists } from "@/lib/media/use-formatted-artists";
import { type PlayerSong } from "@/lib/player/use-player-store";

const AmpCustomElement = "amp-marquee-text" as ElementType;

type AmpMarqueeTextProps = {
  isPrimary?: boolean;
  currentSong: PlayerSong | null;
  isPlaying?: boolean;
  onCloseModal?: () => void;
};

function DetailMarqueeArtistLinks({
  artists,
  fallbackText,
  onCloseModal,
}: {
  artists?: { id?: string; name: string; url?: string }[];
  fallbackText: string;
  onCloseModal?: () => void;
}) {
  const formattedArtists = useFormattedArtists({ artists, fallbackText });

  return (
    <>
      {formattedArtists.map((artist, index) => (
        <span key={`${artist.id ?? artist.name}-${index}`}>
          {artist.url ? (
            <Link
              href={artist.url}
              onClick={(e) => {
                e.stopPropagation();
                onCloseModal?.();
              }}
              className="text-inherit [text-decoration:none] hover:underline"
            >
              {artist.name}
            </Link>
          ) : (
            <span className="text-inherit [text-decoration:none]">
              {artist.name}
            </span>
          )}
          {index < formattedArtists.length - 1 && ", "}
        </span>
      ))}
    </>
  );
}

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
                    <ExplicitBadgeIcon />
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
                  <DetailMarqueeArtistLinks
                    artists={currentSong.artists}
                    fallbackText={currentSong.artist}
                    onCloseModal={onCloseModal}
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
