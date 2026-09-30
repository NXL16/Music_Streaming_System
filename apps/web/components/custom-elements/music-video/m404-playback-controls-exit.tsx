"use client";

import type { ElementType } from "react";

const M404CustomTag = "amp-playback-controls-exit" as ElementType;

export default function M404PlaybackControlsExit({
  controlsVisible,
  onClose,
  onActivity,
}: {
  controlsVisible: boolean;
  onClose: () => void;
  onActivity: () => void;
}) {
  return (
    <M404CustomTag hydrated="">
      <button
        type="button"
        onPointerMove={onActivity}
        onClick={onClose}
        className={`size-5.25 absolute z-1 top-5 left-5 transition-opacity duration-250 ${controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}
        aria-label="Close video"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="21"
          height="21"
          viewBox="0 0 21 21"
          className="size-5.25 fill-[rgba(255,255,255,0.8)] pointer-events-none"
        >
          <path
            d="M10.5 21C4.724 21 0 16.275 0 10.5S4.724 0 10.5 0 21 4.725 21 10.5 16.276 21 10.5 21zm-3.543-5.967a.96.96 0 00.693-.295l2.837-2.842 2.85 2.842c.167.167.41.295.693.295.552 0 1.001-.461 1.001-1.012 0-.281-.115-.512-.295-.704L11.899 10.5l2.85-2.855a.875.875 0 00.295-.68c0-.55-.45-.998-1.001-.998a.871.871 0 00-.668.295l-2.888 2.855-2.862-2.843a.891.891 0 00-.668-.281.99.99 0 00-1.001.986c0 .269.116.512.295.678L9.088 10.5l-2.837 2.843a.926.926 0 00-.295.678c0 .551.45 1.012 1.001 1.012z"
            fillRule="nonzero"
          ></path>
        </svg>

        <span className="sr-only">Close Video</span>
      </button>
    </M404CustomTag>
  );
}
