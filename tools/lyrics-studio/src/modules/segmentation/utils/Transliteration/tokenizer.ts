/**
 * @fileoverview Romaji tokenization engine.
 * Splits romaji strings into consumable token queues.
 */

import { ROMAJI_VOWELS } from "./TransliterationUtils";

export class TokenBuffer {
	private tokens: string[];
	private cursor: number = 0;

	constructor(tokens: string[]) {
		this.tokens = tokens;
	}

	/**
	 * Number of unprocessed tokens.
	 */
	get remaining(): number {
		return Math.max(0, this.tokens.length - this.cursor);
	}

	/**
	 * Peeks ahead without moving the cursor.
	 */
	peek(offset: number = 0): string | undefined {
		return this.tokens[this.cursor + offset];
	}

	/**
	 * Consumes tokens and advances the cursor.
	 * @returns Consumed tokens.
	 */
	consume(count: number): string[] {
		if (count <= 0) return [];
		const chunk = this.tokens.slice(this.cursor, this.cursor + count);
		this.cursor += count;
		return chunk;
	}

	/**
	 * Replaces the token at the current cursor in place.
 * Used when splitting a prefix: consume "su" and retain "ki".
	 */
	replaceCurrent(newValue: string): void {
		if (this.cursor < this.tokens.length) {
			this.tokens[this.cursor] = newValue;
		}
	}
}

/**
 * Attempts to split a concatenated romaji token.
 * For example, a user enters "bokura" for lyric words ["ぼ", "く", "ら"].
 * It uses a simple consonant-plus-vowel split.
 */
export function autoSplitRomajiChunk(token: string): string[] | null {
	const stripped = token.trim();
	// Do not split non-letter tokens.
	if (!/^[a-zA-Z]+$/.test(stripped)) {
		return null;
	}

	// Count vowels.
	let vowelCount = 0;
	const lower = stripped.toLowerCase();
	for (const char of lower) {
		if (ROMAJI_VOWELS.has(char)) vowelCount++;
	}

	// Try any token with a vowel, including single-syllable forms such as ka or sshi.
	// The final length check filters tokens that do not need splitting.
	if (vowelCount < 1) return null;

	const segments: string[] = [];
	let idx = 0;
	const len = stripped.length;

	while (idx < len) {
		const start = idx;
		const currentChar = lower[idx];
		const nextChar = idx + 1 < len ? lower[idx + 1] : "";

		// Handle sokuon/doubled consonants: sshi → s, shi; matte → ma, t, te.
		const isConsonant = !ROMAJI_VOWELS.has(currentChar);
		if (isConsonant && currentChar === nextChar) {
			// Split the first consonant into its own token to represent sokuon.
			segments.push(stripped.slice(start, idx + 1));
			idx++;
			// Continue from the second consonant.
			continue;
		}

		// Handle moraic n: no following vowel or a following consonant other than y.
		if (currentChar === "n") {
			const nextNext = idx + 2 < len ? lower[idx + 2] : "";

			// Check whether the moraic-n condition is met.
			const isNextVowel = ROMAJI_VOWELS.has(nextChar);
			const isNextYaYuYo = nextChar === "y" && ROMAJI_VOWELS.has(nextNext);

			if (!isNextVowel && !isNextYaYuYo) {
				segments.push(stripped.slice(start, idx + 1));
				idx++;
				continue;
			}
		}

		// Consume consonants until a vowel is found.
		while (idx < len && !ROMAJI_VOWELS.has(lower[idx])) {
			idx++;
		}

		// Include the vowel when one was found.
		if (idx < len) {
			idx++;
		}

		segments.push(stripped.slice(start, idx));
	}

	// Return null when splitting failed or produced no finer result (for example, "ka" → ["ka"]).
	if (segments.length <= 1) return null;

	return segments;
}

/**
 * Main tokenization entry point.
 * @param text Complete romaji text.
 * @param aggressiveSplit Whether to split concatenated tokens (for example, "suki" → "su", "ki").
 */
export function tokenizeRomanLyric(
	text: string,
	aggressiveSplit = true,
): TokenBuffer {
	if (!text) return new TokenBuffer([]);

	const rawTokens = text
		.trim()
		.split(/[\s\t]+/)
		.filter((t) => t);

	const refinedTokens: string[] = [];
	for (const raw of rawTokens) {
		// Handles suki → su, ki.
		if (aggressiveSplit) {
			const splits = autoSplitRomajiChunk(raw);
			if (splits) {
				refinedTokens.push(...splits);
			} else {
				// Keep tokens that cannot be split as romaji (for example, "da」").
				refinedTokens.push(raw);
			}
		} else {
			refinedTokens.push(raw);
		}
	}

	return new TokenBuffer(refinedTokens);
}
