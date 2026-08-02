"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type LyricsTimingLine = {
  text: string;
  startTimeMs: number;
  endTimeMs: number;
  kind: "LYRIC" | "INSTRUMENTAL";
};

type DragMode = "move" | "start" | "end";
type DragState = {
  index: number;
  mode: DragMode;
  pointerX: number;
  startTimeMs: number;
  endTimeMs: number;
};

type Props = {
  durationMs: number;
  waveform: number[];
  lines: LyricsTimingLine[];
  selectedIndex: number | null;
  playbackTimeMs: number;
  onSelect: (index: number) => void;
  onChangeLine: (index: number, patch: Partial<LyricsTimingLine>) => void;
  onSeek: (timeMs: number) => void;
};

const MIN_DURATION_MS = 80;

const timeLabel = (timeMs: number) => {
  const seconds = Math.max(0, timeMs) / 1000;
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
};

export function LyricsWaveformTimeline({
  durationMs,
  waveform,
  lines,
  selectedIndex,
  playbackTimeMs,
  onSelect,
  onChangeLine,
  onSeek,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [viewportWidth, setViewportWidth] = useState(720);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(72);

  const durationSeconds = Math.max(1, durationMs / 1000);
  const contentWidth = Math.max(
    viewportWidth,
    Math.ceil(durationSeconds * pixelsPerSecond),
  );
  const trackHeight = 46;
  const timelineHeight = Math.max(164, lines.length * trackHeight + 30);
  const pxToTime = (pixels: number) => (pixels / pixelsPerSecond) * 1000;
  const timeToPx = (timeMs: number) =>
    (Math.max(0, timeMs) / 1000) * pixelsPerSecond;

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setViewportWidth(entry.contentRect.width),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const height = 104;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.ceil(contentWidth * ratio);
    canvas.height = height * ratio;
    canvas.style.width = `${contentWidth}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.clearRect(0, 0, contentWidth, height);
    context.fillStyle = "rgba(255,255,255,.06)";
    context.fillRect(0, height / 2, contentWidth, 1);
    if (!waveform.length) return;
    const barWidth = Math.max(1, contentWidth / waveform.length - 1);
    waveform.forEach((rawPeak, index) => {
      const peak = Math.min(1, Math.max(0.035, rawPeak));
      const barHeight = peak * (height - 18);
      const x = (index / waveform.length) * contentWidth;
      context.fillStyle = "rgba(255,255,255,.38)";
      context.fillRect(x, (height - barHeight) / 2, barWidth, barHeight);
    });
  }, [contentWidth, waveform]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = ((event.clientX - drag.pointerX) / pixelsPerSecond) * 1000;
      const originalStart = Math.max(0, drag.startTimeMs);
      const originalEnd = Math.max(
        originalStart + MIN_DURATION_MS,
        drag.endTimeMs,
      );
      if (drag.mode === "move") {
        const duration = originalEnd - originalStart;
        const startTimeMs = Math.min(
          Math.max(0, originalStart + delta),
          Math.max(0, durationMs - duration),
        );
        onChangeLine(drag.index, {
          startTimeMs,
          endTimeMs: startTimeMs + duration,
        });
      } else if (drag.mode === "start") {
        onChangeLine(drag.index, {
          startTimeMs: Math.min(
            Math.max(0, originalStart + delta),
            originalEnd - MIN_DURATION_MS,
          ),
        });
      } else {
        onChangeLine(drag.index, {
          endTimeMs: Math.max(
            originalStart + MIN_DURATION_MS,
            Math.min(durationMs, originalEnd + delta),
          ),
        });
      }
    };
    const onPointerUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [durationMs, onChangeLine, pixelsPerSecond]);

  const ticks = useMemo(() => {
    const everySeconds =
      pixelsPerSecond >= 120 ? 5 : pixelsPerSecond >= 72 ? 10 : 20;
    return Array.from(
      { length: Math.ceil(durationSeconds / everySeconds) + 1 },
      (_, index) => index * everySeconds,
    );
  }, [durationSeconds, pixelsPerSecond]);

  return (
    <section className="overflow-hidden rounded-2xl border border-(--labelDivider) bg-(--background)">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-(--labelDivider) px-4 py-3">
        <div>
          <p className="text-sm text-(--systemPrimary) [font:var(--headline)]">
            Timeline
          </p>
          <p className="text-xs text-(--systemSecondary)">
            Kéo block để dịch · kéo hai mép để sửa đầu/cuối
          </p>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-(--labelDivider)">
          {[40, 72, 120, 180].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setPixelsPerSecond(value)}
              className={`px-2.5 py-1.5 text-xs ${pixelsPerSecond === value ? "bg-(--systemQuaternary) text-(--systemPrimary)" : "text-(--systemSecondary)"}`}
            >
              {value === 40 ? "Fit" : `${value}px`}
            </button>
          ))}
        </div>
      </header>
      <div ref={viewportRef} className="overflow-auto">
        <div
          className="relative min-w-full select-none"
          style={{ width: contentWidth }}
        >
          <div className="sticky left-0 z-10 h-7 border-b border-(--labelDivider) bg-(--background)">
            {ticks.map((seconds) => (
              <span
                key={seconds}
                className="absolute top-1 font-mono text-[10px] text-(--systemSecondary)"
                style={{ left: timeToPx(seconds * 1000) + 4 }}
              >
                {timeLabel(seconds * 1000)}
              </span>
            ))}
          </div>
          <button
            type="button"
            aria-label="Seek playback"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              onSeek(Math.round(pxToTime(event.clientX - rect.left)));
            }}
            className="relative block h-26 w-full cursor-crosshair border-b border-(--labelDivider)"
          >
            <canvas ref={canvasRef} />
          </button>
          <div className="relative" style={{ height: timelineHeight }}>
            {lines.map((line, index) => {
              const hasTiming =
                isFinite(line.startTimeMs) &&
                line.startTimeMs >= 0 &&
                line.endTimeMs > line.startTimeMs;
              const start = hasTiming ? line.startTimeMs : 0;
              const end = hasTiming
                ? line.endTimeMs
                : Math.min(durationMs, start + 1000);
              const left = timeToPx(start);
              const width = Math.max(22, timeToPx(end - start));
              return (
                <div
                  key={`${index}-${line.text}`}
                  className="absolute left-0 right-0 border-b border-(--labelDivider)"
                  style={{ top: index * trackHeight, height: trackHeight }}
                >
                  <span className="absolute left-2 top-3 font-mono text-xs text-(--systemSecondary)">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelect(index)}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      const rect = event.currentTarget.getBoundingClientRect();
                      const edge = event.clientX - rect.left;
                      dragRef.current = {
                        index,
                        mode:
                          edge < 9
                            ? "start"
                            : edge > rect.width - 9
                              ? "end"
                              : "move",
                        pointerX: event.clientX,
                        startTimeMs: start,
                        endTimeMs: end,
                      };
                    }}
                    className={`absolute top-1.5 h-9 overflow-hidden rounded-md border px-3 text-left text-xs transition-shadow ${selectedIndex === index ? "border-(--keyColor) bg-(--keyColor) text-(--keyColorText) shadow-[0_0_0_1px_var(--keyColor)]" : "border-(--labelDivider) bg-(--systemQuaternary) text-(--systemPrimary)"}`}
                    style={{ left, width }}
                  >
                    <span className="pointer-events-none block truncate">
                      {line.kind === "INSTRUMENTAL"
                        ? "••• Nhạc không lời"
                        : line.text || "Lyric trống"}
                    </span>
                  </button>
                </div>
              );
            })}
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-(--keyColor)"
              style={{ left: timeToPx(Math.min(durationMs, playbackTimeMs)) }}
            >
              <span className="absolute -left-1.5 -top-1 h-3 w-3 rotate-45 bg-(--keyColor)" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
