import { memo, useLayoutEffect, useRef } from "react";

const VOLUME_CSS = `:host { width: var(--volumeWidth, 60px); display: flex; align-items: center; } label { position: absolute; clip-path: inset(0px 0px 99.9% 99.9%); overflow: hidden; height: 1px; width: 1px; padding: 0px; border: 0px; } input[type="range"] { --progress: 0%; margin: 0px; padding: 0px; width: 100%; max-width: 100%; height: var(--progress-track-max-height, auto); display: block; border: 0px; background-color: transparent; cursor: pointer; appearance: none; -webkit-appearance: none; color: rgb(229, 229, 229); } input[type="range"]::-webkit-slider-runnable-track { height: var(--progress-track-height, 3px); display: block; color: transparent; border-color: var(--progress-thumb-color-outline, transparent); border-radius: var(--progress-track-height, 3px); background-color: var(--progress-track-buffering-bg-color, transparent); background-image: var(--progress-track-buffering-bg-image, linear-gradient(var(--track-direction, 90deg), var(--progress-track-color-elapsed, #e5e5e5) var(--progress), var(--progress-track-color, #414141) var(--progress))); background-repeat: no-repeat; background-position: center center; background-size: 100% var(--progress-track-bg-height, var(--progress-track-height, 3px)); cursor: var(--progress-track-cursor, pointer); appearance: none; } input[type="range"]::-webkit-slider-runnable-track:focus { outline: none; } input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: var(--progress-thumb-width, var(--progress-thumb-height, 9px)); height: var(--progress-thumb-height, 9px); box-sizing: border-box; margin-top: calc((var(--progress-track-height, 3px) - var(--progress-thumb-height, 9px)) / 2); border-radius: var(--progress-thumb-border-radius, 50%); border-bottom: var(--progress-thumb-border-bottom-width, 0) solid var(--progress-thumb-color-bottom-outline, transparent); background-color: var(--progress-thumb-color, white); background-position: center center; outline: 1px solid var(--progress-thumb-outline-active, transparent); box-shadow: var(--volume-thumb-box-shadow, var(--progress-thumb-box-shadow, none)); opacity: var(--thumb-opacity, 1); cursor: pointer; transform: scale(var(--progress-thumb-multiplier-active, 1)); transition: transform 0.1s ease-in-out, opacity 0.1s ease-in, background-color 0.1s ease-in; } input[type="range"]:hover, input[type="range"]:active, input[type="range"]:focus { --progress-thumb-color: var(--progress-thumb-color-active, white); --progress-thumb-multiplier-active: var(--progress-thumb-multiplier, 1); --progress-thumb-outline-active: var(--progress-thumb-outline-active-alt, var(--progress-thumb-color-outline)); --progress-track-color-elapsed: var(--progress-track-color-elapsed-active); border: none; outline: none; } @supports (-moz-appearance: none) { input[type="range"] { height: var(--progress-track-max-height, 3px); } } input[type="range"][dir="rtl"] { --track-direction: -90deg; } input[type="range"]:disabled { --thumb-opacity: 0; pointer-events: none; }`;

type AmpVolumeControlProps = {
  volume: number;
  onSetVolume: (volume: number) => void;
};

const AmpVolumeControl = memo(function AmpVolumeControl({
  volume,
  onSetVolume,
}: AmpVolumeControlProps) {
  const containerRef = useRef<HTMLElement>(null);
  const onSetVolumeRef = useRef(onSetVolume);
  onSetVolumeRef.current = onSetVolume;

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const shadow = el.shadowRoot || el.attachShadow({ mode: "open" });

    if (
      "adoptedStyleSheets" in document &&
      shadow.adoptedStyleSheets.length === 0
    ) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(VOLUME_CSS);
      shadow.adoptedStyleSheets = [sheet];
    }

    let input = shadow.querySelector("input");
    if (!input) {
      input = document.createElement("input");
      input.type = "range";
      input.min = "0";
      input.max = "1";
      input.step = ".01";
      input.dir = "ltr";
      input.setAttribute("aria-label", "Volume");
      input.setAttribute("role", "slider");
      input.setAttribute("aria-valuemin", "0");
      input.setAttribute("aria-valuemax", "1");
      input.setAttribute("aria-orientation", "horizontal");

      shadow.appendChild(input);
    }

    const handleInput = (e: Event) => {
      const val = Number((e.target as HTMLInputElement).value);
      onSetVolumeRef.current?.(val);
    };

    input.addEventListener("input", handleInput);

    return () => {
      input?.removeEventListener("input", handleInput);
    };
  }, []);

  useLayoutEffect(() => {
    const shadow = containerRef.current?.shadowRoot;
    const input = shadow?.querySelector("input");
    if (input) {
      const percent = Math.round(volume * 100);
      input.value = String(volume);
      input.setAttribute("aria-valuenow", String(volume));
      input.setAttribute("aria-valuetext", `${percent}%`);
      input.style.setProperty("--progress", `${percent}%`);
    }
  }, [volume]);

  const AmpVolumeTag = "amp-volume-control" as unknown as React.ComponentType<{
    ref: React.RefObject<HTMLElement | null>;
    class?: string;
    hydrated?: string;
  }>;

  return <AmpVolumeTag ref={containerRef} hydrated="" />;
});

export default AmpVolumeControl;
