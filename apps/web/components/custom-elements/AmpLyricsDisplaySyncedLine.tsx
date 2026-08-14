import "./AmpLyricsDisplayInstrumentalLine";

export type SyncedLyricLine = {
  position: number;
  startTimeMs: number;
  endTimeMs: number;
  text: string;
  kind?: "LYRIC" | "INSTRUMENTAL";
};

const TAG_NAME = "amp-lyrics-display-synced-line";

export class AmpLyricsDisplaySyncedLine extends HTMLElement {
  private line?: SyncedLyricLine;
  private root?: HTMLElement;
  private button?: HTMLButtonElement;
  private primaryVocals?: HTMLDivElement;
  private isCurrent = false;
  private isPlaying = false;
  private currentTimeMs = 0;
  private instrumentalHeightFrame?: number;

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
    if (this.instrumentalHeightFrame) {
      cancelAnimationFrame(this.instrumentalHeightFrame);
      this.instrumentalHeightFrame = undefined;
    }
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
  }

  set playing(value: boolean) {
    this.isPlaying = value;
    this.syncInstrumentalCurrent();
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
      this.button.disabled = true;
      this.button.setAttribute("aria-label", "Đoạn nhạc không lời");
      this.button.replaceChildren(instrumental);
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

  private syncInstrumentalHeight() {
    if (this.line?.kind !== "INSTRUMENTAL" || !this.root) return;

    if (this.instrumentalHeightFrame) {
      cancelAnimationFrame(this.instrumentalHeightFrame);
      this.instrumentalHeightFrame = undefined;
    }
    if (!this.isCurrent) return;

    this.root.style.setProperty("--instrumental-line-height", "0px");
    this.instrumentalHeightFrame = requestAnimationFrame(() => {
      this.instrumentalHeightFrame = undefined;
      if (!this.isCurrent || !this.root) return;

      this.root.style.setProperty(
        "--instrumental-line-height",
        `${this.root.scrollHeight}px`,
      );
    });
  }
}

if (!customElements.get(TAG_NAME)) {
  customElements.define(TAG_NAME, AmpLyricsDisplaySyncedLine);
}
