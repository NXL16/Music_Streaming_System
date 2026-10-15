/**
 * @description Types used by the segmentation engine.
 */

/**
 * @description Character types used for segmentation and weighting.
 */
export enum CharType {
	Cjk,
	Latin,
	Numeric,
	Whitespace,
	Other,
}

export type HyphenatorFunc = (text: string) => string;

/**
 * @description Advanced segmentation configuration.
 */
export interface SegmentationConfig {
	/**
	 * Whether to split CJK text by character.
	 *
	 * @default true
	 */
	splitCJK: boolean;
	/**
	 * Whether to split English words into syllables.
	 *
	 * @default true
	 */
	splitEnglish: boolean;
	/**
	 * Relative punctuation weight when distributing duration.
	 *
	 * @default 0.2
	 */
	punctuationWeight: number;
	/**
	 * Punctuation handling mode.
	 *
	 * @default "merge"
	 */
	punctuationMode: "merge" | "standalone";
	/**
	 * Whether to remove empty segments.
	 *
	 * @default true
	 */
	removeEmptySegments: boolean;
	/**
	 * Ignore list.
	 */
	ignoreList: Set<string>;
	/**
	 * Custom segmentation rules.
	 */
	customRules: Map<string, string[]>;
	/**
	 * Active hyphenation function. Without one, Western-language syllables are not split automatically.
	 */
	hyphenator?: HyphenatorFunc;
}
