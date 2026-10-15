/**
 * @description Handle logic for opening files
 */

import {
	type LyricLine,
	parseEslrc,
	parseLys,
	parseQrc,
	parseYrc,
} from "@applemusic-like-lyrics/lyric";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { uid } from "uid";
import { audioEngine } from "$/modules/audio/audio-engine";
import { getProjectList } from "$/modules/project/autosave/autosave";
import { getSuggestedTtmlFileName } from "$/modules/project/logic/metadata-filename";
import { isProjectMatch } from "$/modules/project/logic/project-match";
import { ttmlToAmll } from "$/modules/ttml-processor";
import type { AmllLyricResult } from "$/modules/ttml-processor/types";
import { useTtmlErrorHandler } from "$/modules/ttml-processor/useTtmlErrorHandler";
import { confirmDialogAtom } from "$/states/dialogs.ts";
import {
	isDirtyAtom,
	lyricLinesAtom,
	newLyricLinesAtom,
	projectIdAtom,
	saveFileNameAtom,
} from "$/states/main.ts";
import type { TTMLLyric, TTMLMetadata } from "$/types/ttml";
import { createLogger } from "$/utils/logger";
import { parseLrc } from "$/utils/parse-lrc";

const fileOpenerLogger = createLogger("FileOpener");

const LYRIC_PARSERS: Record<string, (text: string) => LyricLine[]> = {
	lrc: parseLrc,
	eslrc: parseEslrc,
	qrc: parseQrc,
	yrc: parseYrc,
	lys: parseLys,
};

const AUDIO_EXTENSIONS = new Set([
	"flac",
	"wav",
	"m4a",
	"alac",
	"ape",
	"mac",
	"wv",
	"tta",
	"tak",
	"aiff",
	"aif",
	"aifc",
	"mp3",
	"aac",
	"mp4",
	"ogg",
	"oga",
	"opus",
	"wma",
	"asf",
	"mpc",
	"mpp",
	"mp+",
	"dsf",
	"ac3",
	"eac3",
	"dts",
	"dtshd",
	"thd",
	"mlp",
	"mka",
	"amr",
	"rm",
	"ra",
	"au",
	"snd",
	"caf",
	"w64",
	"iff",
	"8svx",
]);

const mergeExtractedMetadata = (
	currentMetadata: TTMLMetadata[],
	extractedMetadata: TTMLMetadata[],
) => {
	let changed = false;
	for (const extracted of extractedMetadata) {
		const values = extracted.value
			.map((value) => value.trim())
			.filter((value) => value !== "");
		if (values.length === 0) continue;

		const current = currentMetadata.find((item) => item.key === extracted.key);
		if (!current) {
			currentMetadata.push({ key: extracted.key, value: values });
			changed = true;
			continue;
		}

		if (current.value.some((value) => value.trim() !== "")) continue;
		current.value = values;
		changed = true;
	}
	return changed;
};

export const useFileOpener = () => {
	const setNewLyricLines = useSetAtom(newLyricLinesAtom);
	const setLyricLines = useSetAtom(lyricLinesAtom);
	const setProjectId = useSetAtom(projectIdAtom);
	const setSaveFileName = useSetAtom(saveFileNameAtom);
	const setConfirmDialog = useSetAtom(confirmDialogAtom);
	const isDirty = useAtomValue(isDirtyAtom);
	const handleTtmlError = useTtmlErrorHandler();
	const { t } = useTranslation();

	const normalizeLyricLines = useCallback(
		(lyricLines: LyricLine[]): TTMLLyric => {
			return {
				lyricLines: lyricLines.map((line) => ({
					...line,
					words: line.words.map((word) => ({
						...word,
						id: uid(),
						obscene: false,
						emptyBeat: 0,
					})),
					ignoreSync: false,
					id: uid(),
				})),
				metadata: [],
			};
		},
		[],
	);

	const normalizeAmllLyricResult = useCallback(
		(amllResult: AmllLyricResult): TTMLLyric => {
			return {
				metadata: amllResult.metadata.map((meta) => ({ ...meta })),
				lyricLines: amllResult.lyricLines.map((line) => ({
					...line,
					words: line.words.map((word) => ({
						...word,
						id: uid(),
						obscene: word.obscene ?? false,
						emptyBeat: word.emptyBeat ?? 0,
					})),
					ignoreSync: false,
					id: uid(),
				})),
			};
		},
		[],
	);

	const performOpenFile = useCallback(
		async (file: File, forceExt?: string) => {
			const rawExt = file.name.split(".").pop()?.toLowerCase() || "";
			const ext = forceExt ? forceExt.toLowerCase() : rawExt;

			try {
				if (AUDIO_EXTENSIONS.has(ext)) {
					void audioEngine
						.loadMusic(file)
						.then((metadata) => {
							setLyricLines((prev) => {
								const nextMetadata = prev.metadata.map((item) => ({
									...item,
									value: [...item.value],
								}));
								const metadataChanged = mergeExtractedMetadata(
									nextMetadata,
									metadata,
								);
								if (!metadataChanged) return prev;
								return { ...prev, metadata: nextMetadata };
							});
						})
						.catch((e) => {
							fileOpenerLogger.error(
								`Failed to load audio or extract metadata: ${file.name}`,
								e,
							);
						});
					return;
				}

				let lyricData: TTMLLyric | null = null;
				const text = await file.text();

				if (ext === "ttml") {
					const result = ttmlToAmll(text);

					if (result.success) {
						lyricData = normalizeAmllLyricResult(result.data);
					} else {
						handleTtmlError(
							result.error,
							`Error when parsing TTML: ${file.name}`,
							text,
						);

						return;
					}
				} else if (ext in LYRIC_PARSERS) {
					const parser = LYRIC_PARSERS[ext];
					const rawLines = parser(text);
					lyricData = normalizeLyricLines(rawLines);
				} else {
					toast.error(
						t("error.unsupportedFileFormat", "Unsupported file format: {ext}", {
							ext,
						}),
					);
					return;
				}

				if (!lyricData) return;

				let resolvedProjectId = uid();

				try {
					if (lyricData.metadata.length > 0) {
						const projects = await getProjectList();
						const matchedProject = projects.find((p) =>
							isProjectMatch(p, lyricData as TTMLLyric),
						);

						if (matchedProject) {
							fileOpenerLogger.debug(
								`Matched existing project: ${matchedProject.name} (${matchedProject.id})`,
							);
							resolvedProjectId = matchedProject.id;
						} else {
							fileOpenerLogger.debug("No existing project matched");
						}
					}
				} catch (e) {
					fileOpenerLogger.error("Failed to parse project data", e);
				}

				setProjectId(resolvedProjectId);
				setNewLyricLines(lyricData);
				const suggestedFile = getSuggestedTtmlFileName(lyricData.metadata);
				const nextFileName =
					ext === "ttml" ? file.name : (suggestedFile?.fileName ?? file.name);
				setSaveFileName(nextFileName);
			} catch (e) {
				fileOpenerLogger.error(`Failed to open file: ${file.name}`, e);
				toast.error(t("error.openFileFailed", "Failed to open file"));
			}
		},
		[
			setNewLyricLines,
			setLyricLines,
			setProjectId,
			setSaveFileName,
			normalizeLyricLines,
			normalizeAmllLyricResult,
			t,
			handleTtmlError,
		],
	);

	const openFile = useCallback(
		/**
		 * Open file
		 * @param file
		 * @param forceExt Optional parameter to enforce specific parser, inferred from file extension if omitted
		 */
		(file: File, forceExt?: string) => {
			const run = () => performOpenFile(file, forceExt);

			const rawExt = file.name.split(".").pop()?.toLowerCase() || "";
			const finalExt = forceExt || rawExt;

			if (AUDIO_EXTENSIONS.has(finalExt)) {
				run();
				return;
			}

			if (isDirty) {
				setConfirmDialog({
					open: true,
					title: t("confirmDialog.openFile.title", "Confirm Open File"),
					description: t(
						"confirmDialog.openFile.description",
						"The current file has unsaved changes. Continuing will lose these changes. Are you sure you want to open a new file?",
					),
					onConfirm: run,
				});
			} else {
				run();
			}
		},
		[isDirty, setConfirmDialog, t, performOpenFile],
	);

	return { openFile };
};
