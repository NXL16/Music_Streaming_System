/**
 * @description Apple Music-like CJK merging algorithm
 */

import { uid } from "uid";
import { type LyricLine, type LyricWord, newLyricWord } from "$/types/ttml";

export const SyllableSmoothThreshold = {
	LOW: 5,
	/** Estimated merging threshold used by Apple Music */
	MEDIUM: 15,
	HIGH: 30,
} as const;

export type SyllableSmoothThreshold =
	(typeof SyllableSmoothThreshold)[keyof typeof SyllableSmoothThreshold];

export interface SyllableSmoothingOptions {
	/**
	 * Variation parameter threshold
	 *
	 * Satisfies smoothing condition when inter-syllable variation parameter < threshold
	 * @defaultValue 15
	 */
	threshold?: SyllableSmoothThreshold | (number & {});
	/**
	 * Whether to merge syllable text
	 *
	 * Produces Apple Music-like lyrics with merged CJK text, not recommended for daily use
	 * - true: Merge syllables into one after timestamp smoothing
	 * - false: Only smooth and reallocate timestamps, skip syllable merging
	 * @defaultValue false
	 */
	mergeSyllables?: boolean;
}

const CJK_FULL_REGEX =
	/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]+$/u;

function isSpaceSyllable(word: LyricWord): boolean {
	if (!word?.word) return false;
	return /^\s*$/.test(word.word);
}

/** Syllable duration */
function getDuration(word: LyricWord): number {
	return Math.max(0, (word.endTime ?? 0) - (word.startTime ?? 0));
}

/**
 * Character count participating in duration allocation
 *
 * Filter out spaces to ensure merged syllables with spaces reflect true CJK char count
 */
function getCharCount(word: LyricWord): number {
	const clean = (word.word || "").replace(/\s+/g, "");
	return Math.max(1, Array.from(clean).length);
}

/**
 * Blank gap duration between two adjacent entity syllables not covered by any syllable
 *
 * Space syllable occupied time is not counted as gap
 */
function getGapBetween(
	prev: LyricWord,
	next: LyricWord,
	spacers: LyricWord[],
): number {
	const covered = spacers.reduce((sum, w) => sum + getDuration(w), 0);
	return Math.max(0, (next.startTime ?? 0) - (prev.endTime ?? 0) - covered);
}

/**
 * Unified formula for variation parameter
 *
 * Result is independent of common scaling, allowing comparison of single word or total duration
 * @returns Variation parameter value (0 ~ 100)
 */
function calculateRateVariation(v1: number, v2: number): number {
	if (v1 + v2 === 0) {
		return 0;
	}
	return (Math.abs(v1 - v2) / (v1 + v2)) * 100;
}

/**
 * Check if string consists entirely of CJK characters
 */
function isAllCJK(text: string): boolean {
	if (!text || typeof text !== "string") return false;
	const nonSpace = text.replace(/\s+/g, "");
	return nonSpace.length > 0 && CJK_FULL_REGEX.test(nonSpace);
}

/**
 * Check if syllable with Ruby can be smoothed
 * - No Ruby: allow smoothing
 * - Single base syllable to single ruby syllable: allow smoothing
 * - Single base syllable to multiple ruby syllables: skip smoothing
 *
 * One-to-many syllables are filtered because merging would assign original Ruby to entire merged syllable,
 * causing semantic errors; many-to-many is even harder to handle so it is also filtered
 *
 * @param word Syllable to check
 */
function isRubyEligibleForSmoothing(word: LyricWord): boolean {
	if (!word.ruby || word.ruby.length === 0) {
		return true;
	}
	return word.ruby.length === 1;
}

/**
 * Compute variation parameter between two adjacent entity syllables
 *
 * Gap is a boundary property not syllable property, counted toward left syllable only when checking boundary:
 * If both sides include gap duration, pre-gap syllable would be prematurely cut from cluster
 *
 * @param w1 Previous syllable
 * @param w2 Next syllable
 * @param w1TrailingGap Gap duration between w1 and w2, counted toward w1
 * @returns Variation parameter value (0 ~ 100)
 */
function calculateSyllableVariation(
	w1: LyricWord,
	w2: LyricWord,
	w1TrailingGap = 0,
): number {
	const r1 = (getDuration(w1) + w1TrailingGap) / getCharCount(w1);
	const r2 = getDuration(w2) / getCharCount(w2);
	return calculateRateVariation(r1, r2);
}

/**
 * Compute cluster-level variation parameter after merging candidate syllable into cluster
 *
 * Pairwise checks miss accumulated absorbed gaps: individual gaps below threshold
 * but reallocation uses whole cluster span, accumulating small gaps that stretch all cluster syllables
 *
 * @param cluster Current syllable cluster
 * @param candidate Candidate syllable
 * @returns Variation parameter value between sung duration and reallocated duration (0 ~ 100)
 */
function calculateClusterVariation(
	cluster: LyricWord[],
	candidate: LyricWord,
): number {
	const contentWords = [...cluster, candidate].filter(
		(w) => !isSpaceSyllable(w),
	);
	const sungDuration = contentWords.reduce((sum, w) => sum + getDuration(w), 0);
	const span = Math.max(
		0,
		(contentWords[contentWords.length - 1].endTime ?? 0) -
			(contentWords[0].startTime ?? 0),
	);
	return calculateRateVariation(sungDuration, span);
}

/**
 * Smoothly reallocate timestamps for entity syllables in cluster proportionally to char count
 *
 * Residual gaps in cluster are deemed insignificant and distributed across syllables;
 * Significant gaps formed cluster boundaries in partitioning phase and will not reach here
 *
 * @param cluster Syllable cluster
 * @returns Array of syllables with smoothed timestamps
 */
function smoothClusterTimestamps(cluster: LyricWord[]): LyricWord[] {
	const contentWords = cluster.filter((w) => !isSpaceSyllable(w));
	if (contentWords.length <= 1) {
		return cluster;
	}

	const totalStart = contentWords[0].startTime ?? 0;
	const totalEnd = contentWords[contentWords.length - 1].endTime ?? 0;
	const span = Math.max(0, totalEnd - totalStart);

	const reservedTotal = cluster
		.filter(isSpaceSyllable)
		.reduce((sum, w) => sum + getDuration(w), 0);
	const distributable = Math.max(0, span - reservedTotal);

	const charCounts = contentWords.map(getCharCount);
	const totalWeight = charCounts.reduce((sum, c) => sum + c, 0);

	const result: LyricWord[] = [];
	let cursor = totalStart;
	let reserved = 0;
	let cumWeight = 0;
	let contentIndex = 0;

	for (const word of cluster) {
		if (isSpaceSyllable(word)) {
			const spacerDuration = getDuration(word);
			result.push({
				...word,
				startTime: cursor,
				endTime: cursor + spacerDuration,
			});
			reserved += spacerDuration;
			cursor += spacerDuration;
			continue;
		}

		cumWeight += charCounts[contentIndex];
		const isLast = contentIndex === contentWords.length - 1;
		const wordStart = cursor;
		const wordEnd = isLast
			? totalEnd
			: totalStart +
				reserved +
				(totalWeight > 0
					? Math.round((distributable * cumWeight) / totalWeight)
					: 0);
		cursor = wordEnd;
		contentIndex++;

		// Sync base syllable timestamps to single ruby syllable after smoothing
		// isRubyEligibleForSmoothing prevents complex sync requirements
		const originalRuby = word.ruby;
		const ruby =
			originalRuby && originalRuby.length === 1
				? [{ ...originalRuby[0], startTime: wordStart, endTime: wordEnd }]
				: originalRuby;

		result.push({
			...word,
			startTime: wordStart,
			endTime: wordEnd,
			...(ruby ? { ruby } : {}),
		});
	}

	return result;
}

/**
 * Merge smoothed syllable cluster into a single syllable
 * @param cluster Smoothed syllable cluster
 * @returns Merged single syllable
 */
function mergeCluster(cluster: LyricWord[]): LyricWord {
	const contentWords = cluster.filter((w) => !isSpaceSyllable(w));
	const first = contentWords[0] ?? cluster[0];
	const last =
		contentWords[contentWords.length - 1] ?? cluster[cluster.length - 1];

	const word = cluster.map((w) => w.word ?? "").join("");
	const startTime = first.startTime ?? 0;
	const endTime = last.endTime ?? 0;
	const obscene = cluster.some((w) => w.obscene);
	const emptyBeat = cluster.reduce((sum, w) => sum + (w.emptyBeat || 0), 0);

	const romanWord = cluster
		.map((w) => w.romanWord?.trim())
		.filter(Boolean)
		.join(" ");

	const rubies = cluster.flatMap((w) => w.ruby || []);

	return {
		...newLyricWord(),
		id: first.id || uid(),
		word,
		startTime,
		endTime,
		obscene,
		emptyBeat,
		romanWord,
		...(rubies.length > 0 ? { ruby: rubies } : {}),
	};
}

/**
 * Apply variation-parameter-based smoothing to syllables in a lyric line
 * @param line Lyric line object
 * @param options Configuration options (threshold and whether to merge syllables)
 * @returns Smoothed lyric line object
 */
export function smoothSyllables(
	line: LyricLine,
	options?: SyllableSmoothingOptions,
): LyricLine {
	if (!line.words || line.words.length <= 1) {
		return line;
	}

	const threshold = options?.threshold ?? SyllableSmoothThreshold.MEDIUM;
	const shouldMerge = options?.mergeSyllables ?? false;

	const resultWords: LyricWord[] = [];
	let i = 0;

	while (i < line.words.length) {
		const current = line.words[i];

		if (isSpaceSyllable(current)) {
			resultWords.push(current);
			i++;
			continue;
		}

		const cluster: LyricWord[] = [current];
		let lastContentWord = current;

		while (i + 1 < line.words.length) {
			let nextIndex = i + 1;
			const pendingSpaces: LyricWord[] = [];

			while (
				nextIndex < line.words.length &&
				isSpaceSyllable(line.words[nextIndex])
			) {
				pendingSpaces.push(line.words[nextIndex]);
				nextIndex++;
			}

			if (nextIndex >= line.words.length) {
				break;
			}

			const nextWord = line.words[nextIndex];

			const isCurrentCJK = isAllCJK(lastContentWord.word);
			const isNextCJK = isAllCJK(nextWord.word);
			const isCurrentRubyEligible = isRubyEligibleForSmoothing(lastContentWord);
			const isNextRubyEligible = isRubyEligibleForSmoothing(nextWord);

			if (
				isCurrentCJK &&
				isNextCJK &&
				isCurrentRubyEligible &&
				isNextRubyEligible
			) {
				const gap = getGapBetween(lastContentWord, nextWord, pendingSpaces);

				const variation = calculateSyllableVariation(lastContentWord, nextWord);
				const gapVariation = calculateSyllableVariation(
					lastContentWord,
					nextWord,
					gap,
				);
				const clusterVariation = calculateClusterVariation(cluster, nextWord);

				if (
					variation < threshold &&
					gapVariation < threshold &&
					clusterVariation < threshold
				) {
					cluster.push(...pendingSpaces, nextWord);
					lastContentWord = nextWord;
					i = nextIndex;
					continue;
				}
			}

			break;
		}

		if (cluster.length === 1) {
			resultWords.push(cluster[0]);
		} else {
			const smoothed = smoothClusterTimestamps(cluster);

			if (shouldMerge) {
				resultWords.push(mergeCluster(smoothed));
			} else {
				resultWords.push(...smoothed);
			}
		}

		i++;
	}

	return {
		...line,
		words: resultWords,
	};
}
