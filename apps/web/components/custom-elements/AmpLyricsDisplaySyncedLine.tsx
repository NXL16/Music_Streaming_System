import "./AmpLyricsDisplayInstrumentalLine";

export type SyncedLyricLine = {
  position: number;
  startTimeMs: number;
  endTimeMs: number;
  text: string;
  vocalistType?: "PRIMARY" | "SECONDARY";
  kind?: "LYRIC" | "INSTRUMENTAL";
  words?: SyncedLyricWord[];
  backgroundWords?: SyncedLyricWord[];
};

export type SyncedLyricWord = {
  position: number;
  startTimeMs: number;
  endTimeMs: number;
  text: string;
};

const TAG_NAME = "amp-lyrics-display-synced-line";
const INSTRUMENTAL_PLACEHOLDER_WIDTH_PX = 40;
const INSTRUMENTAL_PLACEHOLDER_HEIGHT_PX = 10;
const MIN_SYLLABLE_LIFT_DURATION_MS = 120;
const SYLLABLE_LIFT_DURATION_OFFSET_MS = 400;
const LONG_WORD_MIN_DURATION_MS = 1000;
const HIGHLIGHT_PRELOAD_MS = 100;
const HIGHLIGHT_PRELOAD_PROGRESS = "-20%";

type TimedTextElement = {
  element: HTMLElement;
  startTimeMs: number;
  endTimeMs: number;
  kind: "letter" | "syllable";
  isLifted: boolean;
};

export class AmpLyricsDisplaySyncedLine extends HTMLElement {
  private line?: SyncedLyricLine;
  private root?: HTMLElement;
  private button?: HTMLButtonElement;
  private primaryVocals?: HTMLDivElement;
  private backgroundVocals?: HTMLDivElement;
  private isCurrent = false;
  private isPlaying = false;
  private currentTimeMs = 0;
  private instrumentalRendered = false;
  private instrumentalRenderTimer?: number;
  private instrumentalExitTimer?: number;
  private shouldDelayInstrumentalRender = false;
  private timedTextElements: TimedTextElement[] = [];
  private wordProgressAnimationFrame?: number;
  private playbackTimeUpdatedAt = 0;

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
    this.cancelWordProgressSync();
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
    this.syncWordProgress();
    if (value) {
      this.playbackTimeUpdatedAt = performance.now();
      this.scheduleWordProgressSync();
    } else {
      this.cancelWordProgressSync();
    }
    this.syncInstrumentalHeight();
    this.root?.classList.toggle("is-animating", value);
    this.button?.setAttribute("aria-current", value ? "true" : "false");
    this.syncInstrumentalCurrent();
    this.scheduleInstrumentalRender();
  }

  set playing(value: boolean) {
    this.isPlaying = value;
    this.syncInstrumentalCurrent();
    if (value) {
      this.playbackTimeUpdatedAt = performance.now();
      this.scheduleWordProgressSync();
    } else {
      this.cancelWordProgressSync();
    }
  }

  set delayInstrumentalRender(value: boolean) {
    this.shouldDelayInstrumentalRender = value;
  }

  set playbackTimeMs(value: number) {
    this.currentTimeMs = value;
    this.playbackTimeUpdatedAt = performance.now();
    if (this.line?.kind !== "INSTRUMENTAL") {
      this.syncWordProgress();
      this.scheduleWordProgressSync();
      return;
    }

    const instrumental = this.button?.querySelector<
      HTMLElement & { elapsed: number }
    >("amp-lyrics-display-instrumental-line");
    if (instrumental && this.line) {
      instrumental.elapsed = Math.max(0, value - this.line.startTimeMs);
    }
  }

  private render() {
    if (!this.line || !this.button) return;

    const isDuet = this.line.vocalistType !== undefined;
    const isSecondaryVocalist = this.line.vocalistType === "SECONDARY";
    this.root?.classList.toggle("is-duet", isDuet);
    this.root?.classList.toggle("is-secondary-vocalist", isSecondaryVocalist);
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
    this.timedTextElements = [];
    if (!this.line.words?.length) {
      this.primaryVocals.textContent = this.line.text;
    } else {
      this.renderTimedWords(this.line.words, this.primaryVocals);
    }
    if (this.line.backgroundWords?.length) {
      if (!this.backgroundVocals) {
        this.backgroundVocals = document.createElement("div");
        this.backgroundVocals.className = "background-vocals";
        this.backgroundVocals.dir = "auto";
      }
      this.renderTimedWords(this.line.backgroundWords, this.backgroundVocals);
    } else {
      this.backgroundVocals?.remove();
    }
    this.syncWordProgress();
    this.button.setAttribute("aria-label", `Phát từ: ${this.line.text}`);
    this.button.replaceChildren(
      this.primaryVocals,
      ...(this.line.backgroundWords?.length && this.backgroundVocals
        ? [this.backgroundVocals]
        : []),
    );
  }

  private renderTimedWords(words: SyncedLyricWord[], target: HTMLElement) {
    const fragment = document.createDocumentFragment();

    for (const word of words) {
      fragment.appendChild(this.createWordGroup(word));
    }

    target.replaceChildren(fragment);
  }

  private createWordGroup(word: SyncedLyricWord) {
    const group = document.createElement("span");
    group.className = "group";
    group.dataset.startTimeMs = String(word.startTimeMs);
    group.dataset.endTimeMs = String(word.endTimeMs);

    const text = word.text.trimEnd();
    group.classList.toggle(
      "trailing-whitespace",
      text.length !== word.text.length,
    );

    const main = document.createElement("div");
    main.className = "main";
    main.appendChild(this.createWordContent(word, text));
    group.appendChild(main);
    return group;
  }

  private createWordContent(word: SyncedLyricWord, text: string) {
    const durationMs = word.endTimeMs - word.startTimeMs;
    const characters = Array.from(text);
    if (durationMs < LONG_WORD_MIN_DURATION_MS || characters.length < 2) {
      const syllable = this.createTimedTextElement(
        "syllable",
        text,
        word.startTimeMs,
        word.endTimeMs,
      );
      this.addTimedTextElement(
        syllable,
        word.startTimeMs,
        word.endTimeMs,
        "syllable",
      );
      return syllable;
    }

    const syllable = this.createTimedTextElement(
      "syllable",
      text,
      word.startTimeMs,
      word.endTimeMs,
    );
    syllable.replaceChildren();

    const characterDurationMs = durationMs / characters.length;
    for (const [index, character] of characters.entries()) {
      const startTimeMs = word.startTimeMs + characterDurationMs * index;
      const endTimeMs = word.startTimeMs + characterDurationMs * (index + 1);
      const letter = this.createTimedTextElement(
        "letter",
        character,
        startTimeMs,
        endTimeMs,
      );
      this.addTimedTextElement(letter, startTimeMs, endTimeMs, "letter");
      syllable.appendChild(letter);
    }

    return syllable;
  }

  private createTimedTextElement(
    className: "letter" | "syllable",
    text: string,
    startTimeMs: number,
    endTimeMs: number,
  ) {
    const element = document.createElement("span");
    element.className = className;
    element.textContent = text;
    element.dataset.content = text;
    element.dataset.duration = String(Math.round(endTimeMs - startTimeMs));
    element.dataset.delay = String(
      Math.round(startTimeMs - (this.line?.startTimeMs ?? startTimeMs)),
    );
    element.dir = "auto";
    return element;
  }

  private addTimedTextElement(
    element: HTMLElement,
    startTimeMs: number,
    endTimeMs: number,
    kind: TimedTextElement["kind"],
  ) {
    this.timedTextElements.push({
      element,
      startTimeMs,
      endTimeMs,
      kind,
      isLifted: false,
    });
  }

  private syncWordProgress(playbackTimeMs = this.currentTimeMs) {
    if (!this.isCurrent) return;

    for (const timedText of this.timedTextElements) {
      const element = timedText.element;
      const progress = element.style.getPropertyValue("--gradient-progress");
      if (playbackTimeMs < timedText.startTimeMs - HIGHLIGHT_PRELOAD_MS) {
        if (progress) this.clearHighlight(timedText);
        continue;
      }

      if (playbackTimeMs < timedText.startTimeMs) {
        if (progress !== HIGHLIGHT_PRELOAD_PROGRESS) {
          this.prepareHighlight(timedText);
          element.style.setProperty(
            "--gradient-progress",
            HIGHLIGHT_PRELOAD_PROGRESS,
          );
        }
        continue;
      }

      const durationMs = timedText.endTimeMs - timedText.startTimeMs;
      if (!progress) this.prepareHighlight(timedText);
      if (!timedText.isLifted) {
        const liftDurationMs =
          Math.max(MIN_SYLLABLE_LIFT_DURATION_MS, durationMs) +
          SYLLABLE_LIFT_DURATION_OFFSET_MS;
        timedText.isLifted = true;
        element.style.transition = `transform ${liftDurationMs}ms ease-in-out`;
        element.style.transform = "matrix(1, 0, 0, 1, 0, -2)";
      }

      if (durationMs <= 0) continue;

      const nextProgress = `${Math.min(
        100,
        ((playbackTimeMs - timedText.startTimeMs) / durationMs) * 100,
      ).toFixed(2)}%`;

      if (progress !== nextProgress) {
        element.style.setProperty("--gradient-progress", nextProgress);
      }
    }
  }

  private prepareHighlight(timedText: TimedTextElement) {
    if (timedText.kind !== "letter") return;

    timedText.element.style.setProperty("--text-shadow-blur-radius", "4px");
    timedText.element.style.setProperty("--text-shadow-opacity", "0");
  }

  private clearHighlight(timedText: TimedTextElement) {
    timedText.element.style.removeProperty("--gradient-progress");
    if (timedText.kind !== "letter") return;

    timedText.element.style.removeProperty("--text-shadow-blur-radius");
    timedText.element.style.removeProperty("--text-shadow-opacity");
  }

  private scheduleWordProgressSync() {
    if (
      !this.isCurrent ||
      !this.isPlaying ||
      !this.timedTextElements.length ||
      this.wordProgressAnimationFrame !== undefined
    ) {
      return;
    }

    this.wordProgressAnimationFrame = requestAnimationFrame(() => {
      this.wordProgressAnimationFrame = undefined;
      const elapsedSinceUpdate = Math.max(
        0,
        performance.now() - this.playbackTimeUpdatedAt,
      );
      this.syncWordProgress(this.currentTimeMs + elapsedSinceUpdate);
      this.scheduleWordProgressSync();
    });
  }

  private cancelWordProgressSync() {
    if (this.wordProgressAnimationFrame === undefined) return;

    cancelAnimationFrame(this.wordProgressAnimationFrame);
    this.wordProgressAnimationFrame = undefined;
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
    if (this.instrumentalRenderTimer !== undefined) {
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
    if (this.instrumentalExitTimer !== undefined) {
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
    const rootTop = this.root.getBoundingClientRect().top;
    const buttonRect = this.button.getBoundingClientRect();
    const height =
      buttonRect.bottom -
      rootTop -
      currentPadding +
      targetPadding * 2 +
      marginBottom;

    this.root.style.setProperty("--instrumental-line-height", `${height}px`);
  }
}

if (!customElements.get(TAG_NAME)) {
  customElements.define(TAG_NAME, AmpLyricsDisplaySyncedLine);
}
