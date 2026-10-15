import type {
	LyricLine as AMLLLyricLine,
	LyricWord as AMLLLyricWord,
} from "@applemusic-like-lyrics/lyric";
import { uid } from "uid";

export interface TTMLMetadata {
	key: string;
	value: string[];
	error?: boolean;
}

export interface TTMLLyric {
	metadata: TTMLMetadata[];
	lyricLines: LyricLine[];
}

export interface LyricWordBase {
	startTime: number;
	endTime: number;
	word: string;
	emptyBeat?: number;
}

export interface LyricWord extends AMLLLyricWord {
	// Unique word identifier; not persisted on export.
	id: string;
	startTime: number;
	endTime: number;
	word: string;
	obscene: boolean;
	emptyBeat: number;
	romanWarning?: boolean;
	ruby?: LyricWordBase[];
}

export const newLyricWord = (): LyricWord => ({
	id: uid(),
	startTime: 0,
	endTime: 0,
	word: "",
	obscene: false,
	emptyBeat: 0,
	romanWord: "",
});

export interface LyricLine extends AMLLLyricLine {
	// Unique line identifier; not persisted on export.
	id: string;
	words: LyricWord[];
	// translatedLyric: string;
	// romanLyric: string;
	// isBG: boolean;
	// isDuet: boolean;
	startTime: number;
	endTime: number;
	ignoreSync: boolean;
	/**
	 * @description Original timing values saved before linking, for restoration when unlinked.
	 */
	endTimeLink?: {
		/**
		 * @description Original end time of this line.
		 */
		originalEndTime: number;
		/**
		 * @description Original start time of the next line, or null when absent.
		 */
		originalNextStartTime: number | null;
	};
}

export const newLyricLine = (): LyricLine => ({
	id: uid(),
	words: [],
	translatedLyric: "",
	romanLyric: "",
	isBG: false,
	isDuet: false,
	startTime: 0,
	endTime: 0,
	ignoreSync: false,
});
