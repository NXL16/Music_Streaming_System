"use client";

import { useLayoutEffect, useRef } from "react";
import type { RepeatMode } from "@/lib/player/use-player-store";

const APPLE_CSS = `:host{--playback-control-button-width:var(--shuffle-repeat-button-width, 32px);--playback-control-icon-height:var(--shuffle-repeat-icon-height, 28px);width:var(--playback-control-button-width, 32px);height:var(--playback-control-button-height, 32px);display:flex;flex:0 0 auto;align-items:stretch;justify-content:stretch;position:relative}:host button{width:100%;height:100%;position:relative;transition:color 0.2s ease-out}:host amp-icon{width:var(--playback-control-icon-width, 32px);height:var(--playback-control-icon-height, 28px);display:block;position:absolute;top:50%;left:50%;transform:translate(-50%, -50%)}:host button{cursor:default}.button--repeat{margin:0;padding:0;display:inline-block;border:0;background-color:transparent;outline:none;cursor:pointer;appearance:none;font-family:inherit;font-size:inherit;line-height:inherit;font-size:0;color:var(--systemSecondary);cursor:pointer}.button--repeat::-moz-focus-inner{border:0}.button--repeat:enabled{cursor:pointer}.button--repeat:hover{color:var(--systemPrimary-vibrant)}.button--repeat:disabled{opacity:0.4;cursor:default}.button--repeat:enabled:active,.button--repeat.button--repeat.mode--1,.button--repeat.button--repeat.mode--2{color:var(--keyColor, var(--musicKeyColor, var(--systemBlue)))}`;

const REPEAT_PATH =
  "M9.545 14.272a.856.856 0 00.863-.855v-.448c0-1.004.706-1.677 1.785-1.677h5.005v1.362c0 .407.258.664.673.664a.745.745 0 00.49-.183l2.581-2.166c.316-.266.316-.69 0-.955l-2.581-2.183a.745.745 0 00-.49-.183c-.415 0-.672.258-.672.665v1.294h-4.881c-2.217 0-3.628 1.254-3.628 3.213v.597c0 .474.382.855.855.855zm4.864 5.952c.407 0 .664-.257.664-.664v-1.303h4.881c2.225 0 3.628-1.254 3.628-3.213v-.597a.854.854 0 10-1.71 0v.448c0 1.004-.714 1.677-1.793 1.677h-5.006v-1.353c0-.407-.257-.664-.664-.664a.767.767 0 00-.498.182l-2.573 2.175c-.324.257-.315.68 0 .946l2.573 2.192a.807.807 0 00.498.174z";

const REPEAT_ONE_SINGLE_PATH =
  "M22.752 12.313c.473 0 .747-.257.747-.771V8.503c0-.54-.357-.904-.888-.904-.44 0-.698.14-1.038.398l-.838.656c-.2.15-.266.299-.266.473 0 .257.19.465.498.465.133 0 .24-.042.349-.125l.614-.514h.058v2.59c0 .514.274.771.764.771zm-13.207 1.96a.84.84 0 00.863-.856v-.448c0-1.004.706-1.677 1.785-1.677h3.403v1.362c0 .407.258.664.673.664a.745.745 0 00.49-.183l2.581-2.166c.316-.266.316-.69 0-.955L16.76 7.831a.745.745 0 00-.49-.183c-.415 0-.673.258-.673.665v1.294h-3.278c-2.217 0-3.628 1.254-3.628 3.213v.597c0 .49.374.855.855.855zm4.864 5.951c.407 0 .664-.257.664-.664v-1.303h4.881c2.225 0 3.628-1.254 3.628-3.213v-.597a.838.838 0 00-.855-.855.833.833 0 00-.855.855v.448c0 1.004-.714 1.677-1.793 1.677h-5.006v-1.353c0-.407-.257-.664-.664-.664a.767.767 0 00-.498.182l-2.573 2.175c-.324.257-.315.68 0 .946l2.573 2.192a.807.807 0 00.498.174z";

type AmpRepeatButtonProps = {
  mode: RepeatMode;
  disabled?: boolean;
  onCycle: () => void;
};

export default function AmpRepeatButton({
  mode,
  disabled = false,
  onCycle,
}: AmpRepeatButtonProps) {
  const containerRef = useRef<HTMLElement>(null);
  const onCycleRef = useRef(onCycle);

  useLayoutEffect(() => {
    onCycleRef.current = onCycle;
  }, [onCycle]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const shadow = el.shadowRoot || el.attachShadow({ mode: "open" });

    if (
      "adoptedStyleSheets" in document &&
      shadow.adoptedStyleSheets.length === 0
    ) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(APPLE_CSS);
      shadow.adoptedStyleSheets = [sheet];
    }

    let button = shadow.querySelector("button");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "switch");

      const encodedSVG = `&lt;svg width=&quot;32&quot; height=&quot;28&quot; viewBox=&quot;0 0 32 28&quot; xmlns=&quot;http://www.w3.org/2000/svg&quot;&gt;&lt;path d=&quot;${REPEAT_PATH}&quot; fill=&quot;#000&quot; fill-rule=&quot;nonzero&quot;&gt;&lt;/path&gt;&lt;/svg&gt;`;
      button.innerHTML = `**MediaComponents.Playback.Repeat**<amp-icon class="icon" role="presentation" aria-hidden="true" innerhtml="${encodedSVG}" name="player-repeat" hydrated=""><svg width="32" height="28" viewBox="0 0 32 28" xmlns="http://www.w3.org/2000/svg"><path d="${REPEAT_PATH}" fill="#000" fill-rule="#nonzero"></path></svg></amp-icon>`;

      const inlineStyle = document.createElement("style");
      inlineStyle.textContent = `.icon{display:block}.icon svg{width:inherit;height:inherit;display:block;color:currentColor;pointer-events:none}.icon svg *{fill:currentColor}`;

      shadow.appendChild(button);
      shadow.appendChild(inlineStyle);
    }

    const handleClick = () => onCycleRef.current();
    button.addEventListener("click", handleClick);
    return () => button.removeEventListener("click", handleClick);
  }, []);

  useLayoutEffect(() => {
    const shadow = containerRef.current?.shadowRoot;
    const btn = shadow?.querySelector<HTMLButtonElement>("button");
    const ampIcon = shadow?.querySelector("amp-icon");

    if (btn && ampIcon) {
      btn.disabled = disabled;
      btn.className = "";
      btn.classList.add(`button--repeat`, `mode--${mode}`);
      btn.setAttribute("aria-checked", mode > 0 ? "true" : "false");

      let currentPath = REPEAT_PATH;
      let iconName = "player-repeat";

      if (mode === 1) {
        btn.childNodes[0].textContent = "Repeat one";
        currentPath = REPEAT_ONE_SINGLE_PATH;
        iconName = "player-repeat-1";
      } else if (mode === 2) {
        btn.childNodes[0].textContent = "Repeat all";
        currentPath = REPEAT_PATH;
        iconName = "player-repeat";
      } else {
        btn.childNodes[0].textContent = "Repeat";
        currentPath = REPEAT_PATH;
        iconName = "player-repeat";
      }

      const rawSVG = `<svg width="32" height="28" viewBox="0 0 32 28" xmlns="http://www.w3.org/2000/svg"><path d="${currentPath}" fill="#000" fill-rule="nonzero"></path></svg>`;
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = rawSVG;
      const encodedSVG = tempDiv.innerHTML;

      ampIcon.setAttribute("name", iconName);
      ampIcon.setAttribute("innerhtml", encodedSVG);
      ampIcon.innerHTML = rawSVG;
    }
  }, [disabled, mode]);

  const AmpRepeatTag =
    "amp-playback-controls-repeat" as unknown as React.ComponentType<{
      ref: React.RefObject<HTMLElement | null>;
      hydrated?: string;
    }>;

  return <AmpRepeatTag ref={containerRef} hydrated="" />;
}
