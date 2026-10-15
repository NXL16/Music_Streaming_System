/**
 * @description Hyphenation loader that loads language patterns on demand.
 */

import { segmentationLogger } from "../logger";
import type { HyphenatorFunc } from "../types";

/**
 * @description Supported hyphenation languages.
 * @property label Display language name.
 * @property value Language code passed to the loader and mapped to a hyphen package.
 */
export const SUPPORTED_LANGUAGES = [
	{ label: "English (US)", value: "en-us" },
	{ label: "Deutsch (German)", value: "de" },
	{ label: "Français (French)", value: "fr" },
	{ label: "Español (Spanish)", value: "es" },
	{ label: "Bahasa Indonesia (Indonesian)", value: "id" },
	{ label: "Italiano (Italian)", value: "it" },
	{ label: "Português (Portuguese)", value: "pt" },
	{ label: "Pусский (Russian)", value: "ru" },
];

/**
 * @description Hyphenation-function cache.
 */
const hyphenatorCache: Record<string, HyphenatorFunc> = {};

/**
 * @description Loads the hyphenation function for a language.
 * @param lang Language code (for example, `en-us` or `de`) from `SUPPORTED_LANGUAGES`.
 * @returns {Promise<HyphenatorFunc | null>}
 * Resolves to a language-specific hyphenation function, or null if unsupported or unavailable.
 */
export async function loadHyphenator(
	lang: string,
): Promise<HyphenatorFunc | null> {
	if (hyphenatorCache[lang]) {
		return hyphenatorCache[lang];
	}

	try {
		let module: { hyphenateSync: HyphenatorFunc };
		switch (lang) {
			case "en-us":
				module = await import("hyphen/en-us");
				break;
			case "de":
				module = await import("hyphen/de");
				break;
			case "fr":
				module = await import("hyphen/fr");
				break;
			case "es":
				module = await import("hyphen/es");
				break;
			case "id":
				module = await import("hyphen/id");
				break;
			case "it":
				module = await import("hyphen/it");
				break;
			case "pt":
				module = await import("hyphen/pt");
				break;
			case "ru":
				module = await import("hyphen/ru");
				break;
			default:
				throw new Error(`Unsupported language: ${lang}`);
		}

		const func = module.hyphenateSync;
		if (typeof func === "function") {
			hyphenatorCache[lang] = func;
			return func;
		}
		return null;
	} catch (error) {
		segmentationLogger.error(`Failed to load the hyphenation engine for ${lang}:`, error);
		return null;
	}
}
