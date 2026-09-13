import type { HighPlaybackManifest, PlaybackManifest } from "./types";

export function shouldPreferHighQuality(): boolean {
  if (typeof navigator === "undefined") return true;

  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (!connection) return true;

  return (
    !connection.saveData &&
    !["slow-2g", "2g", "3g"].includes(connection.effectiveType ?? "")
  );
}

export function selectInitialRendition(
  manifest: PlaybackManifest,
  high: HighPlaybackManifest | null,
): PlaybackManifest {
  if (!high || high.mode !== manifest.mode) return manifest;
  if (manifest.mode === "STANDARD" && high.mode === "STANDARD") {
    return { ...manifest, main: high.high };
  }
  if (manifest.mode === "SING" && high.mode === "SING") {
    return {
      ...manifest,
      instrumental: high.high.instrumental,
      vocal: high.high.vocal,
    };
  }
  return manifest;
}
