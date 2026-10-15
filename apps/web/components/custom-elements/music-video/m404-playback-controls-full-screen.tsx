import { ElementType, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const CustomElement = "m404-playback-controls-full-screen" as ElementType;
const M404Icon = "m404-icon" as ElementType;

const M404_CSS = `:host { display: flex; align-items: center; } :host(.unsupported) { display: none; } button { --player-controls-color-unified: var(--white80, rgba(255, 255, 255, .8)); margin: 0px; padding: 0px; display: inline-block; border: 0px; background-color: transparent; outline: none; cursor: pointer; appearance: none; font-family: inherit; line-height: inherit; width: 100%; height: 22px; font-size: 0px; color: var(--player-controls-color-alt, var(--player-controls-color-unified)); } button m404-icon { width: 22px; height: 18px; pointer-events: none; } button:hover, button:active, button:focus { --player-controls-color-unified-hover: #fff; color: var(--player-controls-color-hover-alt, var(--player-controls-color-unified-hover)); } button:disabled { opacity: 0.4; cursor: default; } button:focus-visible { --sk-focus-offset: 2px; outline: 4px solid var(--sk-focus-color, var(--keyColor-focus-color, var(--keyColor, #0071e3))); outline-offset: var(--sk-focus-offset, 1px); }`;
const COMPONENT_STYLE = `.icon{display:block}.icon svg{width:inherit;height:inherit;display:block;color:currentColor;pointer-events:none}.icon svg *{fill:currentColor}`;
const PATH =
  "M91.969 71.954c2.587 0 4.443-1.953 4.443-4.54v-4.102l-.977-17.041 12.842 13.525 15.04 15.137c.83.879 1.903 1.27 3.075 1.27 2.784 0 4.834-1.807 4.834-4.542 0-1.318-.44-2.49-1.318-3.369L114.82 53.253l-13.525-12.842 17.09.977h4.052c2.588 0 4.59-1.807 4.59-4.443 0-2.637-1.953-4.492-4.59-4.492h-27.1c-4.98 0-7.86 2.88-7.86 7.86v27.1c0 2.54 1.904 4.541 4.492 4.541Zm53.564 53.663h27.1c4.98 0 7.91-2.881 7.91-7.862v-27.1c0-2.538-1.905-4.54-4.54-4.54-2.54 0-4.445 1.953-4.445 4.54v4.102l1.026 17.041-12.89-13.525-14.991-15.137c-.83-.879-1.953-1.27-3.125-1.27-2.734 0-4.834 1.807-4.834 4.542 0 1.318.488 2.49 1.367 3.369l15.04 15.039 13.573 12.842-17.09-.977h-4.101c-2.588 0-4.59 1.807-4.59 4.443 0 2.637 2.002 4.493 4.59 4.493Z";
const PATH_FULL_SCREEN =
  "M95.215 74.347h27.1c4.98 0 7.861-2.93 7.861-7.91v-27.05c0-2.54-1.904-4.542-4.492-4.542s-4.443 1.953-4.443 4.541v4.102l1.025 17.04-12.89-13.525-14.99-15.136c-.83-.88-1.954-1.319-3.126-1.319-2.783 0-4.834 1.856-4.834 4.59 0 1.27.489 2.49 1.367 3.37l15.04 15.038 13.525 12.842-17.041-.977h-4.102c-2.588 0-4.59 1.807-4.59 4.444 0 2.588 1.954 4.492 4.59 4.492Zm46.826 49.56c2.588 0 4.444-1.904 4.444-4.54v-4.64l-1.026-16.991 12.891 13.525 15.332 15.43c.83.879 1.904 1.318 3.125 1.318 2.734 0 4.785-1.855 4.785-4.59 0-1.27-.439-2.49-1.318-3.369l-15.381-15.38-13.574-12.842 17.09.976h4.638c2.588 0 4.59-1.807 4.59-4.394 0-2.637-1.953-4.493-4.59-4.493h-27.636c-4.98 0-7.862 2.881-7.862 7.862v27.588c0 2.587 1.856 4.54 4.492 4.54Z";

export default function PlayBackControlsFullScreen({
  isFullScreen = false,
  onToggle,
}: {
  isFullScreen: boolean;
  onToggle?: () => void;
}) {
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
    <CustomElement
      ref={hostRef}
      class={`footer__control ${isFullScreen ? "fullscreen" : ""}`}
      hydrated
    >
      {shadowRoot &&
        createPortal(
          <>
            <button
              type="button"
              className="footer__control--full-screen"
              onClick={onToggle}
              aria-label={isFullScreen ? "Exit full screen" : "Full screen"}
            >
              {isFullScreen ? "Exit full screen" : "Full screen"}

              <M404Icon
                class="icon"
                role="presentation"
                aria-hidden="true"
                innerhtml={`&lt;svg xmlns="http://www.w3.org/2000/svg" viewBox="87.48 32.45 93.07 93.16"&gt;&lt;path d=${isFullScreen ? PATH_FULL_SCREEN : PATH}&gt;&lt;/path&gt;&lt;/svg&gt;`}
                name="arrow.up.left.and.arrow.down.right"
                hydrated=""
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="87.48 32.45 93.07 93.16"
                >
                  <path d={isFullScreen ? PATH_FULL_SCREEN : PATH}></path>
                </svg>
              </M404Icon>
            </button>

            <style>{COMPONENT_STYLE}</style>
          </>,
          shadowRoot,
        )}
    </CustomElement>
  );
}
