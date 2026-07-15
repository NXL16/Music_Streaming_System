"use client";

import React, { useLayoutEffect, useRef } from "react";

const APPLE_CSS = `@charset "UTF-8";:host{margin:0 0 11px 0;width:100%;height:auto;display:grid;visibility:visible;grid-template-columns:var(--progress-bar-grid-template-columns, auto 1fr auto);grid-template-rows:var(--progress-bar-grid-template-rows, var(--progress-thumb-height, 9px) auto);grid-template-areas:var(--progress-bar-grid-template-areas, "scrubber scrubber scrubber" "elapsed . remaining");flex:1 1 100%;align-items:center;justify-content:stretch;column-gap:var(--progress-bar-grid-column-gap, 0);font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif;row-gap:var(--progress-bar-grid-row-gap, 4px)}:host *{box-sizing:border-box}[lang]:lang(ar){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Arabic UI Text", "SF Pro Icons", "Segoe UI", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(bn){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Bengali", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(gu){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Gujarati", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(he){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Arial Hebrew", "SF Pro Icons", "Segoe UI", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(hi){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Devanagari", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(ja){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Hiragino Sans", "SF Pro Icons", "Hiragino Kaku Gothic Pro", "ヒラギノ角ゴ Pro W3", "メイリオ", "Meiryo", "ＭＳ Ｐゴシック", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(kn){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Kannada", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(ko){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Apple SD Gothic Neo", "SF Pro Icons", "Apple Gothic", "HY Gulim", "MalgunGothic", "HY Dotum", "Lexi Gulim", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(ml){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Malayalam", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(mr){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Devanagari", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(or){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Odia", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(pa){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Gurmukhi", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(ta){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Tamil", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(te){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Telugu", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(th){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Thonburi Pro", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(ur){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Geeza Pro", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(zh-CN){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang SC", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(zh-HK){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang HK", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(zh-MO){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang HK", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}[lang]:lang(zh-TW){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang TC", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}@keyframes progress-buffering{0%{opacity:1}50%{opacity:0.45}100%{opacity:1}}.scrubber{grid-area:scrubber;flex:1 1 100%}.scrubber.scrubber--buffering{animation-name:progress-buffering;animation-duration:3s;animation-iteration-count:infinite}.time{font-size:11px;line-height:1.2727272727;font-weight:500;letter-spacing:0em;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif;flex-shrink:0;overflow:hidden;color:var(--progress-time, rgba(255, 255, 255, 0.55));font-feature-settings:"tnum";font-variant-numeric:tabular-nums}.time:lang(bn){line-height:1.9091009091;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Bengali", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.time:lang(gu){line-height:1.9091009091;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Gujarati", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.time:lang(hi){line-height:1.9091009091;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Devanagari", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.time:lang(kn){line-height:1.9091009091;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Kannada", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.time:lang(ml){line-height:1.9091009091;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Malayalam", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.time:lang(mr){line-height:1.9091009091;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Devanagari", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.time:lang(or){line-height:1.9091009091;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Odia", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.time:lang(pa){line-height:1.9091009091;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Gurmukhi", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.time:lang(ta){line-height:1.9091009091;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Tamil", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.time:lang(te){line-height:1.9091009091;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Telugu", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.time:lang(ur){line-height:1.9091009091;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Geeza Pro", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.time:lang(th){line-height:1.5082018182;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Thonburi Pro", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.time:lang(ar){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Arabic UI Text", "SF Pro Icons", "Segoe UI", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.time:lang(he){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Arial Hebrew", "SF Pro Icons", "Segoe UI", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.time:lang(ja){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Hiragino Sans", "SF Pro Icons", "Hiragino Kaku Gothic Pro", "ヒラギノ角ゴ Pro W3", "メイリオ", "Meiryo", "ＭＳ Ｐゴシック", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.time:lang(ko){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Apple SD Gothic Neo", "SF Pro Icons", "Apple Gothic", "HY Gulim", "MalgunGothic", "HY Dotum", "Lexi Gulim", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.time:lang(zh-CN){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang SC", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.time:lang(zh-HK){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang HK", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.time:lang(zh-MO){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang HK", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.time:lang(zh-TW){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang TC", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.elapsed{grid-area:elapsed}.remaining{grid-area:remaining}`;

interface AmpPlaybackControlsProgressProps {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isProgressExpanded?: boolean;
}

export default function AmpPlaybackControlsProgress({
  audioRef,
  isProgressExpanded,
}: AmpPlaybackControlsProgressProps) {
  const containerRef = useRef<HTMLElement>(null);

  const nodesRef = useRef<{
    elapsed?: HTMLTimeElement | null;
    remaining?: HTMLTimeElement | null;
    input?: HTMLInputElement | null;
    liveEdgeElements?: HTMLElement[];
  }>({});

  const isScrubbingRef = useRef<boolean>(false);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const formatAriaText = (seconds: number) => {
    if (seconds < 0 || isNaN(seconds)) return "0 Seconds";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);

    const minStr =
      mins > 0 ? `${mins} ${mins === 1 ? "Minute" : "Minutes"}` : "";
    const secStr = `${secs} ${secs === 1 ? "Second" : "Seconds"}`;

    return minStr ? `${minStr} and ${secStr}` : secStr;
  };

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let shadow = el.shadowRoot;
    if (!shadow) shadow = el.attachShadow({ mode: "open" });

    if (
      "adoptedStyleSheets" in document &&
      shadow.adoptedStyleSheets.length === 0
    ) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(APPLE_CSS);
      shadow.adoptedStyleSheets = [sheet];
    }

    if (!shadow.querySelector(".time.elapsed")) {
      shadow.innerHTML = `
        <time class="time elapsed" role="timer"></time>
        <amp-playback-controls-progress-range class="scrubber" hydrated="">
          <div class="progress-range" dir="ltr">
            <div class="progress-range__shadow"></div>
            <label for="playback-progress">Playback progress</label>
            <input 
              id="playback-progress" 
              type="range" 
              min="0" 
              max="0"
              step="0.01"
              disabled
              dir="ltr" 
              role="slider" 
              aria-label="Playback progress" 
              aria-valuemin="0" 
              aria-valuemax="0"
              aria-orientation="horizontal"
            />
            <div class="progress-range__live-edge">
              <div class="progress-range__live-edge-indicator">
                <div class="progress-range__live-edge-capsule">LIVE</div>
              </div>
            </div>
          </div>
        </amp-playback-controls-progress-range>
        <time class="time remaining" role="timer"></time>
        <style>@charset "UTF-8";.progress-range{position:relative}.progress-range__shadow{width:100%;height:var(--progress-track-height, 3px);display:none;position:absolute;z-index:-1;top:calc((100% - var(--progress-track-height, 3px)) / 2);left:0;border-radius:5px;background-color:rgba(246, 246, 246, 0.36)}.progress-range--clipped .progress-range__shadow{display:block}.progress-range label{position:absolute;clip:rect(1px, 1px, 1px, 1px);clip-path:inset(0 0 99.9% 99.9%);overflow:hidden;height:1px;width:1px;padding:0;border:0}input[type=range]{--progress:0%;margin:0;padding:0;width:100%;max-width:100%;height:var(--progress-track-max-height, auto);display:block;border:0;background-color:transparent;cursor:pointer;-webkit-appearance:none;box-sizing:content-box;position:relative;z-index:1}input[type=range]::-moz-range-thumb{width:var(--progress-thumb-width, var(--progress-thumb-height, 9px));height:var(--progress-thumb-height, 9px);box-sizing:border-box;transform:scale(var(--progress-thumb-multiplier-active, 1));border:var(--progress-thumb-border-width, 0) solid var(--progress-thumb-color-outline, transparent);border-bottom:var(--progress-thumb-border-bottom-width, 0) solid var(--progress-thumb-color-bottom-outline, transparent);border-radius:var(--progress-thumb-border-radius, 50%);background-color:var(--progress-thumb-color, white);background-position:center;outline:1px solid var(--progress-thumb-outline-active, transparent);-moz-transition:transform 0.1s ease-in-out, opacity 0.1s ease-in, background-color 0.1s ease-in;transition:transform 0.1s ease-in-out, opacity 0.1s ease-in, background-color 0.1s ease-in;opacity:var(--thumb-opacity, 1);cursor:pointer;-webkit-appearance:none;transform:scale(var(--progress-thumb-multiplier-active, 1)) translateY(var(--progress-thumb-offset-hover, var(--progress-thumb-offset, -3px)))}@supports (-moz-appearance: none){input[type=range]::-moz-range-thumb{transform:scale(var(--progress-thumb-multiplier-active, 1)) translateY(var(--progress-thumb-offset, 0))}}input[type=range]::-webkit-slider-thumb{box-shadow:var(--progress-thumb-box-shadow, none)}input[type=range]::-moz-range-thumb{box-shadow:var(--progress-thumb-box-shadow, none)}input[type=range]::-webkit-slider-thumb{width:var(--progress-thumb-width, var(--progress-thumb-height, 9px));height:var(--progress-thumb-height, 9px);box-sizing:border-box;transform:scale(var(--progress-thumb-multiplier-active, 1));border:var(--progress-thumb-border-width, 0) solid var(--progress-thumb-color-outline, transparent);border-bottom:var(--progress-thumb-border-bottom-width, 0) solid var(--progress-thumb-color-bottom-outline, transparent);border-radius:var(--progress-thumb-border-radius, 50%);background-color:var(--progress-thumb-color, white);background-position:center;outline:1px solid var(--progress-thumb-outline-active, transparent);-webkit-transition:transform 0.1s ease-in-out, opacity 0.1s ease-in, background-color 0.1s ease-in;transition:transform 0.1s ease-in-out, opacity 0.1s ease-in, background-color 0.1s ease-in;opacity:var(--thumb-opacity, 1);cursor:pointer;-webkit-appearance:none;transform:scale(var(--progress-thumb-multiplier-active, 1)) translateY(var(--progress-thumb-offset-hover, var(--progress-thumb-offset, -3px)))}@supports (-moz-appearance: none){input[type=range]::-webkit-slider-thumb{transform:scale(var(--progress-thumb-multiplier-active, 1)) translateY(var(--progress-thumb-offset, 0))}}input[type=range]::-webkit-slider-thumb{box-shadow:var(--progress-thumb-box-shadow, none)}input[type=range]::-moz-range-thumb{box-shadow:var(--progress-thumb-box-shadow, none)}input[type=range]::-ms-thumb{width:var(--progress-thumb-width, var(--progress-thumb-height, 9px));height:var(--progress-thumb-height, 9px);box-sizing:border-box;transform:scale(var(--progress-thumb-multiplier-active, 1));border:var(--progress-thumb-border-width, 0) solid var(--progress-thumb-color-outline, transparent);border-bottom:var(--progress-thumb-border-bottom-width, 0) solid var(--progress-thumb-color-bottom-outline, transparent);border-radius:var(--progress-thumb-border-radius, 50%);background-color:var(--progress-thumb-color, white);background-position:center;outline:1px solid var(--progress-thumb-outline-active, transparent);-ms-transition:transform 0.1s ease-in-out, opacity 0.1s ease-in, background-color 0.1s ease-in;transition:transform 0.1s ease-in-out, opacity 0.1s ease-in, background-color 0.1s ease-in;opacity:var(--thumb-opacity, 1);cursor:pointer;-webkit-appearance:none;transform:scale(var(--progress-thumb-multiplier-active, 1)) translateY(var(--progress-thumb-offset-hover, var(--progress-thumb-offset, -3px)))}@supports (-moz-appearance: none){input[type=range]::-ms-thumb{transform:scale(var(--progress-thumb-multiplier-active, 1)) translateY(var(--progress-thumb-offset, 0))}}input[type=range]::-webkit-slider-thumb{box-shadow:var(--progress-thumb-box-shadow, none)}input[type=range]::-moz-range-thumb{box-shadow:var(--progress-thumb-box-shadow, none)}input[type=range]::-moz-range-track{height:var(--progress-track-height, 3px);display:block;color:transparent;border-color:var(--progress-thumb-color-outline, transparent);border-radius:var(--progress-track-height, 3px);background-color:var(--progress-track-buffering-bg-color, transparent);background-image:var(--progress-track-buffering-bg-image, linear-gradient(var(--track-direction, 90deg), var(--progress-track-color-elapsed, #e5e5e5) var(--progress), var(--progress-track-color, #414141) var(--progress)));background-repeat:no-repeat;background-position:center;background-size:100% var(--progress-track-bg-height, var(--progress-track-height, 3px));cursor:var(--progress-track-cursor, pointer);-webkit-appearance:none}input[type=range]::-moz-range-track:focus{outline:none}input[type=range]::-ms-track{height:var(--progress-track-height, 3px);display:block;color:transparent;border-color:var(--progress-thumb-color-outline, transparent);border-radius:var(--progress-track-height, 3px);background-color:var(--progress-track-buffering-bg-color, transparent);background-image:var(--progress-track-buffering-bg-image, linear-gradient(var(--track-direction, 90deg), var(--progress-track-color-elapsed, #e5e5e5) var(--progress), var(--progress-track-color, #414141) var(--progress)));background-repeat:no-repeat;background-position:center;background-size:100% var(--progress-track-bg-height, var(--progress-track-height, 3px));cursor:var(--progress-track-cursor, pointer);-webkit-appearance:none}input[type=range]::-ms-track:focus{outline:none}input[type=range]::-webkit-slider-runnable-track{height:var(--progress-track-height, 3px);display:block;color:transparent;border-color:var(--progress-thumb-color-outline, transparent);border-radius:var(--progress-track-height, 3px);background-color:var(--progress-track-buffering-bg-color, transparent);background-image:var(--progress-track-buffering-bg-image, linear-gradient(var(--track-direction, 90deg), var(--progress-track-color-elapsed, #e5e5e5) var(--progress), var(--progress-track-color, #414141) var(--progress)));background-repeat:no-repeat;background-position:center;background-size:100% var(--progress-track-bg-height, var(--progress-track-height, 3px));cursor:var(--progress-track-cursor, pointer);-webkit-appearance:none}input[type=range]::-webkit-slider-runnable-track:focus{outline:none}input[type=range]:hover,input[type=range]:active,input[type=range]:focus{--progress-thumb-color:var(--progress-thumb-color-active, white);--progress-thumb-multiplier-active:var(--progress-thumb-multiplier, 1);--progress-thumb-outline-active:var(--progress-thumb-outline-active-alt, var(--progress-thumb-color-outline));--progress-track-color-elapsed:var(--progress-track-color-elapsed-active);--progress-thumb-offset-hover:var(--progress-thumb-offset-hover-override);border:none;outline:none}input[type=range]::-moz-focus-inner,input[type=range]::-moz-focus-outer{border:0;outline:none}input[type=range]:focus-visible{--sk-focus-color:var(--keyColor-focus-color, var(--keyColor, #0071e3));--sk-focus-offset:2px;outline:4px solid var(--sk-focus-color, var(--keyColor-focus-color, var(--keyColor, #0071e3)));outline-offset:var(--sk-focus-offset, 1px)}@supports (-moz-appearance: none){input[type=range]{height:var(--progress-track-max-height, 3px)}}input[type=range]:disabled::-moz-range-thumb{visibility:hidden}input[type=range]:disabled::-webkit-slider-thumb{visibility:hidden}input[type=range]:disabled::-ms-thumb{visibility:hidden}.scrubber{--range-padding-vertical:10px}.scrubber input[type=range]{padding:var(--range-padding-vertical) 0}.progress-range--clipped input[type=range]{--progress-track-color:transparent;width:var(--width)}.progress-range__live-edge{width:12px;height:32px;visibility:var(--live-edge-visibility);overflow:visible;position:absolute;z-index:1;top:-4px;left:var(--liveProgress);cursor:pointer}@media (max-width: 740px){.progress-range__live-edge{top:-2px}}.progress-range__live-edge-indicator{width:2px;height:13px;visibility:var(--live-edge-visibility);overflow:visible;position:relative;top:6px}.progress-range__live-edge-indicator::before{content:"";width:2px;height:9px;display:block;position:absolute;bottom:0;left:0;border-radius:1px;background-color:#ff5066;transition:height 0.1s linear}.progress-range__live-edge-capsule{font-size:10px;line-height:1.3;font-weight:600;letter-spacing:0em;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif;padding:2px 8px;position:absolute;bottom:100%;left:0;transform:translate(-50%, 0);color:#e5e5e5;border-radius:18px;background-color:#ff5066;transition:opacity 0.15s linear;opacity:0;pointer-events:none}.progress-range__live-edge-capsule:lang(bn){line-height:1.95;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Bengali", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.progress-range__live-edge-capsule:lang(gu){line-height:1.95;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Gujarati", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.progress-range__live-edge-capsule:lang(hi){line-height:1.95;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Devanagari", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.progress-range__live-edge-capsule:lang(kn){line-height:1.95;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Kannada", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.progress-range__live-edge-capsule:lang(ml){line-height:1.95;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Malayalam", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.progress-range__live-edge-capsule:lang(mr){line-height:1.95;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Devanagari", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.progress-range__live-edge-capsule:lang(or){line-height:1.95;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Odia", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.progress-range__live-edge-capsule:lang(pa){line-height:1.95;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Gurmukhi", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.progress-range__live-edge-capsule:lang(ta){line-height:1.95;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Tamil", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.progress-range__live-edge-capsule:lang(te){line-height:1.95;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Telugu", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.progress-range__live-edge-capsule:lang(ur){line-height:1.95;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Geeza Pro", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.progress-range__live-edge-capsule:lang(th){line-height:1.5405;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Thonburi Pro", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.progress-range__live-edge-capsule:lang(ar){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Arabic UI Text", "SF Pro Icons", "Segoe UI", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.progress-range__live-edge-capsule:lang(he){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Arial Hebrew", "SF Pro Icons", "Segoe UI", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.progress-range__live-edge-capsule:lang(ja){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Hiragino Sans", "SF Pro Icons", "Hiragino Kaku Gothic Pro", "ヒラギノ角ゴ Pro W3", "メイリオ", "Meiryo", "ＭＳ Ｐゴシック", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.progress-range__live-edge-capsule:lang(ko){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Apple SD Gothic Neo", "SF Pro Icons", "Apple Gothic", "HY Gulim", "MalgunGothic", "HY Dotum", "Lexi Gulim", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.progress-range__live-edge-capsule:lang(zh-CN){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang SC", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.progress-range__live-edge-capsule:lang(zh-HK){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang HK", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.progress-range__live-edge-capsule:lang(zh-MO){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang HK", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.progress-range__live-edge-capsule:lang(zh-TW){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang TC", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.progress-range--scrubbing .progress-range__live-edge-indicator::before{height:13px;border-top-left-radius:0;border-top-right-radius:0;transition:height 0.15s linear 0.5s}.progress-range--scrubbing .progress-range__live-edge-capsule{transition:opacity 0.15s linear 0.5s;opacity:1}@media (hover: hover){input[type=range]:hover~.progress-range__preview-image{opacity:1}}.progress-range__preview-image{--calc-half-of-thumb-height:calc(.5 * var(--progress-thumb-height, 9px));--calc-half-of-track-height:calc(.5 * var(--progress-track-height, 3px));--calc-bottom-position:calc(var(--range-padding-vertical) + var(--calc-half-of-track-height) - var(--calc-half-of-thumb-height));padding-bottom:calc(var(--progress-thumb-height, 9px) + 3px);width:16.6666666667%;min-width:100px;position:absolute;z-index:2;bottom:var(--calc-bottom-position);left:var(--preview-image-left, 50%);transform:translate(calc(-0.5 * var(--progress-thumb-height, 9px)), 0);transition:opacity 0.2s;opacity:0;pointer-events:none}.preview-image__time,.preview-image__thumbnail,.preview-image__thumbnail::after,.preview-image__thumbnail-img img{border-radius:12px}.preview-image__time img,.preview-image__thumbnail img,.preview-image__thumbnail::after img,.preview-image__thumbnail-img img img{width:100%}.preview-image__thumbnail{width:100%;position:relative;transform:translate(calc(var(--preview-image-offset, -50%) + 0.5 * var(--progress-thumb-height, 9px)), 0);background-color:#323232}.preview-image__thumbnail::after{content:"";width:100%;height:100%;display:block;position:absolute;top:0;left:0;box-shadow:inset 0 0 0 1px rgba(255, 255, 255, 0.12)}.preview-image__thumbnail--loading{background-color:transparent}.preview-image__thumbnail--loading::after{box-shadow:none}.preview-image__thumbnail-img{width:100%;height:auto;min-height:20px}.preview-image__thumbnail-img img{width:100%;display:block}.preview-image__time{font-size:11px;line-height:1.2727272727;font-weight:600;letter-spacing:0em;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif;padding:3px;width:100%;height:100%;display:flex;box-sizing:border-box;flex-direction:row;align-items:flex-end;justify-content:center;position:absolute;bottom:0;left:0;color:rgba(255, 255, 255, 0.85);text-align:center;background-image:radial-gradient(circle at 50% 100%, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.3) 30%, rgba(0, 0, 0, 0.15) 40%, rgba(0, 0, 0, 0) 50%, rgba(0, 0, 0, 0) 100%)}.preview-image__time:lang(bn){line-height:1.9091009091;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Bengali", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.preview-image__time:lang(gu){line-height:1.9091009091;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Gujarati", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.preview-image__time:lang(hi){line-height:1.9091009091;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Devanagari", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.preview-image__time:lang(kn){line-height:1.9091009091;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Kannada", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.preview-image__time:lang(ml){line-height:1.9091009091;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Malayalam", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.preview-image__time:lang(mr){line-height:1.9091009091;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Devanagari", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.preview-image__time:lang(or){line-height:1.9091009091;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Odia", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.preview-image__time:lang(pa){line-height:1.9091009091;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Gurmukhi", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.preview-image__time:lang(ta){line-height:1.9091009091;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Tamil", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.preview-image__time:lang(te){line-height:1.9091009091;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Kohinoor Telugu", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.preview-image__time:lang(ur){line-height:1.9091009091;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Geeza Pro", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.preview-image__time:lang(th){line-height:1.5082018182;font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Thonburi Pro", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.preview-image__time:lang(ar){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Arabic UI Text", "SF Pro Icons", "Segoe UI", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.preview-image__time:lang(he){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Arial Hebrew", "SF Pro Icons", "Segoe UI", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.preview-image__time:lang(ja){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Hiragino Sans", "SF Pro Icons", "Hiragino Kaku Gothic Pro", "ヒラギノ角ゴ Pro W3", "メイリオ", "Meiryo", "ＭＳ Ｐゴシック", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.preview-image__time:lang(ko){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "Apple SD Gothic Neo", "SF Pro Icons", "Apple Gothic", "HY Gulim", "MalgunGothic", "HY Dotum", "Lexi Gulim", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.preview-image__time:lang(zh-CN){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang SC", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.preview-image__time:lang(zh-HK){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang HK", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.preview-image__time:lang(zh-MO){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang HK", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.preview-image__time:lang(zh-TW){font-family:-apple-system, BlinkMacSystemFont, "Apple Color Emoji", "SF Pro", "PingFang TC", "SF Pro Icons", "Helvetica Neue", "Helvetica", "Arial", sans-serif}.preview-image__fake-scrub-thumb{width:var(--progress-thumb-width, var(--progress-thumb-height, 9px));height:var(--progress-thumb-height, 9px);position:absolute;bottom:0;left:0;transform:scale(var(--progress-thumb-multiplier-active, 1));border:var(--progress-thumb-border-width, 0) solid var(--progress-thumb-color-outline, transparent);border-radius:var(--progress-thumb-border-radius, 50%);background-color:var(--progress-thumb-color, white);background-position:center;outline:1px solid var(--progress-thumb-outline-active, transparent);transition:transform 0.1s ease-in-out, opacity 0.1s ease-in, background-color 0.1s ease-in;cursor:pointer}</style>
      `;
    }

    const inputEl = shadow.querySelector(
      "#playback-progress",
    ) as HTMLInputElement;
    nodesRef.current = {
      elapsed: shadow.querySelector(".time.elapsed") as HTMLTimeElement,
      remaining: shadow.querySelector(".time.remaining") as HTMLTimeElement,
      input: inputEl,
      liveEdgeElements: [
        shadow.querySelector(".progress-range__live-edge"),
        shadow.querySelector(".progress-range__live-edge-indicator"),
        shadow.querySelector(".progress-range__live-edge-capsule"),
      ].filter(Boolean) as HTMLElement[],
    };

    const updateProgress = (
      elapsedSeconds: number,
      durationSeconds: number,
    ) => {
      const duration =
        Number.isFinite(durationSeconds) && durationSeconds > 0
          ? durationSeconds
          : 0;
      const elapsed = Math.min(
        Math.max(Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0, 0),
        duration || 0,
      );
      const remainingTime = Math.max(duration - elapsed, 0);
      const progressPercent = duration > 0 ? (elapsed / duration) * 100 : 0;
      const {
        elapsed: elapsedElement,
        remaining,
        input,
        liveEdgeElements,
      } = nodesRef.current;

      if (elapsedElement) {
        elapsedElement.textContent = formatTime(elapsed);
        elapsedElement.dateTime = `PT${Math.floor(elapsed)}S`;
        elapsedElement.setAttribute(
          "aria-label",
          `Elapsed ${formatAriaText(elapsed)}`,
        );
      }
      if (remaining) {
        remaining.textContent = `-${formatTime(remainingTime)}`;
        remaining.dateTime = `PT${Math.floor(remainingTime)}S`;
        remaining.setAttribute(
          "aria-label",
          `Remaining ${formatAriaText(remainingTime)}`,
        );
      }
      if (input) {
        input.disabled = duration <= 0;
        input.max = String(duration);
        input.value = String(elapsed);
        input.setAttribute("aria-valuemax", String(duration));
        input.setAttribute("aria-valuenow", String(elapsed));
        input.setAttribute("aria-valuetext", formatAriaText(elapsed));
        input.style.setProperty("--progress", `${progressPercent}%`);
        input.style.setProperty("--width", `${progressPercent}%`);
      }
      liveEdgeElements?.forEach((element) => {
        element.style.setProperty("--liveProgress", `${progressPercent}%`);
        element.style.setProperty("--live-edge-visibility", "hidden");
      });
    };

    const syncFromAudio = () => {
      const audio = audioRef.current;
      if (!audio || isScrubbingRef.current) return;
      updateProgress(audio.currentTime, audio.duration);
    };

    const handleInput = (e: Event) => {
      isScrubbingRef.current = true;
      const audio = audioRef.current;
      const currentValue = Number.parseFloat(
        (e.target as HTMLInputElement).value,
      );
      updateProgress(currentValue, audio?.duration ?? 0);
    };

    const handleChange = (e: Event) => {
      const audio = audioRef.current;
      const nextTime = Number.parseFloat((e.target as HTMLInputElement).value);
      if (audio && Number.isFinite(nextTime)) {
        audio.currentTime = Math.min(
          Math.max(nextTime, 0),
          Number.isFinite(audio.duration) ? audio.duration : nextTime,
        );
      }
      isScrubbingRef.current = false;
      syncFromAudio();
    };

    inputEl?.addEventListener("input", handleInput);
    inputEl?.addEventListener("change", handleChange);
    const audio = audioRef.current;
    audio?.addEventListener("timeupdate", syncFromAudio);
    audio?.addEventListener("loadedmetadata", syncFromAudio);
    audio?.addEventListener("durationchange", syncFromAudio);
    audio?.addEventListener("emptied", syncFromAudio);
    syncFromAudio();

    return () => {
      inputEl?.removeEventListener("input", handleInput);
      inputEl?.removeEventListener("change", handleChange);
      audio?.removeEventListener("timeupdate", syncFromAudio);
      audio?.removeEventListener("loadedmetadata", syncFromAudio);
      audio?.removeEventListener("durationchange", syncFromAudio);
      audio?.removeEventListener("emptied", syncFromAudio);
    };
  }, [audioRef]);

  const AmpProgressTag = "amp-playback-controls-progress" as React.ElementType;

  return (
    <AmpProgressTag
      ref={containerRef}
      className="[--progress-bar-grid-template-areas:'elapsed_._remaining'_'scrubber_scrubber_scrubber'] [--progress-track-color-elapsed:var(--systemPrimary)] [--progress-track-color-elapsed-active:var(--systemPrimary)] [--progress-track-color:var(--systemQuaternary)] [--thumb-opacity:0] mb-0"
      hydrated=""
      style={
        !isProgressExpanded
          ? {
              "--progress-thumb-width": "0px",
              "--progress-bar-grid-template-rows": "0 2px",
              "--progress-bar-grid-row-gap": "0",
              "--progress-track-height": "2px",
              "--progress-thumb-color": "transparent",
              "--progress-time": "transparent",
              margin: "2px 0 0",
            }
          : {
              "--progress-thumb-width": "0px",
              "--progress-track-height": "7px",
              "--progress-bar-grid-template-rows": "auto 7px",
              "--progress-time": "var(--systemPrimary)",
              bottom: "-2px",
              position: "absolute",
              width: "100%",
            }
      }
    />
  );
}
