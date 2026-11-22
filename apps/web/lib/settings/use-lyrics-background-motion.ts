"use client";

import { createBooleanPreference } from "./boolean-preference";

const MOBILE_QUERY = "(max-width: 739px)";
const preference = createBooleanPreference(
  "lyrics-background-motion:v1",
  () => !window.matchMedia(MOBILE_QUERY).matches,
  MOBILE_QUERY,
);

export function useLyricsBackgroundMotion() {
  return {
    lyricsBackgroundMotionEnabled: preference.useEnabled(),
    setLyricsBackgroundMotionEnabled: preference.setEnabled,
  };
}
