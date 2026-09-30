export const CHILL_AUDIO_TERMS = [
  'chill',
  'relax',
  'acoustic',
  'romantic',
  'melancholic',
  'piano',
] as const;

/** Accepts song-level READY analysis and album-level aggregate coverage. */
export function hasAudioAnalysis(attributes: unknown): boolean {
  if (
    !attributes ||
    typeof attributes !== 'object' ||
    Array.isArray(attributes)
  )
    return false;
  const value = attributes as Record<string, unknown>;
  if (value.audioAnalysisStatus === 'READY') return true;
  return (
    typeof value.audioAnalysisCoverage === 'number' &&
    value.audioAnalysisCoverage > 0
  );
}

/** Uses one sound intent for every Chill surface. */
export function chillIntentScore(input: {
  tags: readonly string[];
  energy?: number;
}): number {
  const hasChillTag = input.tags.some((tag) => {
    const normalized = tag.trim().toLowerCase();
    return CHILL_AUDIO_TERMS.some((term) => normalized.includes(term));
  });

  return Math.max(
    hasChillTag ? 1 : 0,
    input.energy === undefined ? 0 : Math.max(0, 1 - input.energy),
  );
}
