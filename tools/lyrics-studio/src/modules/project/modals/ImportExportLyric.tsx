import {
	type LyricLine,
	stringifyAss,
	stringifyEslrc,
	stringifyLrc,
	stringifyLys,
	stringifyQrc,
	stringifyYrc,
} from "@applemusic-like-lyrics/lyric";
import { DropdownMenu } from "@radix-ui/themes";
import { useSetAtom, useStore } from "jotai";
import { useTranslation } from "react-i18next";
import saveFile from "save-file";
import { useFileOpener } from "$/hooks/useFileOpener.ts";
import { importFromTextDialogAtom } from "$/states/dialogs.ts";
import { lyricLinesAtom, saveFileNameAtom } from "$/states/main.ts";
import { projectLogger } from "../logger";

export const ImportExportLyric = () => {
	const store = useStore();
	const setImportFromTextDialog = useSetAtom(importFromTextDialogAtom);
	const { openFile } = useFileOpener();
	const { t } = useTranslation();

	const onImportLyric = (extension: string) => {
		const inputEl = document.createElement("input");
		inputEl.type = "file";
		inputEl.accept = `.${extension},*/*`;
		inputEl.addEventListener(
			"change",
			() => {
				const file = inputEl.files?.[0];
				if (!file) return;

				openFile(file, extension);
			},
			{
				once: true,
			},
		);
		inputEl.click();
	};
	const onExportLyric =
		(stringifier: (lines: LyricLine[]) => string, extension: string) =>
		async () => {
			const lyric = store.get(lyricLinesAtom).lyricLines;
			const lyricForExport = lyric.map((line) => ({
				...line,
				startTime: Math.round(line.startTime),
				endTime: Math.round(line.endTime),
				words: line.words.map((word) => ({
					...word,
					startTime: Math.round(word.startTime),
					endTime: Math.round(word.endTime),
				})),
			}));
			const saveFileName = store.get(saveFileNameAtom);
			const baseName = saveFileName.replace(/\.[^.]*$/, "");
			const fileName = `${baseName}.${extension}`;
			try {
				const data = stringifier(lyricForExport);
				const b = new Blob([data], { type: "text/plain" });
				await saveFile(b, fileName);
			} catch (e) {
				projectLogger.error(
					`Failed to export lyric with format "${extension}"`,
					e,
				);
			}
		};

	return (
		<>
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>
					{t("topBar.menu.importLyric.import", "Import Lyrics...")}
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent>
					<DropdownMenu.Item onClick={() => setImportFromTextDialog(true)}>
						{t("topBar.menu.importLyric.fromPlainText", "Import from Plain Text")}
					</DropdownMenu.Item>
					<DropdownMenu.Item onClick={() => onImportLyric("lrc")}>
						{t("topBar.menu.importLyric.fromLyRiC", "Import from LyRiC File")}
					</DropdownMenu.Item>
					<DropdownMenu.Item onClick={() => onImportLyric("eslrc")}>
						{t("topBar.menu.importLyric.fromESLyRiC", "Import from ESLyRiC File")}
					</DropdownMenu.Item>
					<DropdownMenu.Item onClick={() => onImportLyric("qrc")}>
						{t("topBar.menu.importLyric.fromQRC", "Import from QRC File")}
					</DropdownMenu.Item>
					<DropdownMenu.Item onClick={() => onImportLyric("yrc")}>
						{t("topBar.menu.importLyric.fromYRC", "Import from YRC File")}
					</DropdownMenu.Item>
					<DropdownMenu.Item onClick={() => onImportLyric("lys")}>
						{t(
							"topBar.menu.importLyric.fromLrcfySylb",
							"Import from Lyricify Syllable File",
						)}
					</DropdownMenu.Item>
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>
					{t("topBar.menu.exportLyric.export", "Export Lyrics...")}
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent>
					<DropdownMenu.Item onClick={onExportLyric(stringifyLrc, "lrc")}>
						{t("topBar.menu.exportLyric.toLyRiC", "Export to LyRiC")}
					</DropdownMenu.Item>
					<DropdownMenu.Item onClick={onExportLyric(stringifyEslrc, "lrc")}>
						{t("topBar.menu.exportLyric.toESLyRiC", "Export to ESLyRiC")}
					</DropdownMenu.Item>
					<DropdownMenu.Item onClick={onExportLyric(stringifyQrc, "qrc")}>
						{t("topBar.menu.exportLyric.toQRC", "Export to QRC")}
					</DropdownMenu.Item>
					<DropdownMenu.Item onClick={onExportLyric(stringifyYrc, "yrc")}>
						{t("topBar.menu.exportLyric.toYRC", "Export to YRC")}
					</DropdownMenu.Item>
					<DropdownMenu.Item onClick={onExportLyric(stringifyLys, "lys")}>
						{t(
							"topBar.menu.exportLyric.toLrcfySylb",
							"Export to Lyricify Syllable",
						)}
					</DropdownMenu.Item>
					<DropdownMenu.Item onClick={onExportLyric(stringifyAss, "ass")}>
						{t("topBar.menu.exportLyric.toASS", "Export to ASS Subtitles")}
					</DropdownMenu.Item>
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
		</>
	);
};
