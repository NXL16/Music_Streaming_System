"use client";

import React from "react";

const PLAY_PATH =
  "M10.345 23.287c.415 0 .763-.15 1.22-.407l12.742-7.404c.838-.481 1.178-.855 1.178-1.46 0-.599-.34-.972-1.178-1.462L11.565 5.158c-.457-.265-.805-.407-1.22-.407-.789 0-1.345.606-1.345 1.57v15.71c0 .971.556 1.577 1.345 1.577z";
const PAUSE_PATH =
  "M13.293 22.772c.955 0 1.436-.481 1.436-1.436V6.677c0-.98-.481-1.427-1.436-1.427h-2.457c-.954 0-1.436.473-1.436 1.427v14.66c0 .954.473 1.435 1.436 1.435h2.457zm7.87 0c.954 0 1.427-.481 1.427-1.436V6.677c0-.98-.473-1.427-1.428-1.427h-2.465c-.955 0-1.428.473-1.428 1.427v14.66c0 .954.473 1.435 1.428 1.435h2.465z";

interface AmpPlayPauseButtonProps {
  mode: "play" | "pause";
  onClick?: () => void;
  disabled?: boolean;
}

const AmpPlaybackControlsPlayTag =
  "amp-playback-controls-play" as React.ElementType;
const AmpIconTag = "amp-icon" as React.ElementType;
const SlotFbTag = "slot-fb" as React.ElementType;

const AmpPlayPauseButton = React.memo(function AmpPlayPauseButton({
  mode,
  onClick,
  disabled = false,
}: AmpPlayPauseButtonProps) {
  return (
    <AmpPlaybackControlsPlayTag className="playback-controls-play" hydrated="">
      {mode === "play" ? (
        <button
          type="button"
          className="playback-play__play"
          disabled={disabled}
          onClick={onClick}
          aria-hidden={disabled ? "true" : undefined}
          tabIndex={disabled ? -1 : undefined}
        >
          <SlotFbTag name="play">
            <AmpIconTag
              className="icon"
              role="presentation"
              aria-hidden="true"
              name="play"
              hydrated=""
            >
              <svg
                viewBox="0 0 32 28"
                className="size-full block text-current pointer-events-none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d={PLAY_PATH} fillRule="nonzero" fill="currentColor" />
              </svg>
            </AmpIconTag>
          </SlotFbTag>
          <span className="button__label">PLAY</span>
        </button>
      ) : (
        <button
          type="button"
          className="playback-play__pause"
          disabled={disabled}
          onClick={onClick}
          aria-hidden={disabled ? "true" : undefined}
          tabIndex={disabled ? -1 : undefined}
        >
          <SlotFbTag name="pause">
            <AmpIconTag
              className="icon"
              role="presentation"
              aria-hidden="true"
              name="pause"
              hydrated=""
            >
              <svg
                viewBox="0 0 32 28"
                className="size-full block text-current pointer-events-none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d={PAUSE_PATH} fillRule="nonzero" fill="currentColor" />
              </svg>
            </AmpIconTag>
          </SlotFbTag>
          <span className="button__label">PAUSE</span>
        </button>
      )}
    </AmpPlaybackControlsPlayTag>
  );
});

export default AmpPlayPauseButton;
