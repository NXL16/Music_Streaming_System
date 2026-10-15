/**
 * @fileoverview Core algorithm for intelligently distributing line-wide Romaji to individual lyric words
 * Special thanks to Xionghaizi001 for algorithm implementation
 */

import type { LyricWord } from "$/types/ttml";
import {
	getDictionaryRomaji,
	isChoonpu,
	isKanaOnly,
	isPunctuationOnly,
	isSokuon,
	ROMAJI_VOWELS,
	shouldApplyDictionaryFallback,
} from "./TransliterationUtils";
import { type TokenBuffer, tokenizeRomanLyric } from "./tokenizer";

class RomanDistributor {
	private words: LyricWord[];
	private buffer: TokenBuffer;
	private results: string[];

	// Pending word buffer
	// Store "unknown words" (Kanji, sokuon, unmatched kana, etc.) without romanization
	// Distribute accumulated tokens to these words when next anchor is found
	private pendingWords: { index: number; word: LyricWord }[] = [];

	constructor(words: LyricWord[], romanLyric: string) {
		this.words = words;
		this.buffer = tokenizeRomanLyric(romanLyric);
		this.results = new Array(words.length).fill("");
	}

	public predict(): string[] {
		if (this.buffer.remaining === 0) {
			return this.getFallbackResults();
		}

		for (let i = 0; i < this.words.length; i++) {
			const word = this.words[i];

			if (this.shouldSkipWord(word, i)) {
				continue;
			}

			// If current word is punctuation and Token is punctuation, consume directly; else treat as mismatch
			// User may have omitted punctuation or attached punctuation to previous word, fill empty string
			if (this.tryConsumePunctuation(word, i)) {
				continue;
			}

			// Attempt to use current word as an anchor to lock Token stream position
			if (this.tryMatchAnchor(word, i)) {
				continue;
			}

			// Cannot determine current word pronunciation, buffer it until next anchor or EOL
			this.pendingWords.push({ index: i, word });
		}

		// Distribute all remaining tokens to all remaining words
		this.flushPendingBuffer(this.buffer.consume(this.buffer.remaining));

		return this.results;
	}

	private getFallbackResults(): string[] {
		return this.words.map((w) => {
			if (shouldApplyDictionaryFallback(w.word)) {
				return getDictionaryRomaji(w.word);
			}
			return "";
		});
	}

	private shouldSkipWord(word: LyricWord, index: number): boolean {
		const text = word.word.trim();
		if (!text) {
			this.results[index] = "";
			return true;
		}
		return false;
	}

	private tryConsumePunctuation(word: LyricWord, index: number): boolean {
		if (isPunctuationOnly(word.word)) {
			const currentToken = this.buffer.peek(0);
			if (currentToken && isPunctuationOnly(currentToken)) {
				this.results[index] = this.buffer.consume(1)[0];
			} else {
				this.results[index] = "";
			}
			return true;
		}
		return false;
	}

	private tryMatchAnchor(word: LyricWord, index: number): boolean {
		const text = word.word.trim();

		// Determine which words are suitable alignment anchors.
		// 1. Must be pure Kana
		// 2. Cannot be sokuon (っ) - sokuon attaches to subsequent consonant, unstable
		// 3. Cannot be chōonpu (ー) - long vowel sound depends on preceding vowel, high uncertainty
		if (!isKanaOnly(text) || isSokuon(text) || isChoonpu(text)) {
			return false;
		}

		const expectedCandidates = getExpectedRomaji(text);
		// Prevent excessive span leading to false match
		const searchLimit = Math.min(this.buffer.remaining, 15);

		for (let offset = 0; offset < searchLimit; offset++) {
			const token = this.buffer.peek(offset);
			if (!token) continue;

			// Whether Token looks like anchor
			const matchResult = evaluateMatch(token, expectedCandidates);
			if (!matchResult) continue;

			// If free tokens before anchor < total weight needed by words in buffer, match was found too early
			// E.g., Buffer="Blank"(weight 3), Token stream="ku, u, ha, ku..."
			// If matching "ha", only 2 tokens before it (insufficient for "Blank"), so skip "ha" and look for "wa"
			// Note: this logic relies on user empty beat settings; without empty beats Kanji weight cannot be judged
			const availableTokens = offset + (matchResult.type === "Suffix" ? 1 : 0);
			const requiredTokens = this.getPendingBufferWeight();

			if (availableTokens < requiredTokens) {
				continue;
			}

			// Prevent false match: if current matches, check if next word also matches
			if (!this.checkLookahead(index, matchResult.type, offset)) {
				continue;
			}

			this.applyAnchorMatch(index, offset, matchResult, token);
			return true;
		}

		return false;
	}

	/**
	 * Lookahead verification to prevent false match
	 */
	private checkLookahead(
		currentIndex: number,
		matchType: MatchResult["type"],
		offset: number,
	): boolean {
		// If prefix match (e.g. "suki" -> "su"), logical Next Token is still in current physical Token
		// Lookahead here is complex; simplified handling passes directly
		if (matchType === "Prefix") return true;

		if (currentIndex + 1 >= this.words.length) return true;

		const nextWord = this.words[currentIndex + 1];
		const nextWordText = nextWord.word.trim();

		// Reliable anchor
		if (
			isKanaOnly(nextWordText) &&
			!isSokuon(nextWordText) &&
			!isPunctuationOnly(nextWordText) &&
			!isChoonpu(nextWordText)
		) {
			const nextExpected = getExpectedRomaji(nextWordText);
			const nextToken = this.buffer.peek(offset + 1);

			if (nextToken) {
				// If next token does not match next anchor at all, current match may be misaligned
				if (!evaluateMatch(nextToken, nextExpected)) {
					return false;
				}
			}
		}
		return true;
	}

	/**
	 * Distribute preceding tokens and set current anchor
	 */
	private applyAnchorMatch(
		index: number,
		offset: number,
		matchResult: MatchResult,
		originalToken: string,
	): void {
		// Consume all tokens before anchor and pass to PendingBuffer
		const bufferTokens = this.buffer.consume(offset);

		if (matchResult.type === "Suffix") {
			// Suffix match
			// E.g., Token="tte", Expected="te" -> Buffer takes "t", Anchor takes "te"
			// Split token: first half goes to Buffer, second half goes to Anchor
			const splitIndex = originalToken.lastIndexOf(matchResult.expected);
			const prefixPart = originalToken.slice(0, splitIndex);

			bufferTokens.push(prefixPart);
			this.flushPendingBuffer(bufferTokens);

			this.results[index] = matchResult.expected;
			// Consume split token
			this.buffer.consume(1);
		} else {
			// Exact match or prefix match
			this.flushPendingBuffer(bufferTokens);

			if (matchResult.type === "Exact") {
				// Exact match, consume directly
				this.results[index] = this.buffer.consume(1)[0];
			} else {
				// Prefix match
				// E.g., Token="suki", Expected="su" -> Anchor takes "su", remaining "ki" left for later
				this.results[index] = matchResult.expected;
				const remainder = originalToken.slice(matchResult.expected.length);
				// Modify Token array in place, return remaining part to original position
				this.buffer.replaceCurrent(remainder);
			}
		}
	}

	/**
	 * Compute total weight (token count demand) for all words in PendingBuffer
	 *
	 * Default weight per word is 1; weight increases if user configured emptyBeat
	 */
	private getPendingBufferWeight(): number {
		return this.pendingWords.reduce((sum, item) => {
			const extra = item.word.emptyBeat || 0;
			return sum + 1 + extra;
		}, 0);
	}

	/**
	 * Distribute collected tokens to pendingWords
	 */
	private flushPendingBuffer(tokens: string[]): void {
		if (this.pendingWords.length === 0) return;

		const wordCount = this.pendingWords.length;
		const tokenCount = tokens.length;

		if (tokenCount === 0) {
			this.pendingWords.forEach((item) => {
				this.results[item.index] = "";
			});
			this.pendingWords = [];
			return;
		}

		const weights = this.pendingWords.map((item) => {
			const extra = item.word.emptyBeat || 0;
			return 1 + extra;
		});

		const totalWeight = weights.reduce((a, b) => a + b, 0);

		let currentTokenIndex = 0;
		let accumulatedWeight = 0;

		for (let i = 0; i < wordCount; i++) {
			const weight = weights[i];
			accumulatedWeight += weight;

			// Distribute tokens based on weight ratio
			// (Current accumulated weight / Total weight) * Total token count
			const targetEndIndex =
				totalWeight > 0
					? Math.round((accumulatedWeight / totalWeight) * tokenCount)
					: Math.round(((i + 1) / wordCount) * tokenCount); // Fallback: equal split

			const safeEndIndex = Math.min(targetEndIndex, tokenCount);
			const takeCount = safeEndIndex - currentTokenIndex;

			if (takeCount > 0) {
				const chunk = tokens.slice(
					currentTokenIndex,
					currentTokenIndex + takeCount,
				);
				this.results[this.pendingWords[i].index] = chunk.join(" ");
				currentTokenIndex += takeCount;
			} else {
				this.results[this.pendingWords[i].index] = "";
			}
		}

		this.pendingWords = [];
	}
}

/**
 * Get expected Romaji list for word to handle polyphonic Japanese particles
 *
 * wanakana converts "は" to "ha", but lyrics often write "wa",
 * We need to allow anchor to match any valid pronunciation
 */
function getExpectedRomaji(text: string): string[] {
	const standard = getDictionaryRomaji(text);
	const results = new Set([standard]);

	if (text === "は") results.add("wa");
	if (text === "へ") results.add("e");
	if (text === "を") results.add("o");

	return Array.from(results);
}

/**
 * Match check result interface
 */
interface MatchResult {
	/**
	 * Matched type
	 */
	type: "Exact" | "Prefix" | "Suffix";
	/**
	 * Actually matched expected value, e.g. matched "wa" instead of "ha"
	 */
	expected: string;
}

/**
 * Check if Token matches candidate list
 */
function evaluateMatch(
	token: string,
	expectedCandidates: string[],
): MatchResult | null {
	const lowerToken = token.toLowerCase();

	for (const expected of expectedCandidates) {
		if (lowerToken === expected) return { type: "Exact", expected };

		if (lowerToken.startsWith(expected) && lowerToken.length > expected.length)
			return { type: "Prefix", expected };

		// Suffix match
		// Used for sokuon sequences, e.g. Token="tte" matches anchor "te".
		if (lowerToken.endsWith(expected) && lowerToken.length > expected.length) {
			const prefix = lowerToken.slice(0, lowerToken.length - expected.length);
			const firstCharOfExpected = expected[0];
			const lastCharOfPrefix = prefix[prefix.length - 1];

			// Suffix match allowed only when split point is valid
			// If anchor starts with vowel (e.g. "i"), prefix cannot end with non-n consonant (e.g. "g")
			// Prevent invalid split of "gi" -> "g"(Buffer) + "i"(Anchor)
			if (ROMAJI_VOWELS.has(firstCharOfExpected)) {
				const isPrefixConsonant =
					!ROMAJI_VOWELS.has(lastCharOfPrefix) && lastCharOfPrefix !== "n";

				if (isPrefixConsonant) {
					continue;
				}
			}
			return { type: "Suffix", expected };
		}
	}
	return null;
}

/**
 * Line-wide prediction algorithm based on anchor alignment
 * @param words Current line word list
 * @param romanLyric Line-wide romanization string
 */
export function predictLineRomanization(
	words: LyricWord[],
	romanLyric: string,
): string[] {
	const distributor = new RomanDistributor(words, romanLyric);
	return distributor.predict();
}
