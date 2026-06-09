"use client";

import { useState, useLayoutEffect, useRef } from "react";

const APPLE_CSS = `:host{--playback-control-button-width:var(--shuffle-repeat-button-width, 32px);--playback-control-icon-height:var(--shuffle-repeat-icon-height, 28px);width:var(--playback-control-button-width, 32px);height:var(--playback-control-button-height, 32px);display:flex;flex:0 0 auto;align-items:stretch;justify-content:stretch;position:relative}:host button{width:100%;height:100%;position:relative;transition:color 0.2s ease-out}:host amp-icon{width:var(--playback-control-icon-width, 32px);height:var(--playback-control-icon-height, 28px);display:block;position:absolute;top:50%;left:50%;transform:translate(-50%, -50%)}:host button{cursor:default}:host button:focus-visible{--sk-focus-offset:2px;outline:4px solid var(--sk-focus-color, var(--keyColor-focus-color, var(--keyColor, #0071e3)));outline-offset:var(--sk-focus-offset, 1px)}.button--shuffle{margin:0;padding:0;display:inline-block;border:0;background-color:transparent;outline:none;cursor:pointer;appearance:none;font-family:inherit;font-size:inherit;line-height:inherit;font-size:0;color:var(--systemSecondary)}.button--shuffle::-moz-focus-inner{border:0}.button--shuffle:enabled{cursor:pointer}.button--shuffle:hover{color:var(--systemPrimary-vibrant)}.button--shuffle:disabled{opacity:0.4;cursor:default}.button--shuffle:enabled:active,.button--shuffle.shuffled{color:var(--keyColor, var(--musicKeyColor, var(--systemBlue)))}`;

const SHUFFLE_PATH =
  "M20.767 20.44a.81.81 0 00.49-.183l2.58-2.174c.316-.266.316-.681 0-.955l-2.58-2.183a.81.81 0 00-.49-.183c-.415 0-.673.258-.673.673v1.245h-1.162c-.739 0-1.195-.233-1.718-.847l-1.527-1.801 1.527-1.81c.54-.63.946-.847 1.677-.847h1.203v1.279c0 .407.258.664.673.664a.801.801 0 00.49-.174l2.58-2.175c.316-.266.316-.69 0-.955l-2.58-2.183a.761.761 0 00-.49-.183c-.415 0-.673.258-.673.665v1.386h-1.212c-1.228 0-1.992.34-2.863 1.386l-1.412 1.668-1.469-1.751c-.805-.946-1.569-1.303-2.747-1.303H8.896c-.53 0-.896.348-.896.838s.365.838.896.838h1.437c.697 0 1.162.225 1.685.847l1.519 1.801-1.52 1.81c-.53.623-.954.847-1.643.847H8.896c-.53 0-.896.348-.896.838s.365.838.896.838h1.536c1.179 0 1.901-.356 2.706-1.303l1.478-1.751 1.444 1.718c.822.98 1.627 1.336 2.822 1.336h1.212v1.412c0 .415.258.672.673.672z";

export default function AmpShuffleButton() {
  const containerRef = useRef<HTMLElement>(null);
  const [isShuffled, setIsShuffled] = useState(false);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let shadow = el.shadowRoot;
    if (!shadow) {
      shadow = el.attachShadow({ mode: "open" });
    }

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

      button.setAttribute("disabled", "");
      button.setAttribute("role", "switch");

      const encodedSVG = `&lt;svg width=&quot;32&quot; height=&quot;28&quot; viewBox=&quot;0 0 32 28&quot; xmlns=&quot;http://www.w3.org/2000/svg&quot;&gt;&lt;path d=&quot;${SHUFFLE_PATH}&quot;&gt;&lt;/path&gt;&lt;/svg&gt;`;
      button.innerHTML = `**MediaComponents.Playback.Shuffle**<amp-icon class="icon" role="presentation" aria-hidden="true" innerhtml="${encodedSVG}" name="player-shuffle" hydrated=""><svg width="32" height="28" viewBox="0 0 32 28" xmlns="http://www.w3.org/2000/svg"><path d="${SHUFFLE_PATH}"></path></svg></amp-icon>`;

      const handleClick = () => {
        setIsShuffled((prev) => !prev);
      };
      button.addEventListener("click", handleClick);

      const inlineStyle = document.createElement("style");
      inlineStyle.textContent = `.icon{display:block}.icon svg{width:inherit;height:inherit;display:block;color:currentColor;pointer-events:none}.icon svg *{fill:currentColor}`;

      shadow.appendChild(button);
      shadow.appendChild(inlineStyle);
    }

    button.className = "button--shuffle";
    button.setAttribute("aria-checked", "false");
  }, []);

  useLayoutEffect(() => {
    const shadow = containerRef.current?.shadowRoot;
    const btn = shadow?.querySelector(".button--shuffle");
    if (btn) {
      if (isShuffled) {
        btn.classList.add("shuffled");
        btn.setAttribute("aria-checked", "true");
      } else {
        btn.classList.remove("shuffled");
        btn.setAttribute("aria-checked", "false");
      }
    }
  }, [isShuffled]);

  const AmpShuffleTag =
    "amp-playback-controls-shuffle" as unknown as React.ComponentType<{
      ref: React.RefObject<HTMLElement | null>;
      hydrated?: string;
    }>;

  return <AmpShuffleTag ref={containerRef} hydrated="" />;
}
