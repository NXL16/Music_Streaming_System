"use client";

import { memo, useLayoutEffect, useRef } from "react";

const APPLE_CSS = `:host{--playback-control-icon-width:var(--skip-icon-width, 32px);--playback-control-icon-height:var(--skip-icon-height, 28px);width:var(--playback-control-button-width, 32px);height:var(--playback-control-button-height, 32px);display:flex;flex:0 0 auto;align-items:stretch;justify-content:stretch;position:relative}:host button{width:100%;height:100%;position:relative;transition:color 0.2s ease-out}:host amp-icon{width:var(--playback-control-icon-width, 32px);height:var(--playback-control-icon-height, 28px);display:block;position:absolute;top:50%;left:50%;transform:translate(-50%, -50%)}button{margin:0;padding:0;display:inline-block;border:0;background-color:transparent;outline:none;cursor:pointer;appearance:none;font-family:inherit;font-size:inherit;line-height:inherit;width:100%;height:100%;color:var(--skip-control-color, var(--white80, rgba(255, 255, 255, 0.8)));background-position:center;background-size:contain}button::-moz-focus-inner{border:0}button:hover:not([disabled]),button:focus-visible:not([disabled]){color:var(--skip-control-color-hover, var(--skip-control-color, #fff))}button:disabled{opacity:0.4;cursor:default}:host([data-theme*=video]) button amp-icon{color:#e5e5e5}button:focus-visible{--sk-focus-offset:2px;outline:4px solid var(--sk-focus-color, var(--keyColor-focus-color, var(--keyColor, #0071e3)));outline-offset:var(--sk-focus-offset, 1px)}.button--previous{transform:rotate(180deg)}.button_label{position:absolute;clip:rect(1px, 1px, 1px, 1px);clip-path:inset(0 0 99.9% 99.9%);overflow:hidden;height:1px;width:1px;padding:0;border:0}`;

const SKIP_PATH =
  "M18.14 20.68c.365 0 .672-.107 1.038-.323l8.508-4.997c.623-.365.938-.814.938-1.37 0-.564-.307-.988-.938-1.361l-8.508-4.997c-.366-.216-.68-.324-1.046-.324-.73 0-1.337.556-1.337 1.569v4.773c-.108-.399-.406-.73-.904-1.021L7.382 7.632c-.357-.216-.672-.324-1.037-.324-.73 0-1.345.556-1.345 1.569v10.235c0 1.013.614 1.569 1.345 1.569.365 0 .68-.108 1.037-.324l8.509-4.997c.49-.29.796-.631.904-1.038v4.79c0 1.013.615 1.569 1.345 1.569z";

interface AmpSkipButtonProps {
  direction: "previous" | "next";
  onClick?: () => void;
  disabled?: boolean;
}

const AmpSkipButton = memo(function AmpSkipButton({
  direction,
  onClick,
  disabled = false,
}: AmpSkipButtonProps) {
  const containerRef = useRef<HTMLElement>(null);
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

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

      const isPrevious = direction === "previous";
      button.className = isPrevious ? "button--previous" : "button-next";
      const labelText = isPrevious ? "PREVIOUS" : "NEXT";

      const rawSVG = `<svg width="32" height="28" viewBox="0 0 32 28" xmlns="http://www.w3.org/2000/svg"><path d="${SKIP_PATH}" fill="#000" fill-rule="nonzero"></path></svg>`;
      const encodedSVG = rawSVG.replace(/"/g, "&quot;");

      button.innerHTML = `<amp-icon class="icon" role="presentation" aria-hidden="true" innerhtml="${encodedSVG}" name="player-next" hydrated="">${rawSVG}</amp-icon><span class="button_label">${labelText}</span>`;

      const inlineStyle = document.createElement("style");
      inlineStyle.textContent = `.icon{display:block}.icon svg{width:inherit;height:inherit;display:block;color:currentColor;pointer-events:none}.icon svg *{fill:currentColor}`;

      shadow.appendChild(button);
      shadow.appendChild(inlineStyle);
    }

    const handleClick = () => {
      onClickRef.current?.();
    };
    button.addEventListener("click", handleClick);

    return () => {
      button?.removeEventListener("click", handleClick);
    };
  }, [direction]);

  useLayoutEffect(() => {
    const shadow = containerRef.current?.shadowRoot;
    const btn = shadow?.querySelector("button");
    if (btn) {
      if (disabled) {
        btn.setAttribute("disabled", "");
      } else {
        btn.removeAttribute("disabled");
      }
    }
  }, [disabled]);

  const AmpSkipTag =
    "amp-playback-controls-item-skip" as unknown as React.ComponentType<{
      ref: React.RefObject<HTMLElement | null>;
      direction: "previous" | "next";
      class: string;
      hydrated?: string;
    }>;

  return (
    <AmpSkipTag
      ref={containerRef}
      direction={direction}
      class={direction}
      hydrated=""
    />
  );
});

export default AmpSkipButton;
