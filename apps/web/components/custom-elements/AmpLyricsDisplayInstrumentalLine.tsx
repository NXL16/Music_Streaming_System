const TAG_NAME = "amp-lyrics-display-instrumental-line";
const DOT_COUNT = 3;
const ENDING_ANIMATION_MS = 1_000;

const INSTRUMENTAL_LINE_CSS = `:host { width: 100%; display: grid; grid-template-columns: repeat(3, 10px); justify-content: start; column-gap: 5px; transform: scale(1); transform-origin: left center; } :host:has(span:dir(rtl)) { transform-origin: right center; } :host(.is-current:not(.ending)) { animation: 5s ease-in-out 0s infinite normal none running heartbeat; } :host(.is-current.ending) { animation: var(--instrumental-ending-animation-duration, 1s) ease-in 0s 1 normal forwards running heartbeat-end; } :host(.is-current) .dot { opacity: 0.3; } :host(.is-current) .dot--current { transition-property: opacity; opacity: 1; } .dot { width: 10px; height: 10px; display: inline-block; border-radius: 10px; background-color: var(--lyrics-dot-background-color, var(--systemPrimary)); } @keyframes heartbeat { 0% { transform: scale(1); } 50% { transform: scale(1.2); } 100% { transform: scale(1); } } @keyframes heartbeat-end { 0% { transform: scale(var(--instrumental-ending-start-scale, 1)); } 100% { transform: scale(1.4); } }`;

let instrumentalLineSheet: CSSStyleSheet | undefined;

function getInstrumentalLineSheet(): CSSStyleSheet {
  if (!instrumentalLineSheet) {
    instrumentalLineSheet = new CSSStyleSheet();
    instrumentalLineSheet.replaceSync(INSTRUMENTAL_LINE_CSS);
  }
  return instrumentalLineSheet;
}

export class AmpLyricsDisplayInstrumentalLine extends HTMLElement {
  private durationMs = 0;
  private elapsedMs = 0;
  private classObserver?: MutationObserver;
  private wasCurrent = false;
  private wasEnding = false;

  connectedCallback() {
    if (!this.shadowRoot) {
      const shadow = this.attachShadow({ mode: "open" });
      shadow.adoptedStyleSheets = [getInstrumentalLineSheet()];
    }

    this.setAttribute("hydrated", "");
    this.render();
    this.classObserver ??= new MutationObserver(() => {
      const isCurrent = this.classList.contains("is-current");
      if (isCurrent === this.wasCurrent) return;
      this.wasCurrent = isCurrent;
      this.syncProgress();
    });
    this.classObserver.observe(this, {
      attributes: true,
      attributeFilter: ["class"],
    });
    this.wasCurrent = this.classList.contains("is-current");
    this.syncProgress();
  }

  disconnectedCallback() {
    this.classObserver?.disconnect();
    this.classObserver = undefined;
  }

  set duration(value: number) {
    this.durationMs = Number.isFinite(value) ? Math.max(0, value) : 0;
    this.render();
    this.syncProgress();
  }

  set elapsed(value: number) {
    this.elapsedMs = Number.isFinite(value) ? Math.max(0, value) : 0;
    this.syncProgress();
  }

  private render() {
    if (!this.shadowRoot) return;

    const endingDurationMs = Math.min(ENDING_ANIMATION_MS, this.durationMs);
    this.style.setProperty(
      "--instrumental-ending-animation-duration",
      `${endingDurationMs}ms`,
    );

    const duration = `${Math.max(1, this.durationMs / DOT_COUNT)}ms`;
    const dots = Array.from({ length: DOT_COUNT }, () => {
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.transitionDuration = duration;
      return dot;
    });

    this.shadowRoot.replaceChildren(...dots);
  }

  private syncProgress() {
    const dots = Array.from(
      this.shadowRoot?.querySelectorAll<HTMLSpanElement>(".dot") ?? [],
    );
    const isCurrent = this.classList.contains("is-current");
    const progress =
      this.durationMs > 0 ? Math.min(1, this.elapsedMs / this.durationMs) : 0;
    const endingDurationMs = Math.min(ENDING_ANIMATION_MS, this.durationMs);
    const activeDots = isCurrent
      ? Math.min(DOT_COUNT, Math.floor(progress * DOT_COUNT) + 1)
      : 1;
    dots.forEach((dot, index) =>
      dot.classList.toggle("dot--current", index < activeDots),
    );

    const isEnding =
      isCurrent &&
      this.durationMs > 0 &&
      this.durationMs - this.elapsedMs <= endingDurationMs;
    if (isEnding && !this.wasEnding) {
      this.style.setProperty(
        "--instrumental-ending-start-scale",
        `${this.getCurrentScale()}`,
      );
      // If the user seeks into the final phase, finish exactly at line.end,
      // rather than running a stale full one-second animation.
      this.style.setProperty(
        "--instrumental-ending-animation-duration",
        `${Math.max(1, Math.min(endingDurationMs, this.durationMs - this.elapsedMs))}ms`,
      );
    }
    if (!isEnding) {
      if (this.wasEnding) {
        this.style.setProperty(
          "--instrumental-ending-animation-duration",
          `${endingDurationMs}ms`,
        );
      }
      this.wasEnding = false;
    } else {
      this.wasEnding = true;
    }
    this.classList.toggle("ending", isEnding);
  }

  private getCurrentScale() {
    const transform = getComputedStyle(this).transform;
    if (transform === "none") return 1;

    const values = transform
      .slice(transform.indexOf("(") + 1, -1)
      .split(",")
      .map(Number);

    if (transform.startsWith("matrix3d(") && values.length === 16) {
      return Math.hypot(values[0], values[1], values[2]);
    }

    if (transform.startsWith("matrix(") && values.length === 6) {
      return Math.hypot(values[0], values[1]);
    }

    return 1;
  }
}

if (!customElements.get(TAG_NAME)) {
  customElements.define(TAG_NAME, AmpLyricsDisplayInstrumentalLine);
}
