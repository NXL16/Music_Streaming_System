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

const AmpPlaybackControlsPlayTag = "amp-playback-controls-play" as React.ElementType;
const AmpIconTag = "amp-icon" as React.ElementType;
const SlotFbTag = "slot-fb" as React.ElementType;

export default function AmpPlayPauseButton({
  mode,
  onClick,
  disabled = false,
}: AmpPlayPauseButtonProps) {
  const buttonClassName = `
    w-full h-full relative m-0 p-0 inline-block border-0 bg-transparent outline-none cursor-pointer appearance-none font-inherit text-inherit leading-inherit bg-center bg-contain
    text-(--playback-control-color,var(--white80,rgba(255,255,255,0.8)))
    transition-colors duration-200 ease-out
    hover:not-disabled:text-(--playback-control-color-hover,#fff)
    focus-visible:not-disabled:text-(--playback-control-color-hover,#fff)
    focus-visible:outline-[4px] focus-visible:outline-solid focus-visible:outline-(--sk-focus-color,#0071e3) focus-visible:outline-offset-2
    disabled:opacity-40 disabled:cursor-default
  `.trim();

  const iconWrapperClassName = "w-(--playback-control-icon-width,32px) h-(--playback-control-icon-height,28px) block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2";

  return (
    <AmpPlaybackControlsPlayTag
      className="w-(--playback-control-button-width,44px) h-(--playback-control-button-height,44px) flex flex-[0_0_auto] items-stretch justify-stretch relative"
      hydrated=""
    >
      {mode === "play" ? (
        <button
          type="button"
          className={buttonClassName}
          disabled={disabled}
          onClick={onClick}
          aria-hidden={disabled ? "true" : undefined}
          tabIndex={disabled ? -1 : undefined}
        >
          <SlotFbTag name="play">
            <AmpIconTag
              className={iconWrapperClassName}
              role="presentation"
              aria-hidden="true"
              name="play"
              hydrated=""
            >
              <svg viewBox="0 0 32 28" className="w-full h-full block text-current pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                <path d={PLAY_PATH} fillRule="nonzero" fill="currentColor" />
              </svg>
            </AmpIconTag>
          </SlotFbTag>
          <span className="absolute overflow-hidden h-px w-px p-0 border-0 clip-[rect(1px,1px,1px,1px)] clip-path-inset-[0_0_99.9%_99.9%]">
            PLAY
          </span>
        </button>
      ) : (
        <button
          type="button"
          className={buttonClassName}
          disabled={disabled}
          onClick={onClick}
          aria-hidden={disabled ? "true" : undefined}
          tabIndex={disabled ? -1 : undefined}
        >
          <SlotFbTag name="pause">
            <AmpIconTag
              className={iconWrapperClassName}
              role="presentation"
              aria-hidden="true"
              name="pause"
              hydrated=""
            >
              <svg viewBox="0 0 32 28" className="w-full h-full block text-current pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                <path d={PAUSE_PATH} fillRule="nonzero" fill="currentColor" />
              </svg>
            </AmpIconTag>
          </SlotFbTag>
          <span className="absolute overflow-hidden h-px w-px p-0 border-0 clip-[rect(1px,1px,1px,1px)] clip-path-inset-[0_0_99.9%_99.9%]">
            PAUSE
          </span>
        </button>
      )}
    </AmpPlaybackControlsPlayTag>
  );
}