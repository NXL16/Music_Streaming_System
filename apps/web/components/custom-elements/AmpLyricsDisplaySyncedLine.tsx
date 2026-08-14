import "./AmpLyricsDisplayInstrumentalLine";

export type SyncedLyricLine = {
  position: number;
  startTimeMs: number;
  endTimeMs: number;
  text: string;
  kind?: "LYRIC" | "INSTRUMENTAL";
};

const TAG_NAME = "amp-lyrics-display-synced-line";
const INSTRUMENTAL_PLACEHOLDER_WIDTH_PX = 40;
const INSTRUMENTAL_PLACEHOLDER_HEIGHT_PX = 10;

export class AmpLyricsDisplaySyncedLine extends HTMLElement {
  private line?: SyncedLyricLine;
  private root?: HTMLElement;
  private button?: HTMLButtonElement;
  private primaryVocals?: HTMLDivElement;
  private isCurrent = false;
  private isPlaying = false;
  private currentTimeMs = 0;
  private instrumentalRendered = false;
  private instrumentalRenderTimer?: number;
  private instrumentalExitTimer?: number;
  private shouldDelayInstrumentalRender = false;

  connectedCallback() {
    if (this.root) {
      this.button?.addEventListener("click", this.handleSeek);
      return;
    }

    this.root = document.createElement("ruby");
    this.root.className = "display-synced-line";
    this.root.dir = "ltr";

    this.button = document.createElement("button");
    this.button.className = "line";
    this.button.type = "button";
    this.button.addEventListener("click", this.handleSeek);

    this.root.appendChild(this.button);
    this.appendChild(this.root);
    this.setAttribute("hydrated", "");
    this.render();
    this.current = this.isCurrent;
  }

  disconnectedCallback() {
    this.cancelInstrumentalRender();
    this.cancelInstrumentalExit();
    this.button?.removeEventListener("click", this.handleSeek);
  }

  set lyric(value: SyncedLyricLine) {
    this.line = value;
    this.render();
  }

  set current(value: boolean) {
    this.isCurrent = value;
    this.toggleAttribute("is-current", value);
    this.root?.classList.toggle("is-current", value);
    this.syncInstrumentalHeight();
    this.root?.classList.toggle("is-animating", value);
    this.button?.setAttribute("aria-current", value ? "true" : "false");
    this.syncInstrumentalCurrent();
    this.scheduleInstrumentalRender();
  }

  set playing(value: boolean) {
    this.isPlaying = value;
    this.syncInstrumentalCurrent();
  }

  set delayInstrumentalRender(value: boolean) {
    this.shouldDelayInstrumentalRender = value;
  }

  set playbackTimeMs(value: number) {
    this.currentTimeMs = value;
    if (this.line?.kind !== "INSTRUMENTAL") return;

    const instrumental = this.button?.querySelector<
      HTMLElement & { elapsed: number }
    >("amp-lyrics-display-instrumental-line");
    if (instrumental && this.line) {
      instrumental.elapsed = Math.max(0, value - this.line.startTimeMs);
    }
  }

  private render() {
    if (!this.line || !this.button) return;

    this.root?.classList.toggle(
      "collapsible",
      this.line.kind === "INSTRUMENTAL",
    );

    if (this.line.kind === "INSTRUMENTAL") {
      this.button.disabled = true;
      this.button.setAttribute("aria-label", "Đoạn nhạc không lời");
      if (this.instrumentalRendered) {
        const instrumental = document.createElement(
          "amp-lyrics-display-instrumental-line",
        ) as HTMLElement & { duration: number; elapsed: number };
        instrumental.duration = this.line.endTimeMs - this.line.startTimeMs;
        instrumental.elapsed = Math.max(
          0,
          this.currentTimeMs - this.line.startTimeMs,
        );
        instrumental.classList.toggle(
          "is-current",
          this.isCurrent && this.isPlaying,
        );
        this.button.replaceChildren(instrumental);
      } else {
        const placeholder = document.createElement("span");
        placeholder.setAttribute("aria-hidden", "true");
        placeholder.style.cssText = `display:block;width:${INSTRUMENTAL_PLACEHOLDER_WIDTH_PX}px;height:${INSTRUMENTAL_PLACEHOLDER_HEIGHT_PX}px;visibility:hidden;`;
        this.button.replaceChildren(placeholder);
      }
      return;
    }

    if (!this.primaryVocals) {
      this.primaryVocals = document.createElement("div");
      this.primaryVocals.className = "primary-vocals";
    }

    this.button.disabled = false;
    this.primaryVocals.textContent = this.line.text;
    this.button.setAttribute("aria-label", `Phát từ: ${this.line.text}`);
    this.button.replaceChildren(this.primaryVocals);
  }

  private handleSeek = (event: MouseEvent) => {
    if (!this.line) return;

    if (event.detail > 0) this.button?.blur();

    this.dispatchEvent(
      new CustomEvent("lyrics-line-seek", {
        bubbles: true,
        composed: true,
        detail: {
          position: this.line.position,
          startTimeMs: this.line.startTimeMs,
        },
      }),
    );
  };

  private syncInstrumentalCurrent() {
    this.button
      ?.querySelector<HTMLElement>("amp-lyrics-display-instrumental-line")
      ?.classList.toggle("is-current", this.isCurrent && this.isPlaying);
  }

  private scheduleInstrumentalRender() {
    if (this.line?.kind !== "INSTRUMENTAL") return;

    this.cancelInstrumentalRender();
    if (!this.isCurrent) {
      this.scheduleInstrumentalExit();
      return;
    }

    this.cancelInstrumentalExit();
    if (this.instrumentalRendered) return;

    if (!this.shouldDelayInstrumentalRender) {
      this.instrumentalRendered = true;
      this.render();
      return;
    }

    if (!this.root) return;
    const delay =
      Number.parseFloat(
        getComputedStyle(this.root).getPropertyValue(
          "--instrumental-render-delay",
        ),
      ) || 0;
    this.instrumentalRenderTimer = window.setTimeout(() => {
      this.instrumentalRenderTimer = undefined;
      if (!this.isCurrent || this.line?.kind !== "INSTRUMENTAL") return;

      this.instrumentalRendered = true;
      this.render();
    }, delay);
  }

  private cancelInstrumentalRender() {
    if (this.instrumentalRenderTimer) {
      clearTimeout(this.instrumentalRenderTimer);
      this.instrumentalRenderTimer = undefined;
    }
  }

  private scheduleInstrumentalExit() {
    if (!this.instrumentalRendered || !this.root) return;

    this.cancelInstrumentalExit();
    const exitDuration =
      Number.parseFloat(
        getComputedStyle(this.root).getPropertyValue(
          "--instrumental-exit-duration",
        ),
      ) || 0;
    this.instrumentalExitTimer = window.setTimeout(() => {
      this.instrumentalExitTimer = undefined;
      if (this.isCurrent) return;

      this.instrumentalRendered = false;
      this.render();
    }, exitDuration);
  }

  private cancelInstrumentalExit() {
    if (this.instrumentalExitTimer) {
      clearTimeout(this.instrumentalExitTimer);
      this.instrumentalExitTimer = undefined;
    }
  }

  private syncInstrumentalHeight() {
    if (
      this.line?.kind !== "INSTRUMENTAL" ||
      !this.isCurrent ||
      !this.root ||
      !this.button
    ) {
      return;
    }

    const buttonStyle = getComputedStyle(this.button);
    const marginBottom = Number.parseFloat(buttonStyle.marginBottom) || 0;
    const currentPadding =
      (Number.parseFloat(buttonStyle.paddingTop) || 0) +
      (Number.parseFloat(buttonStyle.paddingBottom) || 0);
    const targetPadding =
      Number.parseFloat(
        getComputedStyle(this.root).getPropertyValue(
          "--lyrics-current-line-padding-block",
        ),
      ) || 12;
    const height =
      this.button.offsetTop +
      this.button.offsetHeight -
      currentPadding +
      targetPadding * 2 +
      marginBottom;

    this.root.style.setProperty("--instrumental-line-height", `${height}px`);
  }
}

if (!customElements.get(TAG_NAME)) {
  customElements.define(TAG_NAME, AmpLyricsDisplaySyncedLine);
}
