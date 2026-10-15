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
  containerClassName?: string;
  isVideo?: boolean;
}

const AmpPlaybackControlsPlayTag =
  "amp-playback-controls-play" as React.ElementType;
const M404IconTag = "m404-icon" as React.ElementType;
const SlotFbTag = "slot-fb" as React.ElementType;

const AmpPlayPauseButton = React.memo(function AmpPlayPauseButton({
  mode,
  onClick,
  disabled = false,
  containerClassName,
  isVideo,
}: AmpPlayPauseButtonProps) {
  return (
    <AmpPlaybackControlsPlayTag
      className={`${containerClassName} playback-controls-play`}
      hydrated=""
    >
      {mode === "play" ? (
        <button
          type="button"
          className="playback-play__play"
          disabled={disabled}
          onClick={onClick}
          aria-hidden={disabled ? "true" : undefined}
          tabIndex={disabled ? -1 : undefined}
        >
          <SlotFbTag name="play" hidden={isVideo}>
            <M404IconTag
              class="icon"
              role="presentation"
              aria-hidden="true"
              innerhtml={`&lt;svg viewBox="0 0 32 28" xmlns="http://www.w3.org/2000/svg"&gt;&lt;path d=${PLAY_PATH} fill-rule="nonzero"&gt;&lt;/path&gt;&lt;/svg&gt;`}
              name="play"
              hydrated=""
            >
              <svg viewBox="0 0 32 28" xmlns="http://www.w3.org/2000/svg">
                <path d={PLAY_PATH} fillRule="nonzero"></path>
              </svg>
            </M404IconTag>
          </SlotFbTag>

          {isVideo && (
            <M404IconTag
              slot="play"
              class="icon"
              role="presentation"
              aria-hidden="true"
              innerhtml='&lt;svg xmlns="http://www.w3.org/2000/svg" viewBox="102.69 30.35 87.5 97.51"&gt;&lt;path d="M113.428 127.863c2.588 0 5.03-.733 8.448-2.686l60.302-35.01c4.883-2.88 8.008-6.103 8.008-11.084 0-4.98-3.125-8.203-8.008-11.035l-60.302-35.01c-3.418-2.002-5.86-2.685-8.448-2.685-5.566 0-10.742 4.248-10.742 11.67v74.17c0 7.422 5.176 11.67 10.742 11.67Z"&gt;&lt;/path&gt;&lt;/svg&gt;'
              name="play.fill"
              hydrated=""
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="102.69 30.35 87.5 97.51"
              >
                <path d="M113.428 127.863c2.588 0 5.03-.733 8.448-2.686l60.302-35.01c4.883-2.88 8.008-6.103 8.008-11.084 0-4.98-3.125-8.203-8.008-11.035l-60.302-35.01c-3.418-2.002-5.86-2.685-8.448-2.685-5.566 0-10.742 4.248-10.742 11.67v74.17c0 7.422 5.176 11.67 10.742 11.67Z"></path>
              </svg>
            </M404IconTag>
          )}
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
          <SlotFbTag name="pause" hidden={isVideo}>
            <M404IconTag
              class="icon"
              role="presentation"
              aria-hidden="true"
              innerhtml={`&lt;svg viewBox="0 0 32 28" xmlns="http://www.w3.org/2000/svg"&gt;&lt;path d=${PAUSE_PATH} fill="#000" fill-rule="nonzero"&gt;&lt;/path&gt;&lt;/svg&gt;`}
              name="pause"
              hydrated=""
            >
              <svg viewBox="0 0 32 28" xmlns="http://www.w3.org/2000/svg">
                <path d={PAUSE_PATH} fill="#000" fillRule="nonzero"></path>
              </svg>
            </M404IconTag>
          </SlotFbTag>

          {isVideo && (
            <M404IconTag
              slot="pause"
              class="icon"
              role="presentation"
              aria-hidden="true"
              innerhtml='&lt;svg xmlns="http://www.w3.org/2000/svg" viewBox="104.23 34.94 74.91 88.23"&gt;&lt;path d="M113.411 123.175h12.94c6.103 0 9.13-3.027 9.13-9.13V44.073c0-5.86-3.027-8.936-9.13-9.131h-12.94c-6.103 0-9.18 3.027-9.18 9.13v69.971c-.146 6.104 2.881 9.131 9.18 9.131Zm43.604 0h12.939c6.104 0 9.18-3.027 9.18-9.13V44.073c0-5.86-3.076-9.131-9.18-9.131h-12.94c-6.103 0-9.18 3.027-9.18 9.13v69.971c0 6.104 2.93 9.131 9.18 9.131Z"&gt;&lt;/path&gt;&lt;/svg&gt;'
              name="pause.fill"
              hydrated=""
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="104.23 34.94 74.91 88.23"
              >
                <path d="M113.411 123.175h12.94c6.103 0 9.13-3.027 9.13-9.13V44.073c0-5.86-3.027-8.936-9.13-9.131h-12.94c-6.103 0-9.18 3.027-9.18 9.13v69.971c-.146 6.104 2.881 9.131 9.18 9.131Zm43.604 0h12.939c6.104 0 9.18-3.027 9.18-9.13V44.073c0-5.86-3.076-9.131-9.18-9.131h-12.94c-6.103 0-9.18 3.027-9.18 9.13v69.971c0 6.104 2.93 9.131 9.18 9.131Z"></path>
              </svg>
            </M404IconTag>
          )}
          <span className="button__label">PAUSE</span>
        </button>
      )}
    </AmpPlaybackControlsPlayTag>
  );
});

export default AmpPlayPauseButton;
