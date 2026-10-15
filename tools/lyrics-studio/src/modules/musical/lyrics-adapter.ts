import {
	amllToTTML,
	ttmlLyricToAmllResult,
	ttmlToAmll,
} from "$/modules/ttml-processor";
import { newLyricLine, newLyricWord, type TTMLLyric } from "$/types/ttml";

export type MusicalLyricsPayload = {
	language: string;
	sourceTtml: string;
};

export type MusicalLyricsResponse = {
	songId: string;
	language: string;
	sourceTtml: string;
	published: boolean;
};

export class LyricsCompatibilityError extends Error {}

export function toMusicalLyricsPayload(
	lyric: TTMLLyric,
	language: string,
): MusicalLyricsPayload {
	const ttml = amllToTTML(ttmlLyricToAmllResult(lyric));
	if (!ttml.success) {
		throw new LyricsCompatibilityError(
			"Could not generate TTML from this lyric.",
		);
	}
	return {
		language: language.trim().toLowerCase() || "vi",
		sourceTtml: ttml.data,
	};
}

export function fromMusicalTtml(sourceTtml: string): TTMLLyric {
	const parsed = ttmlToAmll(sourceTtml);
	if (!parsed.success) {
		throw new LyricsCompatibilityError("The saved TTML could not be parsed.");
	}
	return {
		metadata: parsed.data.metadata.map((metadata) => ({ ...metadata })),
		lyricLines: parsed.data.lyricLines.map((line) => {
			const result = newLyricLine();
			result.startTime = line.startTime;
			result.endTime = line.endTime;
			result.translatedLyric = line.translatedLyric || "";
			result.romanLyric = line.romanLyric || "";
			result.isBG = Boolean(line.isBG);
			result.isDuet = Boolean(line.isDuet);
			result.words = line.words.map((word) => ({
				...newLyricWord(),
				startTime: word.startTime,
				endTime: word.endTime,
				word: word.word,
				romanWord: word.romanWord,
				obscene: word.obscene ?? false,
				emptyBeat: word.emptyBeat ?? 0,
				ruby: word.ruby,
			}));
			return result;
		}),
	};
}
