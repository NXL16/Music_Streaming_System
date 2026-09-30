export type AudioFeatures = {
  bpm?: number;
  energy?: number;
  tags: string[];
};

function normalizeAudioTag(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Reads the optional upload-time AI analysis from a catalog snapshot. */
export function audioFeaturesFromAttributes(value: unknown): AudioFeatures {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { tags: [] };
  }
  const attributes = value as Record<string, unknown>;
  const bpm = attributes.audioBpm;
  const energy = attributes.audioEnergy;
  const rawTags = attributes.audioTags;
  return {
    bpm:
      typeof bpm === 'number' && Number.isFinite(bpm) && bpm > 0
        ? bpm
        : undefined,
    energy:
      typeof energy === 'number' &&
      Number.isFinite(energy) &&
      energy >= 0 &&
      energy <= 1
        ? energy
        : undefined,
    tags: Array.isArray(rawTags)
      ? rawTags
          .filter((tag): tag is string => typeof tag === 'string')
          .map(normalizeAudioTag)
          .filter(Boolean)
      : [],
  };
}
