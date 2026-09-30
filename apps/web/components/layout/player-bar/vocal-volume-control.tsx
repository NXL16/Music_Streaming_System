import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

type VocalVolumeControlProps = {
  value: number;
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onValueChange: (value: number) => void;
  onPreviewValueChange: (value: number) => void;
};

const OPEN_DURATION_MS = 161;
const EXPAND_DURATION_MS = 320;
const CLOSE_DURATION_MS = 400;
const AUTO_REDUCE_DURATION_MS = 1000;
const AUTO_REDUCE_TARGET = 0.1;
const MAX_STRETCH = 0.07;
const ACTIVE_ICON_COLOR = "var(--systemPrimary-onLight)";
const INACTIVE_ICON_COLOR = "var(--systemPrimary-onDark)";

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const isAtFullVolume = (value: number) => value >= 0.995;
const easeOutCubic = (progress: number) => 1 - (1 - progress) ** 3;

// Keep the stretch responsive near an edge, without letting it grow endlessly.
const rubberBand = (distance: number) =>
  Math.min(MAX_STRETCH, (1 - 1 / (distance * 4 + 1)) * MAX_STRETCH);

type SliderBounds = {
  bottom: number;
  height: number;
};

function VocalMark({ isOpen = false }) {
  return (
    <svg
      aria-hidden
      className={`fill-current ${isOpen ? "size-7" : ""}`}
      height="25"
      viewBox="0 0 512 512"
      width="25"
    >
      <g
        transform="translate(0.000000,512.000000) scale(0.100000,-0.100000)"
        stroke="none"
      >
        <path d="M3555 4781 c-133 -36 -281 -120 -365 -206 l-34 -36 524 -524 c289 -289 530 -525 535 -525 6 0 29 21 50 47 165 197 236 400 206 592 -27 174 -90 292 -230 432 -163 163 -304 229 -506 235 -86 3 -125 0 -180 -15z" />
        <path d="M1114 4346 c-12 -10 -39 -78 -79 -203 l-61 -188 -208 -5 -209 -5 -19 -26 c-33 -43 -14 -66 154 -184 84 -60 157 -112 162 -116 4 -4 -19 -90 -53 -191 -33 -100 -61 -193 -61 -206 0 -34 36 -65 68 -57 14 3 83 48 152 99 69 50 140 102 158 115 l32 23 159 -116 c87 -63 169 -118 184 -121 31 -8 67 23 67 59 0 12 -27 103 -60 201 -33 98 -59 182 -58 186 2 4 75 58 163 121 147 104 160 116 163 147 2 21 -3 40 -14 52 -16 18 -33 19 -224 19 l-207 0 -12 43 c-52 178 -106 332 -122 348 -23 23 -48 24 -75 5z" />
        <path d="M2919 4303 c-143 -152 -219 -329 -219 -513 l0 -95 -896 -960 c-493 -528 -907 -976 -920 -995 -35 -53 -41 -117 -15 -171 11 -24 26 -51 32 -60 10 -14 -7 -41 -109 -172 -67 -85 -127 -166 -133 -181 -16 -35 2 -75 57 -126 72 -66 84 -63 278 90 l166 130 41 -27 c57 -38 130 -42 186 -11 23 13 476 425 1008 916 l966 892 70 0 c187 0 385 84 551 233 l37 33 -527 527 c-290 290 -530 527 -533 527 -2 0 -21 -17 -40 -37z m-66 -955 c44 -62 134 -153 192 -195 27 -19 28 -23 15 -37 -8 -8 -411 -388 -895 -845 l-880 -831 -88 88 c-48 47 -86 90 -85 93 4 9 1688 1789 1692 1789 3 0 24 -28 49 -62z" />
        <path d="M3980 2440 c-11 -11 -51 -117 -95 -255 l-76 -235 -249 0 c-164 0 -258 -4 -274 -11 -13 -7 -30 -25 -37 -41 -22 -52 5 -80 213 -228 104 -74 195 -138 200 -141 7 -4 -21 -101 -71 -251 -52 -155 -79 -252 -75 -264 13 -37 36 -54 73 -54 31 0 66 22 239 149 l204 149 188 -138 c104 -76 198 -144 209 -149 54 -30 121 2 121 58 0 15 -36 132 -80 260 l-80 232 46 32 c374 262 395 281 380 342 -13 50 -43 55 -314 55 l-248 0 -77 238 c-45 139 -84 246 -95 255 -25 23 -77 22 -102 -3z" />
        <path d="M2488 1238 c-9 -7 -40 -84 -68 -170 l-51 -158 -169 0 c-185 0 -204 -6 -198 -59 2 -21 30 -46 140 -124 l136 -97 -49 -147 c-27 -81 -49 -159 -49 -173 0 -32 17 -50 46 -50 16 0 162 99 279 190 6 5 69 -35 144 -91 80 -59 143 -99 157 -99 14 0 30 10 39 24 14 22 12 33 -39 184 l-54 161 136 98 c109 78 138 103 140 124 6 53 -13 59 -198 59 l-169 0 -51 160 c-35 110 -57 163 -70 170 -24 13 -33 13 -52 -2z" />
      </g>
    </svg>
  );
}

export function VocalVolumeControl({
  value,
  isExpanded,
  onExpandedChange,
  onValueChange,
  onPreviewValueChange,
}: VocalVolumeControlProps) {
  const controlRef = useRef<HTMLDivElement>(null);
  const rampFrameRef = useRef<number | null>(null);
  const previewFrameRef = useRef<number | null>(null);
  const dragValueRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const sliderBoundsRef = useRef<SliderBounds | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const valueRef = useRef(value);
  const percent = Math.round(clamp(value) * 100);
  const iconColor =
    percent >= 24 ? ACTIVE_ICON_COLOR : INACTIVE_ICON_COLOR;
  const previewValueChange = onPreviewValueChange;

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (isExpanded || !isClosing) return;
    const timer = window.setTimeout(() => setIsClosing(false), CLOSE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [isExpanded, isClosing]);

  const stopAutoReduce = () => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (rampFrameRef.current !== null) {
      window.cancelAnimationFrame(rampFrameRef.current);
      rampFrameRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (openTimerRef.current !== null)
        window.clearTimeout(openTimerRef.current);
      if (rampFrameRef.current !== null) {
        window.cancelAnimationFrame(rampFrameRef.current);
      }
      if (previewFrameRef.current !== null) {
        window.cancelAnimationFrame(previewFrameRef.current);
      }
    };
  }, []);

  const schedulePreview = () => {
    if (previewFrameRef.current !== null) return;

    previewFrameRef.current = window.requestAnimationFrame(() => {
      previewFrameRef.current = null;
      const nextValue = dragValueRef.current;
      if (nextValue !== null) previewValueChange(nextValue);
    });
  };

  const flushDragValue = (): number | null => {
    if (previewFrameRef.current !== null) {
      window.cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = null;
    }
    const nextValue = dragValueRef.current;
    dragValueRef.current = null;
    if (nextValue !== null) {
      previewValueChange(nextValue);
      onValueChange(nextValue);
    }
    return nextValue;
  };

  const collapseControl = () => {
    stopAutoReduce();
    setIsOpening(false);
    setIsClosing(true);
    controlRef.current?.style.setProperty(
      "--vocal-volume-transition",
      `${CLOSE_DURATION_MS}ms`,
    );
    controlRef.current?.style.setProperty("--vocal-volume-stretch", "1");
    onExpandedChange(false);
  };

  const updateDragVisual = (nextValue: number) => {
    const nextPercent = Math.round(clamp(nextValue) * 100);
    fillRef.current?.style.setProperty(
      "transform",
      `translate3d(0,0,0) scale3d(1,${nextPercent / 100},1)`,
    );
    iconRef.current?.style.setProperty(
      "color",
      nextPercent >= 24 ? ACTIVE_ICON_COLOR : INACTIVE_ICON_COLOR,
    );
  };

  const setValueFromPointer = (event: PointerEvent<HTMLButtonElement>) => {
    const bounds = sliderBoundsRef.current;
    if (!bounds) return;
    const rawValue = (bounds.bottom - event.clientY) / bounds.height;
    const overflow = rawValue < 0 ? rawValue : rawValue > 1 ? rawValue - 1 : 0;
    const elasticity =
      overflow === 0 ? 0 : Math.sign(overflow) * rubberBand(Math.abs(overflow));
    controlRef.current?.style.setProperty(
      "--vocal-volume-stretch",
      String(1 + Math.abs(elasticity)),
    );
    controlRef.current?.style.setProperty(
      "--vocal-volume-stretch-origin",
      elasticity > 0 ? "bottom" : "top",
    );
    const nextValue = clamp(rawValue);
    updateDragVisual(nextValue);
    dragValueRef.current = nextValue;
    schedulePreview();
  };

  const releaseDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    sliderBoundsRef.current = null;
    const nextValue = flushDragValue();
    controlRef.current?.style.setProperty(
      "--vocal-volume-transition",
      `${CLOSE_DURATION_MS}ms`,
    );
    controlRef.current?.style.setProperty("--vocal-volume-stretch", "1");
    if (nextValue !== null && isAtFullVolume(nextValue)) collapseControl();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const increment = event.shiftKey ? 0.1 : 0.05;
    const nextValue =
      event.key === "ArrowUp" || event.key === "ArrowRight"
        ? value + increment
        : event.key === "ArrowDown" || event.key === "ArrowLeft"
          ? value - increment
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? 1
              : null;
    if (nextValue === null) return;
    event.preventDefault();
    stopAutoReduce();
    const clampedValue = clamp(nextValue);
    onValueChange(clampedValue);
    if (isAtFullVolume(clampedValue)) collapseControl();
  };

  const startAutoReduce = () => {
    setIsOpening(false);
    const startValue = valueRef.current;
    const targetValue = Math.min(startValue, AUTO_REDUCE_TARGET);
    if (startValue <= targetValue) return;
    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / AUTO_REDUCE_DURATION_MS);
      const nextValue =
        startValue - (startValue - targetValue) * easeOutCubic(progress);
      updateDragVisual(nextValue);
      previewValueChange(nextValue);
      if (progress < 1) {
        rampFrameRef.current = window.requestAnimationFrame(step);
        return;
      }
      rampFrameRef.current = null;
      onValueChange(targetValue);
    };
    rampFrameRef.current = window.requestAnimationFrame(step);
  };

  const openControl = () => {
    if (isExpanded || isClosing) return;
    stopAutoReduce();
    controlRef.current?.style.setProperty(
      "--vocal-volume-transition",
      `${EXPAND_DURATION_MS}ms`,
    );
    onExpandedChange(true);
    setIsOpening(true);
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null;
      startAutoReduce();
    }, OPEN_DURATION_MS);
  };

  const showSlider = isExpanded || isClosing;

  return (
    <div className="absolute inset-e-5 top-5 z-[calc(var(--z-default)+1)]">
      <div
        ref={controlRef}
        className={`relative grid place-items-center overflow-hidden bg-(--systemQuaternary-onDark) text-(--systemPrimary-onDark) backdrop-blur-[60px] backface-hidden will-change-transform transform-[translate3d(0,0,0)_scale3d(1,var(--vocal-volume-stretch,1),1)] origin-(--vocal-volume-stretch-origin,center) transition-[width,height,border-radius,transform] duration-(--vocal-volume-transition,320ms) ease-out ${isExpanded ? "h-27.5 w-10.5 rounded-[999px]" : "size-10 rounded-full hover:scale-105 hover:bg-(--systemTertiary-onDark)"}`}
      >
        {!showSlider ? (
          <button
            aria-expanded={false}
            aria-label="Điều chỉnh giọng hát"
            className="relative z-10 grid size-full place-items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--systemPrimary-onDark)"
            onClick={openControl}
            type="button"
          >
            <VocalMark />
          </button>
        ) : (
          <button
            aria-label="Âm lượng giọng hát"
            aria-orientation="vertical"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={percent}
            aria-valuetext={`${percent}%`}
            className={`group relative z-10 size-full touch-none overflow-hidden outline-none transition-opacity duration-250 ring-offset-2 ring-offset-transparent focus-visible:ring-2 focus-visible:ring-(--systemPrimary-onDark) ${isOpening ? "pointer-events-none opacity-0" : isClosing ? "pointer-events-none opacity-100" : "opacity-100"}`}
            onKeyDown={handleKeyDown}
            onPointerDown={(event) => {
              stopAutoReduce();
              isDraggingRef.current = true;
              const bounds = event.currentTarget.getBoundingClientRect();
              sliderBoundsRef.current = {
                bottom: bounds.bottom,
                height: event.currentTarget.offsetHeight,
              };
              controlRef.current?.style.setProperty(
                "--vocal-volume-transition",
                "0ms",
              );
              event.currentTarget.setPointerCapture(event.pointerId);
              setValueFromPointer(event);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                setValueFromPointer(event);
            }}
            onPointerCancel={releaseDrag}
            onLostPointerCapture={releaseDrag}
            onPointerUp={releaseDrag}
            role="slider"
            type="button"
          >
            <span
              ref={fillRef}
              aria-hidden
              className={`absolute inset-0 origin-bottom bg-(--systemPrimary-onDark) transition-opacity duration-200 will-change-transform ${isClosing ? "delay-[140ms] opacity-0" : "opacity-100"}`}
              style={{
                transform: `translate3d(0,0,0) scale3d(1,${percent / 100},1)`,
              }}
            />
            <span
              ref={iconRef}
              aria-hidden
              className={`absolute inset-s-1/2 z-10 -translate-x-1/2 transition-[bottom,color,transform] duration-[400ms] ease-out ${isClosing ? "bottom-1.5 scale-[0.892857] delay-[140ms]" : "bottom-3"}`}
              style={{
                color: isClosing ? INACTIVE_ICON_COLOR : iconColor,
              }}
            >
              <VocalMark isOpen />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
