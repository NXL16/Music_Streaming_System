"use client";

import { useLayoutEffect, useRef, useState, type ElementType } from "react";
import { createPortal } from "react-dom";
import { usePlayerStore } from "@/lib/player/use-player-store";

const M404CustomTag = "m404-playback-controls-exit" as ElementType;
const M404Icon = "m404-icon" as ElementType;

const M404_CSS = `button { margin: 0px; padding: 0px; display: inline-block; border: 0px; background-color: transparent; outline: none; cursor: pointer; appearance: none; font-family: inherit; font-size: inherit; line-height: inherit; } .playback-exit { width: 21px; height: 21px; position: absolute; z-index: 1; top: 20px; left: 20px; transition: opacity 0.2s ease-out; } .playback-exit m404-icon { width: 21px; height: 21px; color: rgba(255, 255, 255, 0.8); } .playback-exit:focus-visible { --sk-focus-color: var(--keyColor-focus-color, var(--white80, rgba(255, 255, 255, .8))); --sk-focus-offset: 2px; outline: 4px solid var(--sk-focus-color, var(--keyColor-focus-color, var(--keyColor, #0071e3))); outline-offset: var(--sk-focus-offset, 1px); } .playback-exit__hidden { opacity: 0; pointer-events: none; } .button__label { position: absolute; clip: rect(1px, 1px, 1px, 1px); clip-path: inset(0px 0px 99.9% 99.9%); overflow: hidden; height: 1px; width: 1px; padding: 0px; border: 0px; }`;
const COMPONENT_STYLE = `.icon{display:block}.icon svg{width:inherit;height:inherit;display:block;color:currentColor;pointer-events:none}.icon svg *{fill:currentColor}`;

export default function M404PlaybackControlsExit({
  controlsVisible,
}: {
  controlsVisible: boolean;
}) {
  const setVideoPlayerOpen = usePlayerStore(
    (state) => state.setVideoPlayerOpen,
  );
  const hostRef = useRef<HTMLElement>(null);
  const [shadowRoot, setShadowRoot] = useState<ShadowRoot | null>(null);

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    let shadow = el.shadowRoot;
    if (!shadow) shadow = el.attachShadow({ mode: "open" });

    if (
      "adoptedStyleSheets" in Document.prototype &&
      "adoptedStyleSheets" in ShadowRoot.prototype
    ) {
      if (shadow.adoptedStyleSheets.length === 0) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(M404_CSS);
        shadow.adoptedStyleSheets = [sheet];
      }
    }

    setShadowRoot(shadow);
  }, []);

  return (
    <M404CustomTag ref={hostRef} hydrated>
      {shadowRoot &&
        createPortal(
          <>
            <button
              type="button"
              className={`playback-exit ${controlsVisible ? "" : "playback-exit__hidden"}`}
              onClick={() => setVideoPlayerOpen(false)}
            >
              <M404Icon
                class="icon"
                role="presentation"
                aria-hidden="true"
                innerhtml='&lt;svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 21 21" role="presentation" focusable="false"&gt;&lt;path d="M10.5 21C4.724 21 0 16.275 0 10.5S4.724 0 10.5 0 21 4.725 21 10.5 16.276 21 10.5 21zm-3.543-5.967a.96.96 0 00.693-.295l2.837-2.842 2.85 2.842c.167.167.41.295.693.295.552 0 1.001-.461 1.001-1.012 0-.281-.115-.512-.295-.704L11.899 10.5l2.85-2.855a.875.875 0 00.295-.68c0-.55-.45-.998-1.001-.998a.871.871 0 00-.668.295l-2.888 2.855-2.862-2.843a.891.891 0 00-.668-.281.99.99 0 00-1.001.986c0 .269.116.512.295.678L9.088 10.5l-2.837 2.843a.926.926 0 00-.295.678c0 .551.45 1.012 1.001 1.012z" fill-rule="nonzero"&gt;&lt;/path&gt;&lt;/svg&gt;'
                name="web-VideoPlayer-close"
                hydrated=""
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="21"
                  height="21"
                  viewBox="0 0 21 21"
                  role="presentation"
                  focusable="false"
                >
                  <path
                    d="M10.5 21C4.724 21 0 16.275 0 10.5S4.724 0 10.5 0 21 4.725 21 10.5 16.276 21 10.5 21zm-3.543-5.967a.96.96 0 00.693-.295l2.837-2.842 2.85 2.842c.167.167.41.295.693.295.552 0 1.001-.461 1.001-1.012 0-.281-.115-.512-.295-.704L11.899 10.5l2.85-2.855a.875.875 0 00.295-.68c0-.55-.45-.998-1.001-.998a.871.871 0 00-.668.295l-2.888 2.855-2.862-2.843a.891.891 0 00-.668-.281.99.99 0 00-1.001.986c0 .269.116.512.295.678L9.088 10.5l-2.837 2.843a.926.926 0 00-.295.678c0 .551.45 1.012 1.001 1.012z"
                    fillRule="nonzero"
                  ></path>
                </svg>
              </M404Icon>

              <span className="button__label">Close Video</span>
            </button>

            <style>`{COMPONENT_STYLE}`</style>
          </>,
          shadowRoot,
        )}
    </M404CustomTag>
  );
}
