import { useCallback, useEffect, useRef, useState } from "react";

export function useTrackRowSelection<T extends HTMLElement>() {
  const listRef = useRef<T | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);

  const selectTrack = useCallback((trackId: string) => {
    setSelectedTrackId(trackId);
    setActiveTrackId(trackId);
  }, []);

  const activateTrack = useCallback((trackId: string) => {
    setActiveTrackId(trackId);
  }, []);

  const clearActiveTrack = useCallback(() => {
    setActiveTrackId(null);
  }, []);

  useEffect(() => {
    const clearActiveTrackOnOutsidePointerDown = (event: PointerEvent) => {
      if (!listRef.current?.contains(event.target as Node)) {
        setActiveTrackId(null);
      }
    };

    document.addEventListener("pointerdown", clearActiveTrackOnOutsidePointerDown);
    return () =>
      document.removeEventListener(
        "pointerdown",
        clearActiveTrackOnOutsidePointerDown,
      );
  }, []);

  return {
    activateTrack,
    activeTrackId,
    clearActiveTrack,
    listRef,
    selectTrack,
    selectedTrackId,
  };
}
