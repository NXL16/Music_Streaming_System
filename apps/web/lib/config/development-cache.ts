/**
 * Set by the root development launcher from `DEV_CACHE_MODE`.
 * This value is intentionally public: it contains no secret configuration.
 */
export const developmentCacheDisabled =
  process.env.NEXT_PUBLIC_DEV_CACHE_MODE?.trim().toLowerCase() === "off";
