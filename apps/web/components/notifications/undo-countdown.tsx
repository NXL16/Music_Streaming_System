"use client";

import { useEffect, useRef, useState } from "react";

const RADIUS = 8;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function UndoCountdown({ duration = 5_000 }: { duration?: number }) {
  const startedAtRef = useRef<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(duration);

  useEffect(() => {
    startedAtRef.current = Date.now();
    const update = () => {
      setRemainingMs(
        Math.max(0, duration - (Date.now() - (startedAtRef.current ?? Date.now()))),
      );
    };
    const timer = window.setInterval(update, 50);
    return () => window.clearInterval(timer);
  }, [duration]);

  const progress = remainingMs / duration;
  const seconds = Math.ceil(remainingMs / 1_000);

  return (
    <span className="items-center flex gap-2">
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        aria-label={`${seconds} seconds remaining`}
        role="img"
      >
        <circle
          cx="10"
          cy="10"
          r={RADIUS}
          fill="none"
          stroke="var(--systemQuaternary)"
          strokeWidth="2"
        />
        <circle
          cx="10"
          cy="10"
          r={RADIUS}
          fill="none"
          stroke="var(--systemPrimary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
          transform="rotate(-90 10 10)"
        />
        <text
          x="10"
          y="10.5"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="currentColor"
          fontSize="8"
          fontWeight="600"
        >
          {seconds}
        </text>
      </svg>
      <span>Deleted from Library</span>
    </span>
  );
}
