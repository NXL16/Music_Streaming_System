const TRACK_CLASS_NAME = "animated-range-track";

type AnimatedRangeTrackOptions = {
  activeHostSelector: string;
  enabledHostSelector: string;
  input: HTMLInputElement;
  insertPosition: InsertPosition;
  shadow: ShadowRoot;
};

export function ensureAnimatedRangeTrack({
  activeHostSelector,
  enabledHostSelector,
  input,
  insertPosition,
  shadow,
}: AnimatedRangeTrackOptions) {
  if (!shadow.querySelector("style[data-animated-range-track]")) {
    const style = document.createElement("style");
    style.dataset.animatedRangeTrack = "";
    style.textContent = `
      ${enabledHostSelector} { position: relative; }
      ${enabledHostSelector} .${TRACK_CLASS_NAME} {
        --animated-track-height: var(--progress-track-height);
        background: var(--progress-track-color);
        border-radius: var(--animated-track-height);
        height: var(--animated-track-height);
        inset: 50% 0 auto;
        overflow: hidden;
        pointer-events: none;
        position: absolute;
        transform: translateY(-50%);
        transition: height 220ms ease;
        z-index: 0;
      }
      ${enabledHostSelector} .${TRACK_CLASS_NAME}::before {
        background: var(--progress-track-color-elapsed);
        content: "";
        display: block;
        height: 100%;
        width: var(--progress, 0%);
      }
      ${enabledHostSelector} input[type="range"] {
        box-sizing: border-box;
        height: 44px;
        margin-block: -13px;
        opacity: 0;
        position: relative;
        touch-action: none;
        user-select: none;
        z-index: 1;
      }
      ${activeHostSelector} .${TRACK_CLASS_NAME} {
        --animated-track-height: var(--progress-track-height-active);
        background: var(--systemSecondary-onDark);
      }
      ${activeHostSelector} .${TRACK_CLASS_NAME}::before {
        background: var(--systemPrimary-onDark);
      }
    `;
    shadow.append(style);
  }

  let track = shadow.querySelector(
    `.${TRACK_CLASS_NAME}`,
  ) as HTMLElement | null;
  if (!track) {
    track = document.createElement("div");
    track.className = TRACK_CLASS_NAME;
    track.setAttribute("aria-hidden", "true");
    input.insertAdjacentElement(insertPosition, track);
  }

  return track;
}

export function renderAnimatedRangeTrack(
  track: HTMLElement | null | undefined,
  value: number,
) {
  track?.style.setProperty("--progress", `${value * 100}%`);
}
