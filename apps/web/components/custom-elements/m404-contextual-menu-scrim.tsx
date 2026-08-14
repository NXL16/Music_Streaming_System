"use client";

import { memo, useLayoutEffect, useRef } from "react";

type M404ContextualMenuScrimProps = {
  onClick?: () => void;
};

const SCRIM_CSS = `.contextual-menu-scrim { margin: 0px; padding: 0px; display: inline-block; border: 0px; outline: none; appearance: none; font-family: inherit; line-height: inherit; width: 100%; height: 100%; position: fixed; z-index: var(--ctxmenu-scrim-z-index-override, var(--ctxmenu-scrim-z-index, 4)); top: 0px; left: 0px; font-size: 0px; background-color: var(--ctxmenu-scrim-bg, transparent); backdrop-filter: var(--ctxmenu-scrim-filter, none); } .contextual-menu-scrim--z-override { z-index: var(--z-modal, 9999); } @media (max-width: 483px) { .contextual-menu-scrim { background-color: var(--ctxmenu-scrim-bg-mobile, var(--modalScrimColor, var(--ctxmenuScrim))); backdrop-filter: var(--ctxmenu-scrim-filter, none); } }`;

const M404ContextualMenuScrim = memo(function M404ContextualMenuScrim({
  onClick,
}: M404ContextualMenuScrimProps) {
  const containerRef = useRef<HTMLElement>(null);
  const onClickRef = useRef(onClick);

  useLayoutEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const shadow = el.shadowRoot || el.attachShadow({ mode: "open" });

    if (
      "adoptedStyleSheets" in document &&
      shadow.adoptedStyleSheets.length === 0
    ) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(SCRIM_CSS);
      shadow.adoptedStyleSheets = [sheet];
    }

    let button = shadow.querySelector<HTMLButtonElement>(
      ".contextual-menu-scrim",
    );
    if (!button) {
      button = document.createElement("button");
      button.className = "contextual-menu-scrim";
      button.textContent = "Close";

      shadow.appendChild(button);
    }

    const handleClick = () => onClickRef.current?.();
    button.addEventListener("click", handleClick);

    return () => {
      button?.removeEventListener("click", handleClick);
    };
  }, []);

  const M404ContextualMenuScrimTag =
    "m404-contextual-menu-scrim" as unknown as React.ComponentType<{
      ref: React.RefObject<HTMLElement | null>;
      hydrated?: string;
    }>;

  return <M404ContextualMenuScrimTag ref={containerRef} hydrated="" />;
});

export default M404ContextualMenuScrim;
