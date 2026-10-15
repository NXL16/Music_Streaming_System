import "./AmpLyricsDisplaySyncedLine";
import type { SyncedLyricLine } from "./AmpLyricsDisplaySyncedLine";

const TAG_NAME = "amp-lyrics-display-time-synced";
const DEFAULT_ACTIVE_LINE_TOP_RATIO = 0.18;
const AUTO_SCROLL_DURATION_MS = 400;
const LINE_STAGGER_DELAY_MS = 50;
const LINE_MOTION_RADIUS = 8;
const LINE_SPRING_MASS = 0.9;
const SLOW_LINE_SPRING = { stiffness: 90, damping: 15 };
const MIN_LINE_INTERVAL_MS = 100;
const MAX_LINE_INTERVAL_MS = 800;
const MIN_LINE_STIFFNESS = 170;
const MAX_LINE_STIFFNESS = 200;
const LINE_DAMPING_MULTIPLIER = 2.2;
const LINE_INTERVAL_EXPONENT = 0.2;
const LINE_SPRING_FALLBACK = "cubic-bezier(.16, 1, .3, 1)";
const LINE_SPRING_SAMPLE_COUNT = 32;
const PAST_LINE_FADE_LEAD_MS = 160;
const MIN_PAST_LINE_FADE_DURATION_MS = 120;
const INSTRUMENTAL_TRANSITION_DURATION_MS = 300;
const INSTRUMENTAL_SCROLL_DURATION_MS = 720;
const INSTRUMENTAL_FADE_IN_MS = 180;
const INSTRUMENTAL_RENDER_DELAY_MS = 226;

type LineSpringMotion = {
  duration: number;
  easing: string;
};

function getSpringProgress(time: number, stiffness: number, damping: number) {
  const criticalDamping = 2 * Math.sqrt(stiffness * LINE_SPRING_MASS);
  const angularFrequency = Math.sqrt(stiffness / LINE_SPRING_MASS);

  if (damping >= criticalDamping) {
    return (
      1 - (1 + angularFrequency * time) * Math.exp(-angularFrequency * time)
    );
  }

  const dampingFrequency = Math.sqrt(
    4 * LINE_SPRING_MASS * stiffness - damping ** 2,
  );
  const dampedFrequency = dampingFrequency / (2 * LINE_SPRING_MASS);
  return (
    1 -
    (Math.cos(dampedFrequency * time) +
      (damping / dampingFrequency) * Math.sin(dampedFrequency * time)) *
      Math.exp((-damping * time) / (2 * LINE_SPRING_MASS))
  );
}

function createSpringMotion(
  stiffness: number,
  damping: number,
): LineSpringMotion {
  const angularFrequency = Math.sqrt(stiffness / LINE_SPRING_MASS);
  const duration = Math.round(
    ((damping < 2 * Math.sqrt(stiffness * LINE_SPRING_MASS) ? 14 : 10.5) /
      angularFrequency) *
      1000,
  );
  const values = Array.from(
    { length: LINE_SPRING_SAMPLE_COUNT + 1 },
    (_, index) =>
      getSpringProgress(
        (duration * index) / (LINE_SPRING_SAMPLE_COUNT * 1000),
        stiffness,
        damping,
      ).toFixed(4),
  );
  const easing = `linear(${values.join(", ")})`;

  return {
    duration,
    easing:
      typeof CSS !== "undefined" &&
      CSS.supports("animation-timing-function", easing)
        ? easing
        : LINE_SPRING_FALLBACK,
  };
}

function getLineSpringMotion(
  intervalMs: number | undefined,
  isSlowMotion: boolean,
) {
  if (isSlowMotion || intervalMs === undefined) {
    return createSpringMotion(
      SLOW_LINE_SPRING.stiffness,
      SLOW_LINE_SPRING.damping,
    );
  }

  const clampedInterval = Math.min(
    Math.max(intervalMs, MIN_LINE_INTERVAL_MS),
    MAX_LINE_INTERVAL_MS,
  );
  const ratio =
    (1 -
      (clampedInterval - MIN_LINE_INTERVAL_MS) /
        (MAX_LINE_INTERVAL_MS - MIN_LINE_INTERVAL_MS)) **
    LINE_INTERVAL_EXPONENT;
  const stiffness =
    MIN_LINE_STIFFNESS + ratio * (MAX_LINE_STIFFNESS - MIN_LINE_STIFFNESS);

  return createSpringMotion(
    stiffness,
    Math.sqrt(stiffness) * LINE_DAMPING_MULTIPLIER,
  );
}

const APPLE_CSS = `:host { margin: 0px; height: 100%; display: block; overflow: visible auto; position: relative; top: 0px; mask-image: var(--lyrics-linear-gradient, linear-gradient(180deg, #000 0, rgba(0, 0, 0, 0) 100%)); mask-composite: var(--lyrics-mask-composite, initial); scrollbar-width: none; } :host::-webkit-scrollbar { display: none; } :host([detail-line-motion][hide-past-lines]) amp-lyrics-display-synced-line:has(~ [is-current]) { pointer-events: none; } amp-lyrics-display-synced-line { transition: filter 250ms linear; } amp-lyrics-display-synced-line:has(~ [is-current]) { --line-animation-name: fade-out; } amp-lyrics-display-synced-line:not([is-current], :has(.is-first)), amp-lyrics-display-synced-line:has(~ [is-current]) { filter: blur(var(--inactive-gaussian-blur, 0)); }`;
const RUNTIME_CSS = `@charset "UTF-8";.display-synced-line{--gradient-color:var(--gradient-color-override, 0);--gradient-progress:0;--gradient-progress-2:0;--gradient-color-alpha:var(--gradient-color-alpha-override, .5);--gradient-color-alpha-active:var(--gradient-color-alpha-active-override, .85);margin:0;margin-right:calc(var(--lyrics-line-overbleed, 0) * -1);padding-right:var(--lyrics-line-overbleed, 0);width:100%;display:block;box-sizing:border-box;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif;line-height:0}@media (prefers-color-scheme: dark){.display-synced-line{--gradient-color:var(--gradient-color-override, 255)}}.display-synced-line.collapsible{height:0;overflow:hidden;animation:0.3s ease-in-out 1 height-collapse}.display-synced-line.is-current.collapsible{height:auto;overflow:initial;animation:0.3s ease-in-out 1 height-expand}.display-synced-line.is-current.collapsible.is-first{height:auto;overflow:initial;animation:none}.display-synced-line.is-secondary-vocalist{transform-origin:right center;text-align:right}.display-synced-line.is-animating{will-change:transform, opacity, color, top, background-image}.display-synced-line.is-animating.emphasis{will-change:transform, opacity, color, top, background-image, text-shadow}.display-synced-line[dir=rtl] .line{transform-origin:right center}.primary-vocals:dir(rtl),.background-vocals:dir(rtl){--gradient-direction:to left}.line:has(.show-supplementary .supplementary):not(:has(.secondary.is-visible)) .primary-vocals,.line:has(.show-supplementary .supplementary):not(:has(.secondary.is-visible)) .background-vocals{margin-bottom:-0.5em}.display-synced-line:not(.is-secondary-vocalist) .primary-vocals .trailing-whitespace>*::after,.display-synced-line:not(.is-secondary-vocalist) .background-vocals .trailing-whitespace>*::after{content:"";margin-right:0.3ch}.display-synced-line.is-secondary-vocalist .primary-vocals .trailing-whitespace>*::after,.display-synced-line.is-secondary-vocalist .background-vocals .trailing-whitespace>*::after{content:"";margin-left:0.3ch}.group{width:auto;display:inline-block;text-align:start;vertical-align:top;transition:height 0.4s linear, margin 0.4s linear}.group.show-supplementary:has(.supplementary){margin-bottom:0.4em}.main{display:inline-block;text-align:start;transition:height 0.4s linear, width 0.4s linear}.main:has(.show-supplementary){display:block}.supplementary{width:0;max-height:0;display:block;overflow:visible;font-size:var(--lyrics-line-supplementary-font-size, 15px);line-height:var(--lyrics-line-supplementary-line-height, 1.2em);white-space:nowrap;transition:width 0.4s linear, height 0.4s linear, margin-top 0.4s linear;opacity:0}.supplementary:has(:first-child[dir=rtl]){--gradient-direction:to left}.supplementary:has(:first-child[dir=ltr]){--gradient-direction:to right}.show-supplementary .supplementary{margin-top:0.2em;width:auto;max-height:24px}.static-supplementary,.secondary{max-height:0;overflow:hidden;text-wrap:balance;transition:width 0.4s linear, height 0.4s linear, margin-top 0.4s linear}.static-supplementary.is-visible,.secondary.is-visible{overflow:visible}.secondary{display:block;font-size:var(--lyrics-line-secondary-font-size, 13px);line-height:var(--lyrics-line-secondary-line-height, 1.2em)}.secondary.is-visible{margin-top:0.2em;}@media (prefers-contrast: more){.secondary.is-visible{opacity:1 !important}}.secondary--background{font-size:var(--lyrics-line-secondary-background-font-size, 12px)}.secondary--background.is-visible{margin-top:0}.static-supplementary{display:block;font-size:var(--lyrics-line-supplementary-font-size, 15px);line-height:var(--lyrics-line-supplementary-line-height, 1.2em);white-space:pre-wrap}.static-supplementary.is-visible{margin-top:0.2em;}@media (prefers-contrast: more){.static-supplementary.is-visible{opacity:1 !important}}.background-vocals,.secondary--background{display:none}[lang]:lang(ar){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Arabic UI Text", "SF Pro Icons", "Segoe UI", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(bn){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Bengali", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(gu){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Gujarati", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(he){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Arial Hebrew", "SF Pro Icons", "Segoe UI", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(hi){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Devanagari", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(ja){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Hiragino Sans", "SF Pro Icons", "Hiragino Kaku Gothic Pro", "ヒラギノ角ゴ Pro W3", "メイリオ", "Meiryo", "ＭＳ Ｐゴシック", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(kn){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Kannada", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(ko){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Apple SD Gothic Neo", "SF Pro Icons", "Apple Gothic", "HY Gulim", "MalgunGothic", "HY Dotum", "Lexi Gulim", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(ml){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Malayalam", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(mr){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Devanagari", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(or){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Odia", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(pa){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Gurmukhi", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(ta){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Tamil", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(te){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Telugu", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(th){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Thonburi Pro", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(ur){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Geeza Pro", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(zh-CN){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang SC", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(zh-HK){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang HK", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(zh-MO){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang HK", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(zh-TW){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang TC", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.word{display:inline-block}.syllable{margin-top:-5px;padding-top:5px;display:inline-block;position:relative;transform-origin:right;line-height:normal;white-space:pre}.display-synced-line.is-current .syllable:not(.emphasis)[style*="--gradient-progress"]{background-image:linear-gradient(var(--gradient-direction, to right), rgba(var(--gradient-color), var(--gradient-color), var(--gradient-color), var(--gradient-color-alpha-active)) var(--gradient-progress), rgba(var(--gradient-color), var(--gradient-color), var(--gradient-color), var(--gradient-color-alpha)) calc(var(--gradient-progress) + 20%));background-clip:text;-webkit-text-fill-color:transparent;-webkit-background-clip:text}.letter{display:inline-block}.display-synced-line.is-current .letter[style*="--text-shadow-opacity"]{text-shadow:0 0 var(--text-shadow-blur-radius) rgba(255, 255, 255, var(--text-shadow-opacity));background-image:linear-gradient(90deg, rgba(var(--gradient-color), var(--gradient-color), var(--gradient-color), var(--gradient-color-alpha-active)) var(--gradient-progress), rgba(var(--gradient-color), var(--gradient-color), var(--gradient-color), var(--gradient-color-alpha)) calc(var(--gradient-progress) + 20%));background-clip:text;-webkit-text-fill-color:transparent;-webkit-background-clip:text}@supports (background-image: -webkit-named-image(apple-pay-logo-black)) or (-webkit-appearance: -apple-pay-button){.display-synced-line.is-current .syllable,.display-synced-line.is-current .letter{margin:-0.5px -0.75px -0.5px -0.75px;padding:0.5px 0.75px 0.5px 0.75px;clip-path:inset(0.5px 0.75px 0.5px 0.75px)}}.line{margin:0;padding:0;display:inline-block;border:0;background-color:transparent;outline:none;cursor:pointer;appearance:none;font-family:inherit;font-size:inherit;line-height:inherit;font-size:22px;line-height:1.1818181818;font-weight:700;letter-spacing:0em;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif;margin-top:var(--lyrics-line-margin-top, 30px);margin-right:var(--lyrics-line-margin-right, 45px);margin-bottom:var(--lyrics-line-margin-bottom, 0);margin-left:var(--lyrics-line-margin-left, 20px);transform:scale(1);transform-origin:left center;font-size:var(--lyrics-line-font-size, 22px);color:var(--lyrics-line-color, var(--systemTertiary));line-height:var(--lyrics-line-line-height, 1.1818181818);text-align:initial;transition:color 0.1s, transform 0.1s ease-in-out, padding 0.1s ease-in-out, height 0.4s linear, margin-top 0.4s linear;animation-name:var(--line-animation-name, none);animation-duration:1s;animation-play-state:var(--line-animation-play-state, paused);animation-timing-function:linear;animation-delay:0.5;animation-iteration-count:1;animation-fill-mode:forwards;white-space-collapse:initial;text-wrap-mode:initial}.line::-moz-focus-inner{border:0}.line:lang(bn){line-height:1.7727272727;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Bengali", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.line:lang(gu){line-height:1.7727272727;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Gujarati", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.line:lang(hi){line-height:1.7727272727;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Devanagari", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.line:lang(kn){line-height:1.7727272727;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Kannada", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.line:lang(ml){line-height:1.7727272727;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Malayalam", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.line:lang(mr){line-height:1.7727272727;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Devanagari", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.line:lang(or){line-height:1.7727272727;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Odia", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.line:lang(pa){line-height:1.7727272727;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Gurmukhi", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.line:lang(ta){line-height:1.7727272727;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Tamil", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.line:lang(te){line-height:1.7727272727;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Telugu", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.line:lang(ur){line-height:1.7727272727;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Geeza Pro", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.line:lang(th){line-height:1.4005545455;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Thonburi Pro", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.line:lang(zh){font-weight:600}.line:lang(ar){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Arabic UI Display", "SF Pro Icons", "Segoe UI", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.line:lang(he){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Arial Hebrew", "SF Pro Icons", "Segoe UI", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.line:lang(ja){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Hiragino Sans", "SF Pro Icons", "Hiragino Kaku Gothic Pro", "ヒラギノ角ゴ Pro W3", "メイリオ", "Meiryo", "ＭＳ Ｐゴシック", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.line:lang(ko){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Apple SD Gothic Neo", "SF Pro Icons", "Apple Gothic", "HY Gulim", "MalgunGothic", "HY Dotum", "Lexi Gulim", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.line:lang(zh-CN){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang SC", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.line:lang(zh-HK){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang HK", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.line:lang(zh-MO){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang HK", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.line:lang(zh-TW){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang TC", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.display-synced-line:not(.is-current) .line:hover,.display-synced-line:not(.is-current) .line:active,.display-synced-line:not(.is-current) .line:focus{color:var(--lyrics-line-hover-color, var(--systemPrimary)) !important}.display-synced-line.is-current .line{padding:var(--lyrics-current-line-padding-block, 12px) 0;transform:scale(var(--lyrics-current-line-scale, 1.1));color:var(--lyrics-line-color-current, var(--systemPrimary))}.display-synced-line.is-current .line .background-vocals{--gradient-color-alpha:var(--gradient-color-bg-alpha-override, .5);--gradient-color-alpha-active:var(--gradient-color-bg-alpha-active-override, .85);margin-top:20px;font-size:var(--lyrics-line-bg-font-size, 14px);color:var(--lyrics-line-bg-color, var(--lyrics-line-color-current));line-height:var(--lyrics-line-bg-line-height, 1.2em)}.display-synced-line.is-current .line .background-vocals .supplementary{font-size:var(--lyrics-line-subsidiary-font-size, 13px);line-height:var(--lyrics-line-subsidiary-line-height, 1.2em)}.display-synced-line.is-current .line .background-vocals,.display-synced-line.is-current .line .secondary--background{display:block}.display-synced-line.collapsible:not(.is-current) .line{transform:scale(0.1)}.display-synced-line.is-duet .line{width:var(--lyrics-line-duet-width, 60%)}.display-synced-line.is-secondary-vocalist .line{transform-origin:right center;text-align:right}@keyframes height-expand{0%{height:0}99%{height:80px}100%{height:auto}}@keyframes height-collapse{0%{height:80px}100%{height:0}}@keyframes fade-out{0%{opacity:1}100%{opacity:var(--lyrics-display-synced-line-opacity, 1)}}`;

let displaySheet: CSSStyleSheet | undefined;

function getDisplaySheet(): CSSStyleSheet {
  if (!displaySheet) {
    displaySheet = new CSSStyleSheet();
    displaySheet.replaceSync(APPLE_CSS);
  }
  return displaySheet;
}

export class AmpLyricsDisplayTimeSynced extends HTMLElement {
  private resizeObserver?: ResizeObserver;
  private topSpacer?: HTMLDivElement;
  private bottomSpacer?: HTMLDivElement;
  private lines: SyncedLyricLine[] = [];
  private activeIndex = -1;
  private activeLineTopRatio = DEFAULT_ACTIVE_LINE_TOP_RATIO;
  private isAutoScrollVisual = true;
  private isPlaying = false;
  private lineStaggerEnabled = false;
  private scrollAnimationFrame?: number;
  private activeScrollFrame?: number;
  private lineAnimations = new Map<HTMLElement, Animation>();
  private spacerUpdateFrame?: number;

  connectedCallback() {
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    this.style.setProperty(
      "--instrumental-enter-duration",
      `${INSTRUMENTAL_FADE_IN_MS}ms`,
    );
    this.style.setProperty(
      "--instrumental-render-delay",
      `${INSTRUMENTAL_RENDER_DELAY_MS}ms`,
    );
    this.style.setProperty(
      "--instrumental-exit-duration",
      `${INSTRUMENTAL_TRANSITION_DURATION_MS}ms`,
    );

    if (!shadow.childNodes.length) {
      shadow.adoptedStyleSheets = [getDisplaySheet()];

      this.topSpacer = document.createElement("div");
      this.topSpacer.dataset.role = "top-spacer";

      this.bottomSpacer = document.createElement("div");
      this.bottomSpacer.dataset.role = "bottom-spacer";

      const runtimeStyle = document.createElement("style");
      runtimeStyle.dataset.role = "runtime-style";
      runtimeStyle.textContent = RUNTIME_CSS;

      const wordTimingStyle = document.createElement("style");
      wordTimingStyle.dataset.role = "word-timing-style";
      wordTimingStyle.textContent =
        ".display-synced-line.is-current .syllable:not([style*='--gradient-progress']) { color: var(--lyrics-line-color, var(--systemTertiary)); }";

      const instrumentalTransitionStyle = document.createElement("style");
      instrumentalTransitionStyle.textContent = `.display-synced-line.collapsible { animation: none; transition: height ${INSTRUMENTAL_TRANSITION_DURATION_MS}ms ease-in-out; } .display-synced-line.is-current.collapsible { height: var(--instrumental-line-height, 0px); animation: none; } amp-lyrics-display-synced-line[data-past] .line { animation-name: none; opacity: var(--lyrics-display-synced-line-opacity, 1); } :host([detail-line-motion]) amp-lyrics-display-synced-line:has(~ [is-current]) .line { animation-duration: var(--lyrics-past-line-fade-duration, 1s); }`;

      shadow.append(
        this.topSpacer,
        this.bottomSpacer,
        runtimeStyle,
        wordTimingStyle,
        instrumentalTransitionStyle,
      );

      this.setAttribute("hydrated", "");
    } else {
      this.topSpacer =
        shadow.querySelector('[data-role="top-spacer"]') ?? undefined;
      this.bottomSpacer =
        shadow.querySelector('[data-role="bottom-spacer"]') ?? undefined;
    }

    this.resizeObserver = new ResizeObserver(() => this.scheduleSpacerUpdate());
    this.resizeObserver.observe(this);
    this.scheduleSpacerUpdate();
    this.renderLines();
  }

  disconnectedCallback() {
    this.cancelScrollAnimation();
    this.cancelActiveScroll();
    this.cancelLineAnimations();
    if (this.spacerUpdateFrame !== undefined) {
      cancelAnimationFrame(this.spacerUpdateFrame);
      this.spacerUpdateFrame = undefined;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
  }

  setLines(lines: SyncedLyricLine[]) {
    this.cancelScrollAnimation();
    this.cancelActiveScroll();
    this.cancelLineAnimations();
    this.lines = lines;
    this.activeIndex = -1;
    this.renderLines();
  }

  setActiveLineTopRatio(value: number) {
    const nextRatio = Math.min(1, Math.max(0, value));
    if (this.activeLineTopRatio === nextRatio) return;

    this.activeLineTopRatio = nextRatio;
    this.updateSpacerHeights();
  }

  setLineStaggerEnabled(value: boolean) {
    if (this.lineStaggerEnabled === value) return;

    this.lineStaggerEnabled = value;
    this.toggleAttribute("detail-line-motion", value);
    if (!value) this.cancelLineAnimations();
  }

  private getLineTransitionMotion(index: number) {
    const currentLyric = this.lines[index];
    const previousLyric = this.lines[index - 1];
    return getLineSpringMotion(
      currentLyric && previousLyric
        ? currentLyric.startTimeMs - previousLyric.startTimeMs
        : undefined,
      previousLyric?.kind === "INSTRUMENTAL",
    );
  }

  setActiveIndex(index: number, shouldScroll: boolean) {
    if (this.activeIndex === index) return;

    const previousIndex = this.activeIndex;
    this.activeIndex = index;
    const elements = this.shadowRoot?.querySelectorAll(
      "amp-lyrics-display-synced-line",
    );
    const setCurrent = (lineIndex: number, current: boolean) => {
      const element = elements?.[lineIndex] as
        | (HTMLElement & { current: boolean })
        | undefined;
      if (element) element.current = current;
    };
    if (previousIndex >= 0 && index > previousIndex) {
      elements?.forEach((element, lineIndex) => {
        if (lineIndex < previousIndex) element.setAttribute("data-past", "");
      });
    } else if (index < previousIndex) {
      elements?.forEach((element) => element.removeAttribute("data-past"));
    }
    if (
      this.lineStaggerEnabled &&
      previousIndex >= 0 &&
      index > previousIndex
    ) {
      const fadeDuration = Math.max(
        MIN_PAST_LINE_FADE_DURATION_MS,
        this.getLineTransitionMotion(index).duration - PAST_LINE_FADE_LEAD_MS,
      );
      this.style.setProperty(
        "--lyrics-past-line-fade-duration",
        `${fadeDuration}ms`,
      );
    }
    setCurrent(previousIndex, false);
    setCurrent(index, true);

    this.cancelActiveScroll();
    if (this.lines[index]?.kind === "INSTRUMENTAL") {
      this.activeScrollFrame = requestAnimationFrame(() => {
        this.activeScrollFrame = undefined;
        if (!this.isConnected) return;
        if (previousIndex >= 0) {
          this.scrollInstrumentalToPreviousLine(index, previousIndex);
        } else if (shouldScroll) {
          this.scrollActiveLine();
        }
      });
      return;
    }

    if (!shouldScroll) return;

    this.activeScrollFrame = requestAnimationFrame(() => {
      this.activeScrollFrame = undefined;
      if (this.isConnected) this.scrollActiveLine();
    });
  }

  setPlaybackTimeMs(timeMs: number) {
    const element = this.shadowRoot?.querySelectorAll(
      "amp-lyrics-display-synced-line",
    )[this.activeIndex];
    if (element) {
      (element as HTMLElement & { playbackTimeMs: number }).playbackTimeMs =
        timeMs;
    }
  }

  setPlaying(value: boolean) {
    if (this.isPlaying === value) return;

    this.isPlaying = value;
    this.shadowRoot
      ?.querySelectorAll("amp-lyrics-display-synced-line")
      .forEach((element) => {
        (element as HTMLElement & { playing: boolean }).playing = value;
      });
  }

  focusLine(index: number, behavior: ScrollBehavior = "smooth") {
    if (index < 0) return;
    this.cancelActiveScroll();
    this.setActiveIndex(index, false);
    this.scrollLine(index, behavior);
  }

  setAutoScroll(value: boolean, hidePastLines = value) {
    if (!value) {
      this.cancelScrollAnimation();
      this.cancelActiveScroll();
      this.cancelLineAnimations();
    }

    this.toggleAttribute("hide-past-lines", value && hidePastLines);

    if (this.isAutoScrollVisual === value) {
      this.toggleAttribute("scroll", value);
      return;
    }

    this.isAutoScrollVisual = value;
    this.toggleAttribute("scroll", value);

    if (value) {
      this.style.removeProperty("--lyrics-display-synced-line-opacity");
    } else {
      this.style.setProperty("--lyrics-display-synced-line-opacity", "1");
    }

    this.shadowRoot
      ?.querySelectorAll<HTMLElement>("amp-lyrics-display-synced-line")
      .forEach((line) => {
        line.style.filter = value ? "" : "none";
      });
  }

  private scrollActiveLine() {
    if (!this.lineStaggerEnabled) {
      this.scrollLine(this.activeIndex, "smooth");
      return;
    }

    // The original player moves every lyric group independently. Keep the
    // existing scroll layout, but preserve each line's visual position and
    // retarget it through a staggered spring after the scroll position changes.
    this.scrollLineWithStagger(this.activeIndex);
  }

  private scrollInstrumentalToPreviousLine(
    instrumentalIndex: number,
    previousIndex: number,
  ) {
    this.cancelLineAnimations();
    const lines = this.shadowRoot?.querySelectorAll(
      "amp-lyrics-display-synced-line",
    );
    const instrumentalLine = lines?.[instrumentalIndex];
    const previousLine = lines?.[previousIndex];
    if (!instrumentalLine || !previousLine) return;

    const targetScrollTop = Math.min(
      Math.max(
        0,
        this.scrollTop +
          instrumentalLine.getBoundingClientRect().top -
          previousLine.getBoundingClientRect().top,
      ),
      this.scrollHeight - this.clientHeight,
    );

    this.animateScrollTo(targetScrollTop, INSTRUMENTAL_SCROLL_DURATION_MS);
  }

  private scrollLine(
    index: number,
    behavior: ScrollBehavior = "smooth",
    duration = AUTO_SCROLL_DURATION_MS,
  ) {
    this.cancelLineAnimations();
    const line = this.shadowRoot?.querySelectorAll(
      "amp-lyrics-display-synced-line",
    )[index];
    if (!line) return;

    const hostRect = this.getBoundingClientRect();
    const lineRect = line.getBoundingClientRect();
    const targetScrollTop = Math.min(
      Math.max(
        0,
        this.scrollTop +
          lineRect.top -
          hostRect.top -
          this.clientHeight * this.activeLineTopRatio,
      ),
      this.scrollHeight - this.clientHeight,
    );

    if (behavior === "smooth") {
      this.animateScrollTo(targetScrollTop, duration);
    } else {
      this.cancelScrollAnimation();
      this.scrollTop = targetScrollTop;
    }
  }

  private scrollLineWithStagger(index: number) {
    const lines = this.shadowRoot?.querySelectorAll<HTMLElement>(
      "amp-lyrics-display-synced-line",
    );
    const activeLine = lines?.[index];
    if (!lines || !activeLine) return;

    const offsets = new Map<HTMLElement, number>();
    this.lineAnimations.forEach((_animation, element) => {
      offsets.set(element, this.getTranslateY(element));
    });
    this.cancelLineAnimations();

    const activeMotionElement = this.getMotionElement(activeLine);
    const hostRect = this.getBoundingClientRect();
    const activeRect = activeMotionElement.getBoundingClientRect();
    const targetScrollTop = Math.min(
      Math.max(
        0,
        this.scrollTop +
          activeRect.top -
          hostRect.top -
          this.clientHeight * this.activeLineTopRatio,
      ),
      this.scrollHeight - this.clientHeight,
    );

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.cancelScrollAnimation();
      this.scrollTop = targetScrollTop;
      return;
    }

    const previousScrollTop = this.scrollTop;

    this.cancelScrollAnimation();
    this.scrollTop = targetScrollTop;
    const scrollDelta = targetScrollTop - previousScrollTop;
    const lineSpring = this.getLineTransitionMotion(index);

    let delay = 0;
    let baseDelay = LINE_STAGGER_DELAY_MS;
    const firstMotionIndex = Math.max(0, index - LINE_MOTION_RADIUS);
    const lastMotionIndex = Math.min(
      lines.length - 1,
      index + LINE_MOTION_RADIUS,
    );
    for (
      let lineIndex = firstMotionIndex;
      lineIndex <= lastMotionIndex;
      lineIndex += 1
    ) {
      const line = lines[lineIndex];
      const motionElement = this.getMotionElement(line);
      const initialOffset = (offsets.get(motionElement) ?? 0) + scrollDelta;
      const lineDelay = lineIndex < index ? 0 : delay;

      if (Math.abs(initialOffset) >= 0.5) {
        const transform = `translateY(${initialOffset.toFixed(2)}px)`;
        motionElement.style.transform = transform;
        motionElement.style.willChange = "transform";
        const animation = motionElement.animate(
          [{ transform }, { transform: "translateY(0px)" }],
          {
            duration: lineSpring.duration,
            delay: lineDelay,
            easing: lineSpring.easing,
            fill: "both",
          },
        );
        this.lineAnimations.set(motionElement, animation);
        animation.onfinish = () => {
          if (this.lineAnimations.get(motionElement) !== animation) return;
          motionElement.style.transform = "";
          motionElement.style.willChange = "";
          this.lineAnimations.delete(motionElement);
        };
      }

      if (lineIndex >= index) {
        delay += baseDelay;
        baseDelay /= 1.05;
      }
    }
  }

  private getMotionElement(line: HTMLElement) {
    return line.querySelector<HTMLElement>(".display-synced-line") ?? line;
  }

  private getTranslateY(element: HTMLElement) {
    const transform = getComputedStyle(element).transform;
    return transform && transform !== "none"
      ? new DOMMatrixReadOnly(transform).m42
      : 0;
  }

  private animateScrollTo(targetScrollTop: number, duration: number) {
    this.cancelScrollAnimation();

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.scrollTop = targetScrollTop;
      return;
    }

    const startScrollTop = this.scrollTop;
    const distance = targetScrollTop - startScrollTop;
    if (Math.abs(distance) < 1) return;

    let startTime: number | undefined;
    const tick = (timestamp: number) => {
      startTime ??= timestamp;
      const progress = Math.min(1, (timestamp - startTime) / duration);
      const easedProgress = 1 - (1 - progress) ** 4;
      this.scrollTop = startScrollTop + distance * easedProgress;

      if (progress < 1) {
        this.scrollAnimationFrame = requestAnimationFrame(tick);
      } else {
        this.scrollAnimationFrame = undefined;
      }
    };

    this.scrollAnimationFrame = requestAnimationFrame(tick);
  }

  private cancelScrollAnimation() {
    if (this.scrollAnimationFrame !== undefined) {
      cancelAnimationFrame(this.scrollAnimationFrame);
      this.scrollAnimationFrame = undefined;
    }
  }

  private cancelActiveScroll() {
    if (this.activeScrollFrame !== undefined) {
      cancelAnimationFrame(this.activeScrollFrame);
      this.activeScrollFrame = undefined;
    }
  }

  private cancelLineAnimations() {
    this.lineAnimations.forEach((animation, line) => {
      animation.cancel();
      line.style.transform = "";
      line.style.willChange = "";
    });
    this.lineAnimations.clear();
  }

  private scheduleSpacerUpdate() {
    if (this.spacerUpdateFrame !== undefined) return;

    this.spacerUpdateFrame = requestAnimationFrame(() => {
      this.spacerUpdateFrame = undefined;
      if (this.isConnected) this.updateSpacerHeights();
    });
  }

  private renderLines() {
    const shadow = this.shadowRoot;
    if (!shadow || !this.bottomSpacer) return;

    shadow
      .querySelectorAll("amp-lyrics-display-synced-line")
      .forEach((line) => line.remove());

    const fragment = document.createDocumentFragment();
    this.lines.forEach((line, index) => {
      const element = document.createElement(
        "amp-lyrics-display-synced-line",
      ) as HTMLElement & {
        lyric: SyncedLyricLine;
        current: boolean;
        playing: boolean;
        delayInstrumentalRender: boolean;
      };
      element.lyric = line;
      element.current = index === this.activeIndex;
      element.playing = this.isPlaying;
      element.delayInstrumentalRender =
        line.kind === "INSTRUMENTAL" &&
        index > 0 &&
        index < this.lines.length - 1;
      fragment.appendChild(element);
    });
    shadow.insertBefore(fragment, this.bottomSpacer);
  }

  private updateSpacerHeights() {
    const topSpacerHeight = Math.max(
      0,
      this.clientHeight * this.activeLineTopRatio,
    );
    const bottomSpacerHeight = Math.max(
      0,
      this.clientHeight * (1 - this.activeLineTopRatio),
    );

    if (this.topSpacer) this.topSpacer.style.height = `${topSpacerHeight}px`;
    if (this.bottomSpacer) {
      this.bottomSpacer.style.height = `${bottomSpacerHeight}px`;
    }
  }
}

if (!customElements.get(TAG_NAME)) {
  customElements.define(TAG_NAME, AmpLyricsDisplayTimeSynced);
}
