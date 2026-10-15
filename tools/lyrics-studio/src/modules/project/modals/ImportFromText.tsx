import {
	Button,
	Dialog,
	Flex,
	Grid,
	Select,
	Switch,
	Text,
	TextArea,
	TextField,
} from "@radix-ui/themes";
import { atom, useAtom, useAtomValue, useSetAtom, useStore } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { memo, type PropsWithChildren, useCallback } from "react";
import { toast } from "react-toastify";
import {
	confirmDialogAtom,
	importFromTextDialogAtom,
} from "$/states/dialogs.ts";
import { isDirtyAtom, lyricLinesAtom } from "$/states/main.ts";
import { type LyricLine, newLyricLine, newLyricWord } from "$/types/ttml";

// import styles from "./ImportFromText.module.css";
import error = toast.error;

import { useTranslation } from "react-i18next";
import { projectLogger } from "../logger";

// type IModelDeltaDecoration = monaco.editor.IModelDeltaDecoration;
// type IEditorDecorationsCollection = monaco.editor.IEditorDecorationsCollection;

const PrefText = memo((props: PropsWithChildren) => (
	<Text color="gray" size="2">
		{props.children}
	</Text>
));

enum ImportMode {
	Lyric = "lyric",
	LyricTrans = "lyric-trans",
	LyricRoman = "lyric-roman",
	LyricTransRoman = "lyric-trans-roman",
}

enum LineSeparatorMode {
	Interleaved = "interleaved-line",
	SameLineSeparator = "same-line-separator",
}

const importModeAtom = atomWithStorage(
	"importFromText.importMode",
	ImportMode.Lyric,
);
const lineSeparatorModeAtom = atomWithStorage(
	"importFromText.lineSeparatorMode",
	LineSeparatorMode.Interleaved,
);
const lineSeparatorAtom = atomWithStorage("importFromText.lineSeparator", "|");
const swapTransAndRomanAtom = atomWithStorage(
	"importFromText.swapTransAndRoman",
	false,
);
const wordSeparatorAtom = atomWithStorage("importFromText.wordSeparator", "\\");
const enableSpecialPrefixAtom = atomWithStorage(
	"importFromText.enableSpecialPrefix",
	false,
);
const bgLyricPrefixAtom = atomWithStorage("importFromText.bgLyricPrefix", "<");
const duetLyricPrefixAtom = atomWithStorage(
	"importFromText.duetLyricPrefix",
	">",
);
const enableEmptyBeatAtom = atomWithStorage(
	"importFromText.enableEmptyBeat",
	false,
);
const emptyBeatSymbolAtom = atomWithStorage(
	"importFromText.emptyBeatSymbol",
	"^",
);
const textValueAtom = atom("");

const ImportFromTextEditor = memo(() => {
	const [value, setValue] = useAtom(textValueAtom);
	return (
		<TextArea
			style={{
				height: "calc(80vh - 5em)",
				flex: "1 1 auto",
				fontFamily: "var(--code-font-family)",
			}}
			value={value}
			onChange={(evt) => setValue(evt.currentTarget.value)}
		/>
	);
});

export const ImportFromText = () => {
	const setConfirmDialog = useSetAtom(confirmDialogAtom);
	const isDirty = useAtomValue(isDirtyAtom);
	const { t } = useTranslation();

	const [importFromTextDialog, setImportFromTextDialog] = useAtom(
		importFromTextDialogAtom,
	);

	const [importMode, setImportMode] = useAtom(importModeAtom);
	const [lineSeparatorMode, setLineSeparatorMode] = useAtom(
		lineSeparatorModeAtom,
	);
	const [lineSeparator, setLineSeparator] = useAtom(lineSeparatorAtom);
	const [swapTransAndRoman, setSwapTransAndRoman] = useAtom(
		swapTransAndRomanAtom,
	);
	const [wordSeparator, setWordSeparator] = useAtom(wordSeparatorAtom);
	const [enableSpecialPrefix, setEnableSpecialPrefix] = useAtom(
		enableSpecialPrefixAtom,
	);
	const [bgLyricPrefix, setBgLyricPrefix] = useAtom(bgLyricPrefixAtom);
	const [duetLyricPrefix, setDuetLyricPrefix] = useAtom(duetLyricPrefixAtom);
	const [enableEmptyBeat, setEnableEmptyBeat] = useAtom(enableEmptyBeatAtom);
	const [emptyBeatSymbol, setEmptyBeatSymbol] = useAtom(emptyBeatSymbolAtom);

	const store = useStore();

	const onImport = useCallback(
		(text: string) => {
			const importMode = store.get(importModeAtom);
			const lineSeparatorMode = store.get(lineSeparatorModeAtom);
			const lineSeparator = store.get(lineSeparatorAtom);
			const swapTransAndRoman = store.get(swapTransAndRomanAtom);
			const wordSeparator = store.get(wordSeparatorAtom);
			const enableSpecialPrefix = store.get(enableSpecialPrefixAtom);
			const bgLyricPrefix = store.get(bgLyricPrefixAtom);
			const duetLyricPrefix = store.get(duetLyricPrefixAtom);
			const enableEmptyBeat = store.get(enableEmptyBeatAtom);
			const emptyBeatSymbol = store.get(emptyBeatSymbolAtom);

			const lines = text.split("\n");
			const result: LyricLine[] = [];

			function addLine(orig = "", trans = "", roman = "") {
				let finalOrig = orig;
				let isBG = false;
				let isDuet = false;

				if (enableSpecialPrefix) {
					// Loop through prefix check; separate prefix if present
					while (true) {
						if (finalOrig.startsWith(bgLyricPrefix)) {
							isBG = true;
							finalOrig = finalOrig.slice(bgLyricPrefix.length);
						} else if (finalOrig.startsWith(duetLyricPrefix)) {
							isDuet = true;
							finalOrig = finalOrig.slice(duetLyricPrefix.length);
						} else {
							break;
						}
					}
				}

				const line: LyricLine = {
					...newLyricLine(),
					words: [
						{
							...newLyricWord(),
							word: finalOrig,
						},
					],
					translatedLyric: trans,
					romanLyric: roman,
					isBG,
					isDuet,
				};

				result.push(line);
				return line;
			}

			function addAsLyricOnly() {
				for (const line of lines) {
					addLine(line);
				}
			}

			type KeysMatching<T, V> = NonNullable<
				{ [K in keyof T]: T[K] extends V ? K : never }[keyof T]
			>;

			function addAsLyricWithSub(
				sub1?: KeysMatching<LyricLine, string>,
				sub2?: KeysMatching<LyricLine, string>,
			) {
				switch (lineSeparatorMode) {
					case LineSeparatorMode.Interleaved: {
						let skip = 1;
						if (sub1) skip++;
						if (sub2) skip++;
						for (let i = 0; i < lines.length; i += skip) {
							const orig = lines[i];
							let ii = 0;
							const subText1 = sub1 ? lines[i + ++ii] : "";
							const subText2 = sub2 ? lines[i + ++ii] : "";
							const line = addLine(orig);
							if (sub1) line[sub1] = subText1;
							if (sub2) line[sub2] = subText2;
						}
						return;
					}
					case LineSeparatorMode.SameLineSeparator: {
						for (const lineText of lines) {
							const parts = lineText.split(lineSeparator);
							const orig = parts[0];
							const subText1 = sub1 ? parts[1] : "";
							const subText2 = sub2 ? parts[2] : "";
							const line = addLine(orig);
							if (sub1) line[sub1] = subText1;
							if (sub2) line[sub2] = subText2;
						}
						return;
					}
				}
			}

			switch (importMode) {
				case ImportMode.Lyric:
					addAsLyricOnly();
					break;
				case ImportMode.LyricTrans:
					addAsLyricWithSub("translatedLyric");
					break;
				case ImportMode.LyricRoman:
					addAsLyricWithSub("romanLyric");
					break;
				case ImportMode.LyricTransRoman:
					addAsLyricWithSub("translatedLyric", "romanLyric");
					break;
			}

			if (swapTransAndRoman) {
				for (const line of result) {
					[line.romanLyric, line.translatedLyric] = [
						line.translatedLyric,
						line.romanLyric,
					];
				}
			}

			if (wordSeparator.length > 0) {
				for (const line of result) {
					const wholeLine = line.words.map((word) => word.word).join("");
					line.words = wholeLine.split(wordSeparator).map((word) => ({
						...newLyricWord(),
						word,
					}));
				}
			}

			if (enableEmptyBeat && emptyBeatSymbol.length > 0) {
				for (const line of result) {
					for (const word of line.words) {
						while (word.word.endsWith(emptyBeatSymbol)) {
							word.word = word.word.slice(0, -emptyBeatSymbol.length);
							word.emptyBeat += 1;
						}
					}
				}
			}

			store.set(lyricLinesAtom, {
				lyricLines: result,
				metadata: [],
			});
		},
		[store],
	);

	return (
		<Dialog.Root
			open={importFromTextDialog}
			onOpenChange={setImportFromTextDialog}
		>
			<Dialog.Content maxWidth="100%" maxHeight="100%">
				<Flex direction="column">
					<Flex gap="2" align="center" mb="2">
						<Dialog.Title
							style={{
								flex: "1 1 auto",
							}}
						>
							{t("textImportDialog.title", "Import Plain Text Lyrics")}
						</Dialog.Title>
						<Button
							onClick={() => {
								try {
									const importAction = () => {
										onImport(store.get(textValueAtom));
										setImportFromTextDialog(false);
									};
									if (isDirty)
										setConfirmDialog({
											open: true,
											title: t(
												"confirmDialog.importFile.title",
												"Confirm Import Lyrics",
											),
											description: t(
												"confirmDialog.importFile.description",
												"The current file has unsaved changes. Continuing will lose these changes. Are you sure you want to import lyrics?",
											),
											onConfirm: () => importAction(),
										});
									else importAction();
								} catch (e) {
									error(
										"Failed to import plain text lyrics, please check if input text or import settings are correct",
									);
									projectLogger.error(e);
								}
							}}
						>
							{t("textImportDialog.actionButton", "Import Lyrics")}
						</Button>
					</Flex>
					<Flex
						gap="4"
						direction={{
							initial: "column",
							sm: "row",
						}}
					>
						{/* <Card style={{ flex: "1 1 auto" }}>
							<Inset>
								<TextArea
									style={{
										height: "calc(80vh - 5em)",
										flex: "1 1 auto"
									}}
									value={value}
									onChange={(evt) => setValue(evt.currentTarget.value)}
								/>
							</Inset>
						</Card> */}

						<ImportFromTextEditor />
						<Grid
							columns="2"
							gapY="2"
							gapX="4"
							style={{
								whiteSpace: "nowrap",
								flex: "0 0 auto",
								alignItems: "center",
								alignContent: "start",
								textAlign: "end",
							}}
						>
							<PrefText>
								{t("textImportDialog.contentMode.caption", "Import Mode")}
							</PrefText>
							<Select.Root
								value={importMode}
								onValueChange={(v) => setImportMode(v as ImportMode)}
							>
								<Select.Trigger />
								<Select.Content>
									<Select.Item value={ImportMode.Lyric}>
										{t("textImportDialog.contentMode.lyric", "Lyrics Only")}
									</Select.Item>
									<Select.Item value={ImportMode.LyricTrans}>
										{t(
											"textImportDialog.contentMode.withTranslation",
											"Lyrics & Translated Lyrics",
										)}
									</Select.Item>
									<Select.Item value={ImportMode.LyricRoman}>
										{t(
											"textImportDialog.contentMode.withRoman",
											"Lyrics & Romanized Lyrics",
										)}
									</Select.Item>
									<Select.Item value={ImportMode.LyricTransRoman}>
										{t(
											"textImportDialog.contentMode.withBoth",
											"Lyrics, Translation & Romanized Lyrics",
										)}
									</Select.Item>
								</Select.Content>
							</Select.Root>

							<PrefText>
								{t(
									"textImportDialog.separationMode.caption",
									"Line-separated Lyrics (Translation & Romanization) Mode",
								)}
							</PrefText>
							<Select.Root
								disabled={importMode === ImportMode.Lyric}
								value={lineSeparatorMode}
								onValueChange={(v) =>
									setLineSeparatorMode(v as LineSeparatorMode)
								}
							>
								<Select.Trigger />
								<Select.Content>
									<Select.Item value={LineSeparatorMode.Interleaved}>
										{t(
											"textImportDialog.separationMode.multipleLine",
											"Multi-line Interleaved Separation",
										)}
									</Select.Item>
									<Select.Item value={LineSeparatorMode.SameLineSeparator}>
										{t("textImportDialog.separationMode.sameLine", "Same-line Separation")}
									</Select.Item>
								</Select.Content>
							</Select.Root>

							<PrefText>
								{t("textImportDialog.separator", "Lyric Line Separator")}
							</PrefText>
							<TextField.Root
								disabled={
									importMode === ImportMode.Lyric ||
									lineSeparatorMode !== LineSeparatorMode.SameLineSeparator
								}
								value={lineSeparator}
								onChange={(evt) => setLineSeparator(evt.currentTarget.value)}
							/>

							<PrefText>
								{t("textImportDialog.swapTransAndRoman", "Swap Translation & Romanization Lines")}
							</PrefText>
							<Switch
								checked={swapTransAndRoman}
								onCheckedChange={setSwapTransAndRoman}
							/>

							<PrefText>
								{t("textImportDialog.wordSeparator", "Word Separator")}
							</PrefText>
							<TextField.Root
								value={wordSeparator}
								onChange={(evt) => setWordSeparator(evt.currentTarget.value)}
							/>

							<PrefText>
								{t("textImportDialog.enableSpecialPrefix", "Enable Special Prefixes")}
							</PrefText>
							<Switch
								checked={enableSpecialPrefix}
								onCheckedChange={setEnableSpecialPrefix}
							/>

							<PrefText>
								{t("textImportDialog.bgLyricPrefix", "Background Lyric Prefix")}
							</PrefText>
							<TextField.Root
								disabled={!enableSpecialPrefix}
								value={bgLyricPrefix}
								onChange={(evt) => setBgLyricPrefix(evt.currentTarget.value)}
							/>

							<PrefText>
								{t("textImportDialog.duetLyricPrefix", "Duet Lyric Prefix")}
							</PrefText>
							<TextField.Root
								disabled={!enableSpecialPrefix}
								value={duetLyricPrefix}
								onChange={(evt) => setDuetLyricPrefix(evt.currentTarget.value)}
							/>

							<PrefText>
								{t("textImportDialog.enableEmptyBeat", "Enable Empty Beats")}
							</PrefText>
							<Switch
								checked={enableEmptyBeat}
								onCheckedChange={setEnableEmptyBeat}
							/>

							<PrefText>
								{t("textImportDialog.emptyBeatSymbol", "Empty Beat Symbol")}
							</PrefText>
							<TextField.Root
								disabled={!enableEmptyBeat}
								value={emptyBeatSymbol}
								onChange={(evt) => setEmptyBeatSymbol(evt.currentTarget.value)}
							/>
						</Grid>
					</Flex>
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
};
