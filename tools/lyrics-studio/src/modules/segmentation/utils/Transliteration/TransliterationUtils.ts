import * as wanakana from "wanakana";
import { ALL_PUNCTUATION } from "../charUtils";

/**
 * Romaji vowels.
 */
export const ROMAJI_VOWELS = new Set(["a", "e", "i", "o", "u"]);

/**
 * Sokuon characters.
 */
export const SOKUON_CHARS = new Set(["っ", "ッ"]);

/**
 * Checks whether a character is punctuation.
 */
export function isPunctuationChar(char: string): boolean {
	return ALL_PUNCTUATION.has(char);
}

/**
 * Checks whether text consists only of punctuation.
 */
export function isPunctuationOnly(text: string): boolean {
	if (!text) return false;
	for (const char of text) {
		if (!isPunctuationChar(char)) {
			return false;
		}
	}
	return true;
}

/**
 * Checks whether a character is sokuon.
 * During allocation, a sokuon consumes one leading romaji character (for example, "tto" → "っ").
 */
export function isSokuon(char: string): boolean {
	return SOKUON_CHARS.has(char);
}

/**
 * Checks whether Wanakana transliteration should be used.
 * It runs only for text containing kana; Han-only or Latin-only text is skipped.
 */
export function shouldApplyDictionaryFallback(text: string): boolean {
	if (!text) return false;
	const cleanText = text.replace(/[、，。！？\s]/g, "");
	return wanakana.isJapanese(cleanText);
}

/**
 * Gets romaji from the dictionary.
 */
export function getDictionaryRomaji(text: string): string {
	return wanakana.toRomaji(text, { upcaseKatakana: false });
}

/**
 * Checks whether a character is a long-vowel mark.
 */
export function isChoonpu(char: string): boolean {
	return char === "ー";
}

/**
 * Checks whether text contains only Japanese kana (hiragana or katakana).
 * Kana readings are stable, making them suitable alignment anchors.
 */
export function isKanaOnly(text: string): boolean {
	if (!text) return false;
	const cleanText = text.replace(/[、，。！？\s]/g, "");
	return wanakana.isKana(cleanText);
}
