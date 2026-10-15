import { Checkbox, Grid, Text, TextField } from "@radix-ui/themes";
import { useAtom } from "jotai";
import { forwardRef } from "react";
import { useTranslation } from "react-i18next";
import {
	hideObsceneWordsAtom,
	lyricWordFadeWidthAtom,
	showRomanLinesAtom,
	showTranslationLinesAtom,
} from "$/modules/settings/states/preview";
import { RibbonFrame, RibbonSection } from "./common";

export const PreviewModeRibbonBar = forwardRef<HTMLDivElement>(
	(_props, ref) => {
		const [showTranslationLine, setShowTranslationLine] = useAtom(
			showTranslationLinesAtom,
		);
		const [showRomanLine, setShowRomanLine] = useAtom(showRomanLinesAtom);
		const [hideObsceneWords, setHideObsceneWords] =
			useAtom(hideObsceneWordsAtom);
		const [lyricWordFadeWidth, setLyricWordFadeWidth] = useAtom(
			lyricWordFadeWidthAtom,
		);
		const { t } = useTranslation();

		return (
			<RibbonFrame ref={ref}>
				<RibbonSection label={t("ribbonBar.previewMode.lyrics", "Lyrics")}>
					<Grid columns="0fr 0fr" gap="2" gapY="1" flexGrow="1" align="center">
						<Text wrap="nowrap" size="1">
							{t("ribbonBar.previewMode.showTranslation", "Show Translation")}
						</Text>
						<Checkbox
							checked={showTranslationLine}
							onCheckedChange={(v) => setShowTranslationLine(!!v)}
						/>
						<Text wrap="nowrap" size="1">
							{t("ribbonBar.previewMode.showRoman", "Show Romanization")}
						</Text>
						<Checkbox
							checked={showRomanLine}
							onCheckedChange={(v) => setShowRomanLine(!!v)}
						/>
						<Text wrap="nowrap" size="1">
							{t("ribbonBar.previewMode.maskObsceneWords", "Mask Obscene Words")}
						</Text>
						<Checkbox
							checked={hideObsceneWords}
							onCheckedChange={(v) => setHideObsceneWords(!!v)}
						/>
					</Grid>
				</RibbonSection>
				<RibbonSection label={t("ribbonBar.previewMode.word", "Word")}>
					<Grid columns="0fr 0fr" gap="2" gapY="1" flexGrow="1" align="center">
						<Text wrap="nowrap" size="1">
							{t("ribbonBar.previewMode.fadeWidth", "Fade Width")}
						</Text>
						<TextField.Root
							min={0}
							step={0}
							size="1"
							style={{
								width: "4em",
							}}
							defaultValue={lyricWordFadeWidth}
							onBlur={(e) => {
								const value = Number.parseFloat(e.target.value);
								if (Number.isFinite(value)) {
									setLyricWordFadeWidth(value);
								}
							}}
						/>
					</Grid>
				</RibbonSection>
			</RibbonFrame>
		);
	},
);

export default PreviewModeRibbonBar;
