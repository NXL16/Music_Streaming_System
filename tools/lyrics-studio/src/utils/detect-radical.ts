/**
 * Checks whether text contains CJK radical characters.
 * Supported character ranges:
 * - U+2E80 - U+2EFF: CJK Radicals Supplement
 * - U+2F00 - U+2FDF: Kangxi Radicals
 * - U+31C0 - U+31EF: CJK Strokes
 *
 * @param text Text to inspect.
 * @returns Whether the text contains a radical character.
 */
const RADICAL_CHAR_REGEXP = /[\u2e80-\u2eff\u2f00-\u2fdf\u31c0-\u31ef]/u;

export function containsRadicalChar(text: string): boolean {
	return RADICAL_CHAR_REGEXP.test(text);
}
