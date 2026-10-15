import {
	TranslationOutputMode,
	translationOutputModeAtom,
} from "$/modules/settings/states";
import { globalStore } from "$/states/store.ts";
import type {
	LyricLine as AppLyricLine,
	LyricWord as AppLyricWord,
	TTMLLyric as AppTTMLLyric,
	TTMLMetadata as AppTTMLMetadata,
} from "$/types/ttml";
import type {
	AmllLyricLine,
	AmllLyricResult,
	AmllLyricWord,
	AmllMetadata,
	AmllToTtmlOptions,
	GeneratorConfig,
	JsError,
	TTMLResult,
	TtmlToAmllOptions,
} from "./types";
import {
	amllToTtml as rawAmllToTtml,
	amllToTtmlResult as rawAmllToTtmlResult,
	generateTtml as rawGenerateTtml,
	parseTtml as rawParseTtml,
	ttmlResultToAmll as rawTtmlResultToAmll,
	ttmlToAmll as rawTtmlToAmll,
} from "./wasm/ttml_processor_wasm";

//#region Type definitions
export type Result<T> =
	| { success: true; data: T }
	| { success: false; error: JsError };

/** Metadata keys to strip during import */
const IGNORED_METADATA_KEYS = new Set(["timingMode", "language"]);

/** Metadata keys to rename during import */
const RENAMED_METADATA_KEYS: Record<string, string> = {
	songwriters: "songwriter",
	title: "musicName",
};

/** Metadata keys to rename during export */
const EXPORT_RENAMED_METADATA_KEYS: Record<string, string> = {
	songwriter: "songwriters",
};
//#endregion

//#region Generator configuration
/**
 * Generate default TTML generator config based on translation output mode in preferences
 *
 * - {@link TranslationOutputMode.AppleMusic}: line-by-line translation/romanization written to `<iTunesMetadata>`
 * - {@link TranslationOutputMode.Amll}: line-by-line translation/romanization written as embedded tags
 *   `x-translation` / `x-roman`
 */
export function getDefaultGeneratorConfig(): Partial<GeneratorConfig> {
	return {
		useAppleFormatRules:
			globalStore.get(translationOutputModeAtom) ===
			TranslationOutputMode.AppleMusic,
	};
}

/**
 * Merge caller-provided generator config with default preferences config
 *
 * Explicitly specified caller fields take precedence over preferences
 */
function withDefaultGeneratorConfig(
	config?: Partial<GeneratorConfig>,
): Partial<GeneratorConfig> {
	return { ...getDefaultGeneratorConfig(), ...config };
}
//#endregion

//#region Low-level API
/**
 * Parse TTML string into TTMLResult
 * @param ttmlContent Raw TTML text
 * @returns Result containing TTMLResult
 */
export function parseTTML(ttmlContent: string): Result<TTMLResult> {
	return rawParseTtml(ttmlContent) as Result<TTMLResult>;
}

/**
 * Generate TTML string from parsed TTML struct
 * @param result TTMLResult data model
 * @param config TTML generator configuration
 * @returns Result containing generated TTML string
 */
export function generateTTML(
	result: TTMLResult,
	config?: Partial<GeneratorConfig>,
): Result<string> {
	return rawGenerateTtml(result, config) as Result<string>;
}
//#endregion

//#region AMLL conversion
/**
 * Convenience method: convert and downgrade TTML string to simpler AMLL structure
 * @param ttmlContent Raw TTML text
 * @param options Language preferences during extraction
 * @returns Result containing AmllLyricResult
 */
export function ttmlToAmll(
	ttmlContent: string,
	options?: Partial<TtmlToAmllOptions>,
): Result<AmllLyricResult> {
	const result = rawTtmlToAmll(ttmlContent, options) as Result<AmllLyricResult>;
	if (!result.success) return result;

	const processedLyricLines = result.data.lyricLines.map((line) => {
		const newWords: AmllLyricWord[] = [];

		for (const word of line.words) {
			const trailingSpaceMatch = word.word.match(/(\s+)$/);

			if (trailingSpaceMatch && word.word !== trailingSpaceMatch[0]) {
				const spaces = trailingSpaceMatch[0];
				const pureWord = word.word.slice(0, -spaces.length);

				newWords.push({ ...word, word: pureWord });

				newWords.push({
					startTime: 0,
					endTime: 0,
					word: spaces,
				});
			} else {
				newWords.push(word);
			}
		}

		return {
			...line,
			words: newWords,
		};
	});

	return {
		success: true,
		data: {
			...result.data,
			lyricLines: processedLyricLines,
			metadata: result.data.metadata
				.filter((meta) => !IGNORED_METADATA_KEYS.has(meta.key))
				.map((meta) => ({
					...meta,
					key: RENAMED_METADATA_KEYS[meta.key] ?? meta.key,
				})),
		},
	};
}

/**
 * Downgrade internal editor LyricWord to simplified AMLL structure
 *
 * Discards editor-specific fields such as `id` and `romanWarning`
 */
function normalizeExportWord(word: AppLyricWord): AmllLyricWord {
	return {
		startTime: word.startTime,
		endTime: word.endTime,
		word: word.word,
		romanWord: word.romanWord,
		obscene: word.obscene,
		emptyBeat: word.emptyBeat,
		ruby: word.ruby,
	};
}

/**
 * Downgrade internal editor lyric line to simplified AMLL structure
 *
 * Discards editor-specific fields such as `id`, `ignoreSync`, and `endTimeLink`
 */
function normalizeExportLine(line: AppLyricLine): AmllLyricLine {
	return {
		words: line.words.map(normalizeExportWord),
		translatedLyric: line.translatedLyric,
		romanLyric: line.romanLyric,
		isBG: line.isBG,
		isDuet: line.isDuet,
		startTime: line.startTime,
		endTime: line.endTime,
	};
}

/**
 * Downgrade internal editor metadata to simplified AMLL structure
 */
function normalizeExportMetadata(metadata: AppTTMLMetadata[]): AmllMetadata[] {
	return metadata.map((meta) => ({
		key: EXPORT_RENAMED_METADATA_KEYS[meta.key] ?? meta.key,
		value: [...meta.value],
	}));
}

/**
 * Convert internal `TTMLLyric` structure to simpler AMLL structure
 * @param ttmlLyric Internal editor lyric data
 * @returns AmllLyricResult structure
 */
export function ttmlLyricToAmllResult(
	ttmlLyric: AppTTMLLyric,
): AmllLyricResult {
	return {
		lyricLines: ttmlLyric.lyricLines.map(normalizeExportLine),
		metadata: normalizeExportMetadata(ttmlLyric.metadata),
	};
}

function postProcessLyricLines(amllResult: AmllLyricResult): AmllLyricResult {
	return {
		...amllResult,
		lyricLines: amllResult.lyricLines.map((line) => ({
			...line,
			startTime: Math.round(line.startTime),
			endTime: Math.round(line.endTime),
			words: line.words.map((word) => {
				const processedWord: AmllLyricWord = {
					...word,
					startTime: Math.round(word.startTime),
					endTime: Math.round(word.endTime),
					ruby: word.ruby
						? word.ruby.map((r) => ({
								...r,
								startTime: Math.round(r.startTime),
								endTime: Math.round(r.endTime),
							}))
						: undefined,
				};

				if (processedWord.emptyBeat == null || processedWord.emptyBeat === 0) {
					processedWord.emptyBeat = undefined;
				}

				if (!processedWord.romanWord || processedWord.romanWord.trim() === "") {
					processedWord.romanWord = undefined;
				}

				return processedWord;
			}),
		})),
	};
}

/**
 * Determine if given lyrics are line-by-line lyrics
 *
 * Evaluates as line-by-line if all non-background vocal lines have only one syllable
 */
export function isLineTimingLyrics(
	lyric: AmllLyricResult | AppTTMLLyric,
): boolean {
	const nonBgLines = lyric.lyricLines.filter((line) => !line.isBG);
	return (
		nonBgLines.length > 0 && nonBgLines.every((line) => line.words.length === 1)
	);
}

/**
 * Convenience method: generate TTML string from AMLL format lyrics and metadata
 *
 * Normalizes text, e.g. cleaning spaces and removing background vocal parentheses
 * @param amllResult AMLL struct data
 * @param options Language options
 * @param config TTML generator configuration
 * @returns Result containing generated TTML string
 */
export function amllToTTML(
	amllResult: AmllLyricResult,
	options?: Partial<AmllToTtmlOptions>,
	config?: Partial<GeneratorConfig>,
): Result<string> {
	const processedAmllResult = postProcessLyricLines(amllResult);
	const lineTiming = isLineTimingLyrics(amllResult);
	return rawAmllToTtml(
		processedAmllResult,
		options,
		withDefaultGeneratorConfig({
			lineTiming,
			...config,
		}),
	) as Result<string>;
}

/**
 * Utility method: downgrade complex TTMLResult tree to simpler AMLL data structure
 * @param ttmlResult Complex TTMLResult data tree
 * @param options Language preferences during extraction
 * @returns Result containing AmllLyricResult
 */
export function ttmlResultToAmll(
	ttmlResult: TTMLResult,
	options?: Partial<TtmlToAmllOptions>,
): Result<AmllLyricResult> {
	return rawTtmlResultToAmll(ttmlResult, options) as Result<AmllLyricResult>;
}

/**
 * Utility method: convert AMLL format lyrics and metadata to TTMLResult structure
 *
 * Normalizes text, e.g. cleaning spaces and removing background vocal parentheses
 * @param amllResult AMLL struct data
 * @param options Language options
 * @returns Result containing TTMLResult
 */
export function amllToTTMLResult(
	amllResult: AmllLyricResult,
	options?: Partial<AmllToTtmlOptions>,
): Result<TTMLResult> {
	const processedAmllResult = postProcessLyricLines(amllResult);
	return rawAmllToTtmlResult(
		processedAmllResult,
		options,
	) as Result<TTMLResult>;
}
//#endregion
