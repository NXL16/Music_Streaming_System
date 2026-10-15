import { InfoRegular } from "@fluentui/react-icons";
import { Button, Callout, Dialog, Flex } from "@radix-ui/themes";
import { useAtom } from "jotai";
import { useSetImmerAtom } from "jotai-immer";
import { useTranslation } from "react-i18next";
import {
	DialogScopeSelector,
	useDialogScope,
} from "$/hooks/useDialogScope.tsx";
import { predictLineRomanization } from "$/modules/segmentation/utils/Transliteration/distributor";
import { applyRomanizationWarnings } from "$/modules/segmentation/utils/Transliteration/roman-warning";
import { distributeRomanizationDialogAtom } from "$/states/dialogs";
import { lyricLinesAtom } from "$/states/main";
import { projectLogger } from "../logger";

export const DistributeRomanizationDialog = () => {
	const { t } = useTranslation();
	const [open, setOpen] = useAtom(distributeRomanizationDialogAtom);
	const setLyricLines = useSetImmerAtom(lyricLinesAtom);
	const scopeState = useDialogScope(open);

	const handleConfirm = () => {
		const targetLineIndices = scopeState.getTargetLineIndices();

		setLyricLines((draft) => {
			draft.lyricLines.forEach((line, index) => {
				if (targetLineIndices.has(index)) {
					const fullRoman = line.romanLyric || "";
					if (line.words.length > 0 && fullRoman.trim() !== "") {
						try {
							const results = predictLineRomanization(line.words, fullRoman);

							line.words.forEach((word, wordIndex) => {
								if (results[wordIndex]) {
									word.romanWord = results[wordIndex];
								}
							});
							applyRomanizationWarnings(line.words);
						} catch (e) {
							projectLogger.error(
								`Failed to distribute romanization for line ${index + 1}`,
								e,
							);
						}
					}
				}
			});
		});

		setOpen(false);
	};

	return (
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<Dialog.Content maxWidth="450px">
				<Dialog.Title>
					{t("distributeRomanDialog.title", "Apply Line Romanization to Words")}
				</Dialog.Title>

				<Flex direction="column" gap="4">
					<Callout.Root color="gray" size="1">
						<Callout.Icon>
							<InfoRegular />
						</Callout.Icon>
						<Callout.Text>
							{t(
								"distributeRomanDialog.warning",
								"This feature reads line-wide romanization and distributes it to each word automatically. The algorithm is designed for Japanese Romaji and may perform poorly on other languages.",
							)}
						</Callout.Text>
					</Callout.Root>

					<DialogScopeSelector {...scopeState} />
				</Flex>

				<Flex gap="3" mt="5" justify="end">
					<Dialog.Close>
						<Button variant="soft" color="gray">
							{t("common.cancel", "Cancel")}
						</Button>
					</Dialog.Close>
					<Button onClick={handleConfirm}>{t("common.apply", "Apply")}</Button>
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
};
