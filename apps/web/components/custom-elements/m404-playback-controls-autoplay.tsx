"use client";

import { ElementType, useLayoutEffect, useRef } from "react";

const CustomAutoplayTag = "m404-playback-controls-autoplay" as ElementType;

const M404_CSS = `:host { width: 20px; height: 20px; display: flex; flex: 0 0 auto; align-items: stretch; justify-content: stretch; } button { width: 100%; height: 100%; } button:focus-visible { --sk-focus-offset: 2px; outline: 4px solid var(--sk-focus-color, var(--keyColor-focus-color, var(--keyColor, #0071e3))); outline-offset: var(--sk-focus-offset, 1px); } .autoplay { margin: 0px; padding: 0px; display: inline-block; border: 0px; background-color: transparent; outline: none; cursor: pointer; appearance: none; font-family: inherit; line-height: inherit; font-size: 0px; color: var(--systemSecondary); } .autoplay:enabled { cursor: pointer; } .autoplay:disabled { opacity: 0.4; cursor: default; } .autoplay:enabled:active, .autoplay:enabled.autoplay__active { color: var(--keyColor, var(--musicKeyColor, var(--systemBlue))); } .autoplay amp-icon { width: 100%; height: 100%; } .autoplay__button-label { position: absolute; clip: rect(1px, 1px, 1px, 1px); clip-path: inset(0px 0px 99.9% 99.9%); overflow: hidden; height: 1px; width: 1px; padding: 0px; border: 0px; }`;
const AUTOPLAY_PATH =
  "M14.596 15C17.1 15 19 13.075 19 10.522c0-2.552-1.89-4.488-4.383-4.488-1.709 0-3.078.906-4.617 3.056C8.323 6.84 7.07 6 5.404 6 2.9 6 1 7.925 1 10.478c0 2.552 1.89 4.488 4.383 4.488 1.709 0 3.078-.906 4.617-3.056 1.677 2.25 2.93 3.09 4.596 3.09zm-.011-1.802c-1.157 0-1.995-.638-3.545-2.687 1.348-1.97 2.324-2.72 3.556-2.72 1.507 0 2.6 1.142 2.6 2.698 0 1.567-1.104 2.709-2.611 2.709zm-9.18.011c-1.508 0-2.6-1.142-2.6-2.698 0-1.567 1.103-2.709 2.61-2.709 1.157 0 1.995.638 3.545 2.687-1.348 1.97-2.324 2.72-3.556 2.72z";
const ICON_STYLE = `.icon{display:block}.icon svg{width:inherit;height:inherit;display:block;color:currentColor;pointer-events:none}.icon svg *{fill:currentColor}`;

type M404AutoPlayProps = {
  enabled?: boolean;
  disabled?: boolean;
  onToggle?: () => void;
};

export default function M404AutoPlay({
  enabled = false,
  disabled = true,
  onToggle,
}: M404AutoPlayProps) {
  const containerRef = useRef<HTMLElement>(null);
  const onToggleRef = useRef(onToggle);

  useLayoutEffect(() => {
    onToggleRef.current = onToggle;
  }, [onToggle]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let shadow = el.shadowRoot;
    if (!shadow) shadow = el.attachShadow({ mode: "open" });

    if (
      "adoptedStyleSheets" in document &&
      shadow.adoptedStyleSheets.length === 0
    ) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(M404_CSS);
      shadow.adoptedStyleSheets = [sheet];
    }

    if (!shadow.querySelector("button")) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "switch");
      button.setAttribute("aria-checked", "false");
      button.setAttribute("class", "autoplay");

      const encodedSVG = `&lt;svg xmlns=&quot;http://www.w3.org/2000/svg&quot; viewBox=&quot;0 0 20 20&quot;&gt;&lt;path d=&quot;${AUTOPLAY_PATH}&quot; fill=&quot;#000&quot; fill-rule=&quot;nonzero&quot;&gt;&lt;/path&gt;&lt;/svg&gt;`;

      button.innerHTML = `
        <span class="autoplay__button-label">Auto Play</span>
        <amp-icon class="icon" role="presentation" aria-hidden="true" innerhtml="${encodedSVG}" name="player-autoplay" hydrated="">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
            <path d="${AUTOPLAY_PATH}" fill="#000" fill-rule="nonzero"></path>
          </svg>
        </amp-icon>
      `;

      const inlineStyle = document.createElement("style");
      inlineStyle.textContent = ICON_STYLE;

      shadow.appendChild(button);
      shadow.appendChild(inlineStyle);
    }

    const button = shadow.querySelector<HTMLButtonElement>("button");
    const handleClick = () => onToggleRef.current?.();
    button?.addEventListener("click", handleClick);
    return () => button?.removeEventListener("click", handleClick);
  }, []);

  useLayoutEffect(() => {
    const button =
      containerRef.current?.shadowRoot?.querySelector<HTMLButtonElement>(
        "button",
      );
    if (!button) return;
    button.disabled = disabled;
    button.classList.toggle("autoplay__active", enabled);
    button.setAttribute("aria-checked", String(enabled));
    button.title = enabled ? "Turn off Autoplay" : "Turn on Autoplay";
    const label = button.querySelector(".autoplay__button-label");
    if (label) label.textContent = button.title;
  }, [disabled, enabled]);

  return <CustomAutoplayTag ref={containerRef} hydrated="" />;
}
