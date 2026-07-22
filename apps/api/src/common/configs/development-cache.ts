/** Development-only switch supplied by the root development launcher. */
export function developmentCacheDisabled(): boolean {
  return process.env.DEV_CACHE_MODE?.trim().toLowerCase() === 'off';
}
