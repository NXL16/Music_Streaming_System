import {
	ContentView24Regular,
	History24Regular,
	Keyboard12324Regular,
	LocalLanguage24Regular,
	MusicNote224Regular,
	PaddingLeft24Regular,
	PaddingRight24Regular,
	Save24Regular,
	Speaker224Regular,
	Stack24Regular,
	Timer24Regular,
	TopSpeed24Regular,
	Translate24Regular,
} from "@fluentui/react-icons";
import {
	Flex,
	Select,
	Slider,
	Switch,
	Text,
	TextField,
} from "@radix-ui/themes";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import {
	playbackRateAtom,
	stretchAlgorithmAtom,
	volumeAtom,
} from "$/modules/audio/states";
import type { StretchAlgorithm } from "$/modules/ffmpeg/types";
import {
	autosaveEnabledAtom,
	autosaveIntervalAtom,
	autosaveLimitAtom,
	LayoutMode,
	layoutModeAtom,
	SyncJudgeMode,
	smartFirstWordAtom,
	smartLastWordAtom,
	syncJudgeModeAtom,
	TranslationOutputMode,
	translationOutputModeAtom,
} from "$/modules/settings/states";
import {
	KeyBindingTriggerMode,
	keyBindingTriggerModeAtom,
} from "$/utils/keybindings";
import { SettingsGroup, SettingsRow } from "./SettingsGroup";

export const SettingsCommonTab = () => {
	const [layoutMode, setLayoutMode] = useAtom(layoutModeAtom);
	const [translationOutputMode, setTranslationOutputMode] = useAtom(
		translationOutputModeAtom,
	);
	const [syncJudgeMode, setSyncJudgeMode] = useAtom(syncJudgeModeAtom);
	const [keyBindingTriggerMode, setKeyBindingTriggerMode] = useAtom(
		keyBindingTriggerModeAtom,
	);
	const [smartFirstWord, setSmartFirstWord] = useAtom(smartFirstWordAtom);
	const [smartLastWord, setSmartLastWord] = useAtom(smartLastWordAtom);
	const [volume, setVolume] = useAtom(volumeAtom);
	const [playbackRate, setPlaybackRate] = useAtom(playbackRateAtom);
	const [stretchAlgorithm, setStretchAlgorithm] = useAtom(stretchAlgorithmAtom);
	const [autosaveEnabled, setAutosaveEnabled] = useAtom(autosaveEnabledAtom);
	const [autosaveInterval, setAutosaveInterval] = useAtom(autosaveIntervalAtom);
	const [autosaveLimit, setAutosaveLimit] = useAtom(autosaveLimitAtom);
	const { t, i18n } = useTranslation();
	const currentLanguage = "en-US";
	const languageOptions = ["en-US"];
	const getLanguageName = (_code: string, _locale: string) => "English";

	return (
		<Flex direction="column" gap="4">
			<SettingsGroup title={t("settings.group.display", "Display")}>
				<SettingsRow
					icon={<LocalLanguage24Regular />}
					title={t("settings.common.language", "Interface language")}
					description={t("settings.common.languageDesc", "Choose the language used by the interface.")}
					action={
						<Select.Root
							value={currentLanguage}
							onValueChange={(lng) => {
								i18n.changeLanguage(lng).then(() => {
									localStorage.setItem("language", lng);
								});
							}}
						>
							<Select.Trigger />
							<Select.Content>
								{languageOptions.map((code) => (
									<Select.Item key={code} value={code}>
										{getLanguageName(code, currentLanguage)}
									</Select.Item>
								))}
							</Select.Content>
						</Select.Root>
					}
				/>

				<SettingsRow
					icon={<ContentView24Regular />}
					title={t("settings.common.layoutMode", "Edit Layout Mode")}
					description={
						<>
							{t(
								"settings.common.layoutModeDesc.line1",
								"Simple layout meets the basic needs of most users",
							)}
							<br />
							{t(
								"settings.common.layoutModeDesc.line2",
								"If you need more efficient sync editing, consider switching to advanced mode",
							)}
						</>
					}
					action={
						<Select.Root
							value={layoutMode}
							onValueChange={(v) => setLayoutMode(v as LayoutMode)}
						>
							<Select.Trigger />
							<Select.Content>
								<Select.Item value={LayoutMode.Simple}>
									{t("settings.common.layoutModeOptions.simple", "Simple Mode")}
								</Select.Item>
								<Select.Item value={LayoutMode.Advance}>
									{t("settings.common.layoutModeOptions.advance", "Advanced Mode")}
								</Select.Item>
							</Select.Content>
						</Select.Root>
					}
				/>
			</SettingsGroup>

			<SettingsGroup title={t("settings.group.translationOutput", "Export")}>
				<SettingsRow
					icon={<Translate24Regular />}
					title={t("settings.common.translationOutputMode", "Lyric Export Mode")}
					description={
						<>
							{t(
								"settings.common.translationOutputModeDesc.line1",
								"AMLL style embeds line-by-line translations as x-translation inside lyric lines,",
							)}
							<br />
							{t(
								"settings.common.translationOutputModeDesc.line2",
								"x-bg has line start time and end time.",
							)}
							<br />
							<br />
							{t(
								"settings.common.translationOutputModeDesc.line3",
								"Apple Music style writes translation into iTunesMetadata in <head>,",
							)}
							<br />
							{t(
								"settings.common.translationOutputModeDesc.line4",
								"but does not include x-bg line timing.",
							)}
						</>
					}
					action={
						<Select.Root
							value={translationOutputMode}
							onValueChange={(v) =>
								setTranslationOutputMode(v as TranslationOutputMode)
							}
						>
							<Select.Trigger />
							<Select.Content>
								<Select.Item value={TranslationOutputMode.Amll}>
									{t(
										"settings.common.translationOutputModeOptions.amll",
										"AMLL Style",
									)}
								</Select.Item>
								<Select.Item value={TranslationOutputMode.AppleMusic}>
									{t(
										"settings.common.translationOutputModeOptions.appleMusic",
										"Apple Music Style",
									)}
								</Select.Item>
							</Select.Content>
						</Select.Root>
					}
				/>
			</SettingsGroup>

			<SettingsGroup title={t("settings.group.timing", "Sync Timing")}>
				<SettingsRow
					icon={<Timer24Regular />}
					title={t("settings.common.syncJudgeMode", "Sync Timestamp Judgment Mode")}
					description={t(
						"settings.common.syncJudgeModeDesc",
						'Set sync timestamp judgment mode, defaults to "First key press time".',
					)}
					action={
						<Select.Root
							value={syncJudgeMode}
							onValueChange={(v) => setSyncJudgeMode(v as SyncJudgeMode)}
						>
							<Select.Trigger />
							<Select.Content>
								<Select.Item value={SyncJudgeMode.FirstKeyDownTime}>
									{t(
										"settings.common.syncJudgeModeOptions.firstKeyDown",
										"First key press time",
									)}
								</Select.Item>
								<Select.Item value={SyncJudgeMode.LastKeyUpTime}>
									{t(
										"settings.common.syncJudgeModeOptions.lastKeyUp",
										"Last key release time",
									)}
								</Select.Item>
								<Select.Item value={SyncJudgeMode.MiddleKeyTime}>
									{t(
										"settings.common.syncJudgeModeOptions.middleKey",
										"Midpoint of key press and release",
									)}
								</Select.Item>
								<Select.Item value={SyncJudgeMode.FirstKeyDownTimeLegacy}>
									{t(
										"settings.common.syncJudgeModeOptions.firstKeyDownLegacy",
										"First key press time (Legacy)",
									)}
								</Select.Item>
							</Select.Content>
						</Select.Root>
					}
				/>

				<SettingsRow
					icon={<Keyboard12324Regular />}
					title={t("settings.common.keyBindingTrigger", "Shortcut Trigger Timing")}
					description={t(
						"settings.common.keyBindingTriggerDesc",
						"Whether shortcuts trigger on key press or key release",
					)}
					action={
						<Select.Root
							value={keyBindingTriggerMode}
							onValueChange={(v) =>
								setKeyBindingTriggerMode(v as KeyBindingTriggerMode)
							}
						>
							<Select.Trigger />
							<Select.Content>
								<Select.Item value={KeyBindingTriggerMode.KeyDown}>
									{t(
										"settings.common.keyBindingTriggerOptions.keyDown",
										"Trigger on key press",
									)}
								</Select.Item>
								<Select.Item value={KeyBindingTriggerMode.KeyUp}>
									{t(
										"settings.common.keyBindingTriggerOptions.keyUp",
										"Trigger on key release",
									)}
								</Select.Item>
							</Select.Content>
						</Select.Root>
					}
				/>

				<SettingsRow
					asLabel
					icon={<PaddingLeft24Regular />}
					title={t("settings.common.smartFirstWord", "Smart First Word")}
					description={t(
						"settings.common.smartFirstWordDesc",
						'When syncing the first syllable of a line, pressing "Start Sync" sets start time without setting end time.',
					)}
					action={
						<Switch
							checked={smartFirstWord}
							onCheckedChange={setSmartFirstWord}
						/>
					}
				/>

				<SettingsRow
					asLabel
					icon={<PaddingRight24Regular />}
					title={t("settings.common.smartLastWord", "Smart Last Word")}
					description={t(
						"settings.common.smartLastWordDesc",
						'When syncing the last syllable of a line, pressing "End Sync" sets end time without setting next line start time.',
					)}
					action={
						<Switch
							checked={smartLastWord}
							onCheckedChange={setSmartLastWord}
						/>
					}
				/>
			</SettingsGroup>

			<SettingsGroup title={t("settings.group.playback", "Playback")}>
				<SettingsRow icon={<Speaker224Regular />}>
					<Flex direction="column" gap="2" align="start">
						<Flex
							align="center"
							justify="between"
							style={{ alignSelf: "stretch" }}
						>
							<Text>{t("settings.common.volume", "Music Volume")}</Text>
							<Text wrap="nowrap" color="gray" size="1">
								{(volume * 100).toFixed()}%
							</Text>
						</Flex>
						<Slider
							min={0}
							max={1}
							defaultValue={[volume]}
							step={0.01}
							onValueChange={(v) => setVolume(v[0])}
						/>
					</Flex>
				</SettingsRow>

				<SettingsRow icon={<TopSpeed24Regular />}>
					<Flex direction="column" gap="2" align="start">
						<Flex
							align="center"
							justify="between"
							style={{ alignSelf: "stretch" }}
						>
							<Text>{t("settings.common.playbackRate", "Playback Speed")}</Text>
							<Text wrap="nowrap" color="gray" size="1">
								{playbackRate.toFixed(2)}x
							</Text>
						</Flex>
						<Slider
							min={0.1}
							max={2}
							defaultValue={[playbackRate]}
							step={0.05}
							onValueChange={(v) => setPlaybackRate(v[0])}
						/>
					</Flex>
				</SettingsRow>

				<SettingsRow
					icon={<MusicNote224Regular />}
					title={t("settings.common.stretchAlgorithm", "Audio Time-stretch Algorithm")}
					description={
						stretchAlgorithm === "spectral"
							? t(
									"settings.common.stretchAlgorithmDesc.spectral",
									"Spectral (Phase Vocoder): higher fidelity, slightly higher resource usage",
								)
							: t(
									"settings.common.stretchAlgorithmDesc.wsola",
									"WSOLA (Waveform Similarity Overlap-Add): legacy algorithm, lower quality, low usage",
								)
					}
					action={
						<Select.Root
							value={stretchAlgorithm}
							onValueChange={(v) => setStretchAlgorithm(v as StretchAlgorithm)}
						>
							<Select.Trigger />
							<Select.Content>
								<Select.Item value="spectral">
									{t(
										"settings.common.stretchAlgorithmOptions.spectral",
										"Spectral",
									)}
								</Select.Item>
								<Select.Item value="wsola">
									{t("settings.common.stretchAlgorithmOptions.wsola", "WSOLA")}
								</Select.Item>
							</Select.Content>
						</Select.Root>
					}
				/>
			</SettingsGroup>

			<SettingsGroup title={t("settings.group.autosave", "Autosave")}>
				<SettingsRow
					asLabel
					icon={<Save24Regular />}
					title={t("settings.common.autosave.enable", "Enable Autosave")}
					action={
						<Switch
							checked={autosaveEnabled}
							onCheckedChange={setAutosaveEnabled}
						/>
					}
				/>

				<SettingsRow icon={<History24Regular />}>
					<Flex direction="column" gap="2" align="start">
						<Text>
							{t("settings.common.autosave.interval", "Save Interval (minutes)")}
						</Text>
						<TextField.Root
							type="number"
							disabled={!autosaveEnabled}
							value={autosaveInterval}
							onChange={(e) =>
								setAutosaveInterval(
									Math.max(1, Number.parseInt(e.target.value, 10) || 1),
								)
							}
						/>
					</Flex>
				</SettingsRow>

				<SettingsRow icon={<Stack24Regular />}>
					<Flex direction="column" gap="2" align="start">
						<Flex
							align="center"
							justify="between"
							style={{ alignSelf: "stretch" }}
						>
							<Text>{t("settings.common.autosave.limit", "Snapshots to Retain")}</Text>
							<Text wrap="nowrap" color="gray" size="1">
								{autosaveLimit}
							</Text>
						</Flex>
						<Slider
							min={1}
							max={50}
							disabled={!autosaveEnabled}
							value={[autosaveLimit]}
							step={1}
							onValueChange={(v) => setAutosaveLimit(v[0])}
						/>
					</Flex>
				</SettingsRow>
			</SettingsGroup>
		</Flex>
	);
};
