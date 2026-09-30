"use client";

import { useState, type ElementType, type RefObject } from "react";
import {
  AlertCircle,
  Expand,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import type { MusicVideoSource } from "./music-video-player";

const VideoPlayerTag = "amp-video-player" as ElementType;

export type VideoPlaybackStatus = "loading" | "ready" | "error";

type Props = {
  controlsVisible: boolean;
  currentTime: number;
  duration: number;
  onActivity: () => void;
  onFullscreen: () => void;
  onPreview: (time: number) => void;
  onRetry: () => void;
  onSeek: (time: number) => void;
  onSkip: (seconds: number) => void;
  onToggle: () => void;
  playing: boolean;
  previewImage?: string;
  source: MusicVideoSource;
  status: VideoPlaybackStatus;
  mediaMountRef: RefObject<HTMLDivElement | null>;
};

function formatTime(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function ScreenButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="rounded-full p-2 text-white transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white"
    >
      {children}
    </button>
  );
}

export default function M404VideoPlayer({
  controlsVisible,
  currentTime,
  duration,
  onActivity,
  onFullscreen,
  onPreview,
  onRetry,
  onSeek,
  onSkip,
  onToggle,
  playing,
  previewImage,
  source,
  status,
  mediaMountRef,
}: Props) {
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const controlsClass = controlsVisible
    ? "opacity-100"
    : "pointer-events-none opacity-0";
  const displayedTime = scrubTime ?? currentTime;
  const commitScrub = (value: string) => {
    const nextTime = Number(value);
    if (Number.isFinite(nextTime)) onSeek(nextTime);
    setScrubTime(null);
  };

  return (
    <VideoPlayerTag className="absolute inset-0 block" hydrated="">
      <div
        className="relative size-full overflow-hidden bg-black"
        onMouseMove={onActivity}
        onPointerDown={onActivity}
        onClick={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest("[data-player-controls]")) return;
          onToggle();
        }}
      >
        <div ref={mediaMountRef} className="absolute inset-0" />

        <div
          className={`pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,.52),transparent_28%,transparent_64%,rgba(0,0,0,.72))] transition-opacity duration-250 ${controlsClass}`}
        />

        {status === "loading" && (
          <div
            className="absolute inset-0 grid place-items-center"
            aria-live="polite"
          >
            <LoaderCircle
              className="size-9 animate-spin text-white"
              aria-label="Loading video"
            />
          </div>
        )}

        {status === "error" && (
          <div
            className="absolute inset-0 grid place-items-center bg-black/50 p-6"
            role="alert"
          >
            <div className="max-w-sm text-center">
              <AlertCircle className="mx-auto mb-3 size-8 text-white" />
              <p className="text-base font-semibold">Không thể phát video</p>
              <p className="mt-1 text-sm text-white/70">
                Kiểm tra kết nối rồi thử lại.
              </p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-5 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition hover:bg-white/85"
              >
                Thử lại
              </button>
            </div>
          </div>
        )}

        <div
          data-player-controls
          className={`absolute inset-x-0 bottom-0 p-5 pt-20 transition duration-250 sm:px-5 ${controlsClass}`}
        >
          <div className="mt-auto mb-3.5 p-[0_10px] [grid-area:info] items-end overflow-x-hidden transform-none [transition:opacity_0.4s_cubic-bezier(0,0,0.2,1)_0.05s,transform_0.5s_cubic-bezier(0,0,0.2,1)]">
            <div className="[font:var(--title-2-emphasized)] tracking-normal text-(--white80,rgba(255,255,255,0.8))">
              {source.title}
            </div>

            <div className="[font:var(--large-title-emphasized)] tracking-normal mt-px mb-2.5">
              {source.artist}
            </div>
          </div>

          <div className="flex flex-[0_0_100%] items-center justify-between">
            <time dateTime={`PT${Math.floor(displayedTime)}S`}>
              {formatTime(displayedTime)}
            </time>
            <div className="relative flex-1">
              {scrubTime !== null && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-3.5 z-10 w-30 -translate-x-1/2 overflow-hidden rounded-md bg-black shadow-lg"
                  style={{
                    left: `${duration ? (scrubTime / duration) * 100 : 0}%`,
                  }}
                >
                  {previewImage || source.poster ? (
                    <div
                      className="aspect-video w-full bg-cover bg-center"
                      style={{
                        backgroundImage: `url("${previewImage || source.poster}")`,
                      }}
                    />
                  ) : (
                    <div className="aspect-video w-full bg-white/15" />
                  )}
                  <span className="block px-2 py-1 text-center text-[11px] font-medium text-white">
                    {formatTime(scrubTime)}
                  </span>
                </div>
              )}
              <input
                aria-label="Playback progress"
                className="h-1 w-full accent-white"
                type="range"
                min="0"
                max={duration || 0}
                step="0.1"
                value={displayedTime}
                onFocus={onActivity}
                onPointerDown={onActivity}
                onInput={(event) => {
                  const nextTime = Number(event.currentTarget.value);
                  setScrubTime(nextTime);
                  onPreview(nextTime);
                  onActivity();
                }}
                onPointerUp={(event) => commitScrub(event.currentTarget.value)}
                onPointerCancel={(event) =>
                  commitScrub(event.currentTarget.value)
                }
                onBlur={(event) => {
                  if (scrubTime !== null)
                    commitScrub(event.currentTarget.value);
                }}
              />
            </div>
            <time
              dateTime={`PT${Math.floor(Math.max(0, duration - displayedTime))}S`}
            >
              -{formatTime(Math.max(0, duration - displayedTime))}
            </time>
          </div>

          <div className="mt-4 flex items-center justify-center gap-5">
            <ScreenButton
              label="Skip back 10 seconds"
              onClick={() => onSkip(-10)}
            >
              <span className="relative grid size-7 place-items-center">
                <RotateCcw className="absolute inset-0 size-7" />
                <span className="relative mt-0.5 text-[8px] font-bold leading-none">
                  10
                </span>
              </span>
            </ScreenButton>
            <ScreenButton label={playing ? "Pause" : "Play"} onClick={onToggle}>
              {playing ? (
                <Pause className="size-8 fill-current" />
              ) : (
                <Play className="ms-0.5 size-8 fill-current" />
              )}
            </ScreenButton>
            <ScreenButton
              label="Skip ahead 10 seconds"
              onClick={() => onSkip(10)}
            >
              <span className="relative grid size-7 place-items-center">
                <RotateCw className="absolute inset-0 size-7" />
                <span className="relative mt-0.5 text-[8px] font-bold leading-none">
                  10
                </span>
              </span>
            </ScreenButton>
            <div className="absolute right-5 sm:right-8">
              <ScreenButton label="Full screen" onClick={onFullscreen}>
                <Expand className="size-6" />
              </ScreenButton>
            </div>
          </div>
        </div>
      </div>
    </VideoPlayerTag>
  );
}
