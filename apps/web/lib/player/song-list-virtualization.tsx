"use client";

import { useLayoutEffect, useRef, useState } from "react";

export const SONG_ROW_HEIGHT = 54;
const SONG_ROW_OVERSCAN = 8;
const SONG_RANGE_BLOCK_SIZE = 8;

export function SongTableSpacer({ height }: { height: number }) {
  if (height <= 0) return null;

  return (
    <div aria-hidden="true" className="table-row">
      <div className="table-cell p-0">
        <div style={{ height }} />
      </div>
      <div className="table-cell p-0" />
      <div className="hidden min-[1000px]:table-cell p-0" />
      <div className="hidden min-[1260px]:table-cell p-0" />
      <div className="table-cell p-0" />
    </div>
  );
}

export function useVisibleSongRange(
  songCount: number,
  table: HTMLDivElement | null,
) {
  const [range, setRange] = useState({ start: 0, end: SONG_ROW_OVERSCAN * 2 });
  const rangeRef = useRef(range);

  useLayoutEffect(() => {
    const scrollContainer = document.querySelector<HTMLElement>(
      "[data-app-scroll-container]",
    );
    if (!scrollContainer || !table) return;
    let frame: number | undefined;
    let tableTop = 0;
    const measureTableTop = () => {
      const containerRect = scrollContainer.getBoundingClientRect();
      tableTop =
        scrollContainer.scrollTop +
        table.getBoundingClientRect().top -
        containerRect.top;
    };
    const updateRange = () => {
      frame = undefined;
      const viewportStart = Math.max(0, scrollContainer.scrollTop - tableTop);
      const rowStart = Math.floor(viewportStart / SONG_ROW_HEIGHT);
      const blockStart =
        Math.floor(rowStart / SONG_RANGE_BLOCK_SIZE) * SONG_RANGE_BLOCK_SIZE;
      const next = {
        start: Math.max(0, blockStart - SONG_ROW_OVERSCAN),
        end: Math.min(
          songCount,
          blockStart +
            Math.ceil(scrollContainer.clientHeight / SONG_ROW_HEIGHT) +
            SONG_RANGE_BLOCK_SIZE +
            SONG_ROW_OVERSCAN,
        ),
      };
      if (
        rangeRef.current.start !== next.start ||
        rangeRef.current.end !== next.end
      ) {
        rangeRef.current = next;
        setRange(next);
      }
    };
    const scheduleUpdate = () => {
      if (frame === undefined) frame = requestAnimationFrame(updateRange);
    };
    measureTableTop();
    updateRange();
    scrollContainer.addEventListener("scroll", scheduleUpdate, {
      passive: true,
    });
    const resizeObserver = new ResizeObserver(() => {
      measureTableTop();
      scheduleUpdate();
    });
    resizeObserver.observe(scrollContainer);
    return () => {
      scrollContainer.removeEventListener("scroll", scheduleUpdate);
      resizeObserver.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [songCount, table]);

  return {
    start: Math.min(range.start, songCount),
    end: Math.min(Math.max(range.end, range.start), songCount),
  };
}
