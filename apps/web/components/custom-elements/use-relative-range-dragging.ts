import { useMemo, useRef } from "react";

type RelativeRangeDrag = {
  max: number;
  startValue: number;
  startX: number;
  targetValue: number;
  trackWidth: number;
};

const DRAG_THRESHOLD_PX = 4;

export function useRelativeRangeDragging() {
  const dragRef = useRef<RelativeRangeDrag | undefined>(undefined);
  const isDraggingRef = useRef(false);
  const didReceivePointerUpRef = useRef(false);
  const pointerOwnsRangeRef = useRef(false);

  return useMemo(
    () => ({
      cancel() {
        dragRef.current = undefined;
        isDraggingRef.current = false;
        didReceivePointerUpRef.current = false;
      },
      getTargetValue() {
        return dragRef.current?.targetValue;
      },
      ownsNativeInput() {
        return pointerOwnsRangeRef.current;
      },
      keyDown() {
        pointerOwnsRangeRef.current = false;
      },
      hasPendingTap() {
        return Boolean(dragRef.current) && !isDraggingRef.current;
      },
      lostPointerCapture() {
        return !didReceivePointerUpRef.current;
      },
      pointerDown(
        event: PointerEvent,
        startValue: number,
        max: number,
        trackWidth: number,
      ) {
        pointerOwnsRangeRef.current = true;
        dragRef.current = {
          max,
          startValue,
          startX: event.clientX,
          targetValue: startValue,
          trackWidth,
        };
        isDraggingRef.current = false;
        didReceivePointerUpRef.current = false;
      },
      pointerMove(event: PointerEvent) {
        const drag = dragRef.current;
        if (
          !drag ||
          !Number.isFinite(drag.trackWidth) ||
          drag.trackWidth <= 0 ||
          (!isDraggingRef.current &&
            Math.abs(event.clientX - drag.startX) < DRAG_THRESHOLD_PX)
        ) {
          return;
        }

        isDraggingRef.current = true;
        const offset = (event.clientX - drag.startX) / drag.trackWidth;
        drag.targetValue = Math.min(
          Math.max(drag.startValue + offset * drag.max, 0),
          drag.max,
        );
        return drag.targetValue;
      },
      pointerUp() {
        didReceivePointerUpRef.current = true;
      },
    }),
    [],
  );
}
