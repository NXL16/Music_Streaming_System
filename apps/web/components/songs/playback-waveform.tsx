import {
  type AnimationEvent,
  type CSSProperties,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";

const BAR_OFFSETS = [0, 2.9668, 5.9333, 8.8999] as const;
const BASE_BAR_MOTION = [
  { delayMs: 250, durationMs: 600, maxHeightOffset: 6 },
  { delayMs: 615, durationMs: 400, maxHeightOffset: 2 },
  { delayMs: 475, durationMs: 400, maxHeightOffset: 4 },
  { delayMs: 25, durationMs: 400, maxHeightOffset: 2 },
] as const;

type PlaybackWaveformProps = {
  isPlaying: boolean;
  seed: string;
};

function createSeededRandom(seed: string) {
  let state = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function PlaybackWaveform({ isPlaying, seed }: PlaybackWaveformProps) {
  const id = useId();
  const barId = `playback-bar-${id}`;
  const maskId = `playback-bar-mask-${id}`;
  const [finishingBars, setFinishingBars] = useState(() =>
    Array(BAR_OFFSETS.length).fill(isPlaying),
  );
  const barMotion = useMemo(() => {
    const random = createSeededRandom(seed);

    return BASE_BAR_MOTION.map((bar) => ({
      delayMs: Math.max(0, bar.delayMs + Math.round((random() - 0.5) * 160)),
      durationMs: bar.durationMs + Math.round((random() - 0.5) * 160),
      maxHeightOffset: Math.max(
        1,
        Math.min(8, bar.maxHeightOffset + Math.round((random() - 0.5) * 2)),
      ),
    }));
  }, [seed]);
  const hasFinishingBars = finishingBars.some(Boolean);

  useEffect(() => {
    if (!isPlaying) return;

    const frame = window.requestAnimationFrame(() => {
      setFinishingBars(Array(BAR_OFFSETS.length).fill(true));
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isPlaying]);

  const finishBarAtRest = (
    index: number,
    event: AnimationEvent<SVGUseElement>,
  ) => {
    if (isPlaying || !finishingBars[index]) return;

    const completedIterations = Math.round(
      event.elapsedTime / (barMotion[index].durationMs / 1000),
    );

    // With alternate direction, every second iteration returns to translateY(9px).
    if (completedIterations % 2 !== 0) return;

    setFinishingBars((current) =>
      current.map((isFinishing, barIndex) =>
        barIndex === index ? false : isFinishing,
      ),
    );
  };

  return (
    <svg
      aria-hidden="true"
      className={`inline-block align-bottom bottom-0 inset-x-0 m-auto absolute top-0 h-(--playButtonSize,16px) w-(--playButtonSize,16px) ${
        isPlaying || hasFinishingBars
          ? "will-change-transform z-(--z-gpu)"
          : "z-1"
      } group-hover:opacity-0`}
      focusable="false"
      viewBox="0 0 11 11"
    >
      <defs>
        <rect height="11" id={barId} rx=".25" width="2.1" x="0" y="0" />
        <mask id={maskId}>
          <use fill="white" href={`#${barId}`} />
        </mask>
      </defs>

      {BAR_OFFSETS.map((offset, index) => (
        <g
          key={offset}
          mask={`url(#${maskId})`}
          transform={offset ? `translate(${offset} 0)` : undefined}
        >
          <use
            className={`playback-bars__bar playback-bars__bar--${index + 1} ${
              isPlaying || finishingBars[index]
                ? "playback-bars__bar--playing"
                : ""
            }`}
            href={`#${barId}`}
            onAnimationIteration={(event) => finishBarAtRest(index, event)}
            style={
              {
                "--delay": `${barMotion[index].delayMs}ms`,
                "--duration": `${barMotion[index].durationMs}ms`,
                "--max-height-offset": `${barMotion[index].maxHeightOffset}px`,
              } as CSSProperties
            }
          />
        </g>
      ))}
    </svg>
  );
}
