"use client";

import { createBooleanPreference } from "./boolean-preference";

const MOBILE_QUERY = "(max-width: 739px)";
const preference = createBooleanPreference(
  "video-artwork:v1",
  () => !window.matchMedia(MOBILE_QUERY).matches,
  MOBILE_QUERY,
);

export function useVideoArtwork() {
  return {
    videoArtworkEnabled: preference.useEnabled(),
    setVideoArtworkEnabled: preference.setEnabled,
  };
}
