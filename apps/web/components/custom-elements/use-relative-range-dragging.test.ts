import { describe, expect, it, vi } from "vitest";

vi.mock("react", () => ({
  useRef: <T>(value: T) => ({ current: value }),
  useMemo: <T>(create: () => T) => create(),
}));

import { useRelativeRangeDragging } from "./use-relative-range-dragging";

const pointer = (clientX: number) => ({ clientX }) as PointerEvent;

describe("relative range gestures", () => {
  it("blocks late native input after a tap, pointerup and capture cleanup", () => {
    const drag = useRelativeRangeDragging();
    drag.pointerDown(pointer(150), 0.3, 1, 200);
    expect(drag.hasPendingTap()).toBe(true);
    expect(drag.pointerMove(pointer(153))).toBeUndefined();
    expect(drag.getTargetValue()).toBe(0.3);
    drag.pointerUp();
    drag.cancel();
    expect(drag.ownsNativeInput()).toBe(true);
    drag.keyDown();
    expect(drag.ownsNativeInput()).toBe(false);
  });

  it.each([1, 200])(
    "uses the same relative distance for volume and progress (max=%s)",
    (max) => {
      const drag = useRelativeRangeDragging();
      drag.pointerDown(pointer(150), 0.3 * max, max, 200);
      expect(drag.pointerMove(pointer(154))).toBeCloseTo(0.32 * max);
      expect(drag.pointerMove(pointer(170))).toBeCloseTo(0.4 * max);
      expect(drag.hasPendingTap()).toBe(false);
      expect(drag.pointerMove(pointer(500))).toBe(max);
      expect(drag.pointerMove(pointer(-500))).toBe(0);
      drag.pointerUp();
      expect(drag.lostPointerCapture()).toBe(false);
      drag.cancel();
      expect(drag.getTargetValue()).toBeUndefined();
      expect(drag.ownsNativeInput()).toBe(true);
    },
  );
});
