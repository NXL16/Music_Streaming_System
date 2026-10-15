import type { StaticLyricLine } from "@/lib/lyrics/static-lyrics.api";

const TAG_NAME = "m404-lyrics-display-static";

const PROJECT_SCROLLBAR_CSS = `@media (hover: hover) and (pointer: fine) {:host::-webkit-scrollbar { width: 12.6px; height: 12.6px; } :host::-webkit-scrollbar-track { background: transparent; } :host::-webkit-scrollbar-thumb { background: rgb(159, 159, 159); border: 3px solid transparent; border-radius: 9999px; background-clip: content-box; } :host::-webkit-scrollbar-thumb:hover { background: rgb(219, 219, 219); background-clip: content-box; } :host::-webkit-scrollbar-thumb:active { background: rgb(242, 242, 242); background-clip: content-box; }}`;
const M404_CSS = `:host { line-height: 1.18182; letter-spacing: 0em; padding: var(--lyrics-static-padding-top, 18px) var(--lyrics-static-padding-right, 20px) var(--lyrics-static-padding-bottom, 20px) var(--lyrics-static-padding-left, 20px); height: 100%; display: block; box-sizing: border-box; overflow-y: auto; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: var(--lyrics-static-font-size, var(--lyrics-line-font-size, 22px)); font-weight: var(--lyrics-static-font-weight, 700); color: var(--lyrics-line-color-current, var(--systemPrimary)); mask-image: var(--lyrics-static-linear-gradient, none); } :host:lang(bn) { line-height: 1.77273; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Bengali", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } :host:lang(gu) { line-height: 1.77273; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Gujarati", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } :host:lang(hi) { line-height: 1.77273; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Devanagari", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } :host:lang(kn) { line-height: 1.77273; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Kannada", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } :host:lang(ml) { line-height: 1.77273; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Malayalam", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } :host:lang(mr) { line-height: 1.77273; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Devanagari", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } :host:lang(or) { line-height: 1.77273; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Odia", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } :host:lang(pa) { line-height: 1.77273; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Gurmukhi", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } :host:lang(ta) { line-height: 1.77273; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Tamil", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } :host:lang(te) { line-height: 1.77273; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Telugu", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } :host:lang(ur) { line-height: 1.77273; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Geeza Pro", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } :host:lang(th) { line-height: 1.40055; font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Thonburi Pro", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } :host:lang(zh) { font-weight: 600; } :host:lang(ar) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Arabic UI Display", "SF Pro Icons", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif; } :host:lang(he) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Arial Hebrew", "SF Pro Icons", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif; } :host:lang(ja) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Hiragino Sans", "SF Pro Icons", "Hiragino Kaku Gothic Pro", "ヒラギノ角ゴ Pro W3", メイリオ, Meiryo, "ＭＳ Ｐゴシック", "Helvetica Neue", Helvetica, Arial, sans-serif; } :host:lang(ko) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Apple SD Gothic Neo", "SF Pro Icons", "Apple Gothic", "HY Gulim", MalgunGothic, "HY Dotum", "Lexi Gulim", "Helvetica Neue", Helvetica, Arial, sans-serif; } :host:lang(zh-CN) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang SC", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } :host:lang(zh-HK) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang HK", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } :host:lang(zh-MO) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang HK", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } :host:lang(zh-TW) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang TC", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(ar) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Arabic UI Text", "SF Pro Icons", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(bn) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Bengali", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(gu) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Gujarati", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(he) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Arial Hebrew", "SF Pro Icons", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(hi) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Devanagari", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(ja) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Hiragino Sans", "SF Pro Icons", "Hiragino Kaku Gothic Pro", "ヒラギノ角ゴ Pro W3", メイリオ, Meiryo, "ＭＳ Ｐゴシック", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(kn) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Kannada", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(ko) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Apple SD Gothic Neo", "SF Pro Icons", "Apple Gothic", "HY Gulim", MalgunGothic, "HY Dotum", "Lexi Gulim", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(ml) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Malayalam", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(mr) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Devanagari", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(or) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Odia", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(pa) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Gurmukhi", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(ta) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Tamil", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(te) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Telugu", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(th) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Thonburi Pro", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(ur) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Geeza Pro", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(zh-CN) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang SC", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(zh-HK) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang HK", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(zh-MO) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang HK", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } [lang]:lang(zh-TW) { font-family: -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang TC", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif; } .primary-vocalist { margin-bottom: 15px; } :host(.is-duet) .primary-vocalist { padding-right: 20%; padding-left: 0px; } .secondary-vocalist { margin-bottom: 15px; text-align: end; } .secondary-vocalist + .translation { text-align: end; } :host(.is-duet) .secondary-vocalist { padding-right: 0px; padding-left: 20%; } .translation { margin-bottom: 0px; padding: 0px; max-height: 0px; overflow: visible; transform: translateY(-2em); font-size: 70%; transition: max-height 0.8s ease-in-out, opacity 0.8s ease-in-out, transform 0.8s ease-in-out; opacity: 0; } .translation.translation-shown { max-height: 80px; transform: translateY(-0.9em); opacity: 0.45; }`;

export class M404LyricsDisplayStatic extends HTMLElement {
  private content?: HTMLDivElement;
  private lyricLines: StaticLyricLine[] = [];

  connectedCallback() {
    this.setAttribute("part", "static-lyrics");
    this.toggleAttribute("enable-translations", true);
    this.ensureShadow();
    this.renderLines();
  }

  setLines(lines: readonly StaticLyricLine[]) {
    this.lyricLines = lines.filter(
      (line): line is StaticLyricLine =>
        Boolean(line?.text?.trim()) &&
        (line.vocalistType === "PRIMARY" || line.vocalistType === "SECONDARY"),
    );
    this.classList.toggle(
      "is-duet",
      this.lyricLines.some((line) => line.vocalistType === "SECONDARY"),
    );
    this.ensureShadow();
    this.renderLines();
  }

  private ensureShadow() {
    if (this.content) return;

    const shadow = this.shadowRoot || this.attachShadow({ mode: "open" });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`${M404_CSS}\n${PROJECT_SCROLLBAR_CSS}`);
    shadow.adoptedStyleSheets = [sheet];

    this.content = document.createElement("div");
    shadow.appendChild(this.content);
  }

  private renderLines() {
    if (!this.content) return;

    const fragment = document.createDocumentFragment();
    for (const line of this.lyricLines) {
      const staticLine = document.createElement("div");
      staticLine.className = "static-line";

      const vocalist = document.createElement("div");
      vocalist.className =
        line.vocalistType === "SECONDARY"
          ? "secondary-vocalist"
          : "primary-vocalist";
      vocalist.dir = "auto";
      vocalist.textContent = line.text;

      staticLine.appendChild(vocalist);
      fragment.appendChild(staticLine);
    }
    this.content.replaceChildren(fragment);
  }
}

if (!customElements.get(TAG_NAME)) {
  customElements.define(TAG_NAME, M404LyricsDisplayStatic);
}
