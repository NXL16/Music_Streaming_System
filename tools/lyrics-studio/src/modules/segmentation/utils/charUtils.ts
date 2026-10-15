import { CharType } from "../types";

export const RE_WHITESPACE = /[\s\n\t]/;
export const RE_LATIN =
	/[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{M}']/u;
export const RE_NUMERIC = /[0-9]/;

/**
 * Determine type of single character
 */
export function getCharType(c: string): CharType {
	if (!c || c.trim() === "") {
		return CharType.Whitespace;
	}
	const code = c.charCodeAt(0);

	if (RE_WHITESPACE.test(c)) return CharType.Whitespace;
	if (RE_LATIN.test(c)) return CharType.Latin;
	if (RE_NUMERIC.test(c)) return CharType.Numeric;

	if (
		(code >= 0x4e00 && code <= 0x9fff) || // CJK
		(code >= 0x3040 && code <= 0x309f) || // Japanese Hiragana
		(code >= 0x30a0 && code <= 0x30ff) || // Japanese Katakana
		(code >= 0xac00 && code <= 0xd7af) // Korean
	) {
		return CharType.Cjk;
	}
	// Punctuation and emoji, etc.
	return CharType.Other;
}

/**
 * Punctuation binding direction
 */
export enum MergeDirection {
	Left,
	Right,
}

/**
 * Left punctuation: usually does not bind with preceding word
 */
export const PUNCT_LEFT = new Set([
	"(",
	"[",
	"{",
	"<",
	"「",
	"『",
	"（",
	"【",
	"《",
	"〈",
	"〔",
	"｢",
	"“",
	"‘",
	"«",
	"‹",
	"¿",
	"¡",
]);

/**
 * Right punctuation: usually does not bind with following word
 */
export const PUNCT_RIGHT = new Set([
	")",
	"]",
	"}",
	">",
	"」",
	"』",
	"）",
	"】",
	"》",
	"〉",
	"〕",
	"｣",
	"”",
	"’",
	"»",
	"›",
]);

/**
 * Ambiguous quotes (requires special handling during segmentation)
 */
export const PUNCT_AMBIGUOUS_QUOTES = new Set(['"']);

/**
 * Other punctuation (period, comma, hyphen, etc.)
 */
export const PUNCT_EXTRA = new Set([
	",",
	"，",
	"。",
	"．",
	".",
	"?",
	"!",
	"！",
	"？",
	"、",
	"；",
	";",
	":",
	"：",
	"'",
	"’",
	"〜",
	"～",
	"-",
	"—",
	"…",
	"⋯",
	"·",
	"♪",
]);

export const ALL_PUNCTUATION = new Set([
	...PUNCT_LEFT,
	...PUNCT_RIGHT,
	...PUNCT_AMBIGUOUS_QUOTES,
	...PUNCT_EXTRA,
]);

/**
 * Determine which direction punctuation should merge into
 */
export function getMergeDirection(text: string): MergeDirection {
	const firstChar = text.trim().charAt(0);

	if (PUNCT_LEFT.has(firstChar)) {
		return MergeDirection.Right;
	}

	// Period, comma, right parenthesis and all other punctuation merge left
	return MergeDirection.Left;
}

/**
 * Escape regex special characters
 * Prevent special symbols in strings from breaking regex
 */
export function escapeRegExp(string: string): string {
	return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
