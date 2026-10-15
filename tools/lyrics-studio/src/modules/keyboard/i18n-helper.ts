import type { I18nKey } from "./types";

/**
 * Used only to assist i18next-parser with key extraction
 *
 * At runtime it returns the string unchanged
 */
export const t = (key: I18nKey) => key;
