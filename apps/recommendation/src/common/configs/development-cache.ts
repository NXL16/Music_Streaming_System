/**
 * Development-only Home freshness switch. Keep this aligned with the Web
 * value injected by `tools/scripts/dev.mjs` from the root `.env.development`.
 */
export function developmentCacheDisabled(): boolean {
  return process.env.DEV_CACHE_MODE?.trim().toLowerCase() === 'off';
}
