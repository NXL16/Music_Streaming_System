import { atomWithStorage } from "jotai/utils";

export enum SyncJudgeMode {
	FirstKeyDownTime = "first-keydown-time",
	FirstKeyDownTimeLegacy = "first-keydown-time-legacy",
	LastKeyUpTime = "last-keyup-time",
	MiddleKeyTime = "middle-key-time",
}

export enum LayoutMode {
	Simple = "simple",
	Advance = "advance",
}

export enum TranslationOutputMode {
	/** Apple Music style: line-by-line translation/romanization written into `<iTunesMetadata>` in `<head>` */
	AppleMusic = "apple-music",
	/** AMLL style: line-by-line translation/romanization written as embedded `x-translation` / `x-roman` */
	Amll = "amll",
}

export const latencyTestBPMAtom = atomWithStorage("latencyTestBPM", 120);

export const syncJudgeModeAtom = atomWithStorage(
	"syncJudgeMode",
	SyncJudgeMode.FirstKeyDownTime,
);

export const layoutModeAtom = atomWithStorage("layoutMode", LayoutMode.Simple);

export const translationOutputModeAtom = atomWithStorage(
	"translationOutputMode",
	TranslationOutputMode.AppleMusic,
);

export const showWordRomanizationInputAtom = atomWithStorage(
	"showWordRomanizationInput",
	false,
);

export const displayRomanizationInSyncAtom = atomWithStorage(
	"displayRomanizationInSync",
	false,
);

export const showLineTranslationAtom = atomWithStorage(
	"showLineTranslation",
	true,
);

export const showLineRomanizationAtom = atomWithStorage(
	"showLineRomanization",
	true,
);

export const generateNameFromMetadataAtom = atomWithStorage(
	"generateNameFromMetadata",
	true,
);

export const autosaveEnabledAtom = atomWithStorage("autosaveEnabled", true);
export const autosaveIntervalAtom = atomWithStorage("autosaveInterval", 10);
export const autosaveLimitAtom = atomWithStorage("autosaveLimit", 10);

export const showTimestampsAtom = atomWithStorage("showTimestamps", true);

export const highlightActiveWordAtom = atomWithStorage(
	"highlightActiveWord",
	true,
);

export const highlightErrorsAtom = atomWithStorage("highlightErrors", false);

export const smartFirstWordAtom = atomWithStorage("smartFirstWord", false);
export const smartLastWordAtom = atomWithStorage("smartLastWord", false);

export const enableAutoRomanizationPredictionAtom = atomWithStorage(
	"enableAutoRomanizationPrediction",
	false,
);

export { stretchAlgorithmAtom } from "$/modules/audio/states";
export type { StretchAlgorithm } from "$/modules/ffmpeg/types.ts";
