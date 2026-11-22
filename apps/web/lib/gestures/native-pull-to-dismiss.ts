export type PullToDismissCallbacks = {
  onPullDown: (offset: number) => void;
  onPullEnd: () => void;
};

type NativePullToDismissOptions = {
  shouldIgnoreTarget?: (target: EventTarget | null) => boolean;
};

export function bindNativePullToDismiss(
  scroller: HTMLElement,
  getCallbacks: () => PullToDismissCallbacks,
  options: NativePullToDismissOptions = {},
) {
  let initialScrollTop = 0;
  let startY: number | undefined;
  let isPulling = false;
  const previousTouchAction = scroller.style.touchAction;
  scroller.style.touchAction = "pan-y";

  const getTouchY = (event: TouchEvent) => event.touches[0]?.clientY;
  const handleTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) return;
    if (options.shouldIgnoreTarget?.(event.target)) return;

    startY = getTouchY(event);
    initialScrollTop = scroller.scrollTop;
    isPulling = false;
  };
  const handleTouchMove = (event: TouchEvent) => {
    if (startY === undefined) return;

    const currentY = getTouchY(event);
    if (currentY === undefined) return;

    const gestureDistance = currentY - startY;
    const offset = Math.max(0, gestureDistance - initialScrollTop);
    if (offset <= 0 || scroller.scrollTop > 0) return;

    isPulling = true;
    event.preventDefault();
    getCallbacks().onPullDown(offset);
  };
  const handleTouchEnd = () => {
    if (isPulling) getCallbacks().onPullEnd();
    startY = undefined;
    initialScrollTop = 0;
    isPulling = false;
  };

  scroller.addEventListener("touchstart", handleTouchStart, { passive: true });
  scroller.addEventListener("touchmove", handleTouchMove, { passive: false });
  scroller.addEventListener("touchend", handleTouchEnd);
  scroller.addEventListener("touchcancel", handleTouchEnd);

  return () => {
    scroller.style.touchAction = previousTouchAction;
    scroller.removeEventListener("touchstart", handleTouchStart);
    scroller.removeEventListener("touchmove", handleTouchMove);
    scroller.removeEventListener("touchend", handleTouchEnd);
    scroller.removeEventListener("touchcancel", handleTouchEnd);
  };
}
