import {
	Add16Regular,
	AlbumRegular,
	Delete16Regular,
	Info16Regular,
	MusicNote1Regular,
	NumberSymbol16Regular,
	Open16Regular,
	Person16Regular,
} from "@fluentui/react-icons";
import {
	Button,
	Dialog,
	Flex,
	Heading,
	IconButton,
	Text,
	TextField,
} from "@radix-ui/themes";
import { AnimatePresence, motion } from "framer-motion";
import { useAtom } from "jotai";
import { useImmerAtom } from "jotai-immer";
import {
	memo,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { metadataEditorDialogAtom } from "$/states/dialogs.ts";
import { lyricLinesAtom } from "$/states/main.ts";
import type { TTMLLyric, TTMLMetadata } from "$/types/ttml";
import styles from "./MetadataEditor.module.css";
import {
	AppleMusicIcon,
	GithubIcon,
	NeteaseIcon,
	QQMusicIcon,
	SpotifyIcon,
} from "./PlatformIcons";

interface SelectOption {
	label: string;
	value: string;
	icon: ReactNode;
	isLinkable?: boolean;
	urlFormatter?: (value: string) => string | null;
	validation?: {
		verifier: (value: string) => boolean;
		message: string;
		/** red for true, orange for false */
		severe?: boolean;
	};
}

interface MetadataItemEditorProps {
	entry: TTMLMetadata | null;
	option: SelectOption;
	setLyricLines: (args: (prev: TTMLLyric) => void) => void;
}

const contentTransition = {
	duration: 0.25,
	ease: [0.4, 0, 0.2, 1],
} as const;

const contentVariants = {
	initial: { opacity: 0, y: 12 },
	animate: { opacity: 1, y: 0 },
} as const;

const splitDroppedValues = (text: string) =>
	text
		.split(/[\n,;/，；、|\\]/)
		.map((s) => s.trim())
		.filter((s) => s !== "");

const getMetadataValueKey = (metadataKey: string, position: number) =>
	`${metadataKey}-${position}`;

const MetadataItemEditor = memo(
	({ entry, option, setLyricLines }: MetadataItemEditorProps) => {
		const { t } = useTranslation();
		const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
		const [focusIndex, setFocusIndex] = useState<number | null>(null);
		const [isDraggingCategory, setIsDraggingCategory] = useState(false);
		const [dragInputIndex, setDragInputIndex] = useState<number | null>(null);
		const values = entry?.value ?? [];
		const validation = option.validation;

		useEffect(() => {
			if (focusIndex === null) return;

			const targetInput = inputRefs.current[focusIndex];
			if (targetInput) {
				targetInput.focus();
				const len = targetInput.value.length;
				targetInput.setSelectionRange(len, len);
			}
			setFocusIndex(null);
		}, [focusIndex]);

		const editEntry = useCallback(
			(editor: (metadata: TTMLMetadata) => void) => {
				setLyricLines((prev) => {
					let metadata = prev.metadata.find(
						(item) => item.key === option.value,
					);
					if (!metadata) {
						metadata = { key: option.value, value: [] };
						prev.metadata.push(metadata);
					}
					editor(metadata);
				});
			},
			[option.value, setLyricLines],
		);

		const updateValue = useCallback(
			(index: number, value: string) => {
				editEntry((metadata) => {
					metadata.value[index] = value;
				});
			},
			[editEntry],
		);

		const addValue = useCallback(
			(value = "") => {
				editEntry((metadata) => {
					metadata.value.push(value);
				});
				setFocusIndex(values.length);
			},
			[editEntry, values.length],
		);

		const removeValue = useCallback(
			(index: number) => {
				setLyricLines((prev) => {
					const metadataIndex = prev.metadata.findIndex(
						(item) => item.key === option.value,
					);
					if (metadataIndex === -1) return;

					prev.metadata[metadataIndex].value.splice(index, 1);
					if (prev.metadata[metadataIndex].value.length === 0) {
						prev.metadata.splice(metadataIndex, 1);
					}
				});
			},
			[option.value, setLyricLines],
		);

		const appendDroppedValues = useCallback(
			(text: string) => {
				const parts = splitDroppedValues(text);
				if (parts.length === 0) return;

				editEntry((metadata) => {
					const existingSet = new Set<string>();
					const emptyIndices: number[] = [];

					metadata.value.forEach((val, i) => {
						if (val.trim() === "") {
							emptyIndices.push(i);
						} else {
							existingSet.add(val);
						}
					});

					for (const part of parts) {
						if (existingSet.has(part)) continue;

						if (emptyIndices.length > 0) {
							const slotIndex = emptyIndices.shift();
							if (slotIndex !== undefined) metadata.value[slotIndex] = part;
						} else {
							metadata.value.push(part);
						}
						existingSet.add(part);
					}
				});
			},
			[editEntry],
		);

		const rowHasError = validation
			? values.some((val) => val.trim() !== "" && !validation.verifier(val))
			: false;
		const rowHasDuplicate = useMemo(() => {
			const filledValues = values.filter((v) => v.trim() !== "");
			return new Set(filledValues).size !== filledValues.length;
		}, [values]);

		return (
			<div
				className={`${styles.editorPanel} ${
					isDraggingCategory ? styles.dragOverCategory : ""
				}`}
				onDragOver={(e) => {
					e.preventDefault();
					setIsDraggingCategory(true);
				}}
				onDragLeave={(e) => {
					if (!e.currentTarget.contains(e.relatedTarget as Node)) {
						setIsDraggingCategory(false);
					}
				}}
				onDrop={(e) => {
					e.preventDefault();
					setIsDraggingCategory(false);
					appendDroppedValues(e.dataTransfer.getData("text"));
				}}
			>
				<div className={styles.valueList}>
					{values.length === 0 && (
						<div className={styles.emptyState}>
							<Text color="gray">
								{t("metadataDialog.emptyItem", "No items added yet")}
							</Text>
						</div>
					)}
					{values.map((value, index) => {
						const itemHasError = validation
							? value.trim() !== "" && !validation.verifier(value)
							: false;
						const isDuplicate =
							value.trim() !== "" &&
							values.filter((item) => item === value).length > 1;
						const hasAnyError = itemHasError || isDuplicate;
						const url = option.urlFormatter?.(value);
						const isValid = validation ? validation.verifier(value) : true;
						const isButtonEnabled = !!url && isValid;

						return (
							<Flex
								key={getMetadataValueKey(option.value, index)}
								gap="2"
								align="center"
								className={styles.valueRow}
							>
								<TextField.Root
									data-metadata-input="true"
									ref={(el) => {
										inputRefs.current[index] = el;
									}}
									value={value}
									className={`${styles.metadataInput} ${
										dragInputIndex === index ? styles.dragOverInput : ""
									}`}
									onChange={(e) => updateValue(index, e.currentTarget.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											addValue();
										} else if (
											e.key === "Backspace" &&
											e.currentTarget.value === ""
										) {
											if (e.repeat) return;

											e.preventDefault();
											removeValue(index);
											setFocusIndex(index > 0 ? index - 1 : 0);
										}
									}}
									onDragOver={(e) => {
										e.preventDefault();
										e.stopPropagation();
										setDragInputIndex(index);
									}}
									onDragLeave={() => setDragInputIndex(null)}
									onDrop={(e) => {
										e.preventDefault();
										e.stopPropagation();
										setDragInputIndex(null);
										setIsDraggingCategory(false);
										const text = e.dataTransfer.getData("text");
										if (text) updateValue(index, text);
									}}
									variant={hasAnyError ? "soft" : "surface"}
									color={
										itemHasError
											? validation?.severe
												? "red"
												: "orange"
											: isDuplicate
												? "red"
												: undefined
									}
								/>
								{option.isLinkable && (
									<IconButton
										disabled={!isButtonEnabled}
										asChild={isButtonEnabled}
										variant="soft"
										title={t("metadataDialog.openLink", "Open Link")}
									>
										{isButtonEnabled ? (
											<a
												href={url || ""}
												target="_blank"
												rel="noopener noreferrer"
											>
												<Open16Regular />
											</a>
										) : (
											<Open16Regular />
										)}
									</IconButton>
								)}
								<IconButton variant="soft" onClick={() => removeValue(index)}>
									<Delete16Regular />
								</IconButton>
							</Flex>
						);
					})}
				</div>

				{validation && rowHasError && (
					<Text
						color={validation.severe ? "red" : "orange"}
						size="1"
						wrap="wrap"
					>
						{validation.message}
					</Text>
				)}
				{rowHasDuplicate && (
					<Text color="red" size="1" wrap="wrap">
						{t("metadataDialog.duplicateMsg", "Duplicate metadata values exist")}
					</Text>
				)}
				<Button variant="soft" onClick={() => addValue()}>
					<Add16Regular />
					{t("metadataDialog.addValue", "Add")}
				</Button>
			</div>
		);
	},
);

export const MetadataEditor = () => {
	const [metadataEditorDialog, setMetadataEditorDialog] = useAtom(
		metadataEditorDialogAtom,
	);
	const [customKey, setCustomKey] = useState("");
	const [lyricLines, setLyricLines] = useImmerAtom(lyricLinesAtom);

	const { t } = useTranslation();

	const builtinOptions: SelectOption[] = useMemo<SelectOption[]>(() => {
		const numeric = (value: string) => /^\d+$/.test(value);
		const alphanumeric = (value: string) => /^[a-zA-Z0-9]+$/.test(value);

		const getPlatformUrl = (key: string, value: string) => {
			if (!value?.trim()) return null;

			switch (key) {
				case "ncmMusicId":
					return `https://music.163.com/#/song?id=${value}`;
				case "qqMusicId":
					return `https://y.qq.com/n/ryqq/songDetail/${value}`;
				case "spotifyId":
					return `https://open.spotify.com/track/${value}`;
				case "appleMusicId":
					return `https://music.apple.com/song/${value}`;
				case "ttmlAuthorGithubLogin":
					return `https://github.com/${value}`;
				case "isrc":
					return `https://isrcsearch.ifpi.org/?tab=%22code%22&isrcCode=%22${value}%22`;
				default:
					return null;
			}
		};
		return [
			{
				label: t("metadataDialog.builtinOptions.musicName", "Song Title"),
				value: "musicName",
				icon: <MusicNote1Regular />,
			},
			{
				label: t("metadataDialog.builtinOptions.artists", "Song Artist(s)"),
				value: "artists",
				icon: <Person16Regular />,
				validation: {
					verifier: (value: string) => !/^.+[,;&，；、].+$/.test(value),
					message: t(
						"metadataDialog.builtinOptions.artistsInvalidMsg",
						"If there are multiple artists, please add this key multiple times instead of using delimiters",
					),
				},
			},
			{
				label: t("metadataDialog.builtinOptions.songwriter", "Songwriter(s)"),
				value: "songwriter",
				icon: <Person16Regular />,
				validation: {
					verifier: (value: string) => !/^.+[,;&，；、].+$/.test(value),
					message: t(
						"metadataDialog.builtinOptions.songwriterInvalidMsg",
						"If there are multiple songwriters, please add this key multiple times instead of using delimiters",
					),
				},
			},
			{
				label: t("metadataDialog.builtinOptions.album", "Album Title"),
				value: "album",
				icon: <AlbumRegular />,
			},
			{
				label: t("metadataDialog.builtinOptions.ncmMusicId", "Netease Cloud Music ID"),
				value: "ncmMusicId",
				icon: <NeteaseIcon />,
				isLinkable: true,
				urlFormatter: (val: string) => getPlatformUrl("ncmMusicId", val),
				validation: {
					verifier: numeric,
					message: t(
						"metadataDialog.builtinOptions.ncmMusicIdInvalidMsg",
						"Netease Cloud Music ID should be numbers only",
					),
					severe: true,
				},
			},
			{
				label: t("metadataDialog.builtinOptions.qqMusicId", "QQ Music ID"),
				value: "qqMusicId",
				icon: <QQMusicIcon />,
				isLinkable: true,
				urlFormatter: (val: string) => getPlatformUrl("qqMusicId", val),
				validation: {
					verifier: alphanumeric,
					message: t(
						"metadataDialog.builtinOptions.qqMusicIdInvalidMsg",
						"QQ Music ID should be alphanumeric",
					),
					severe: true,
				},
			},
			{
				label: t("metadataDialog.builtinOptions.spotifyId", "Spotify Music ID"),
				value: "spotifyId",
				icon: <SpotifyIcon />,
				isLinkable: true,
				urlFormatter: (val: string) => getPlatformUrl("spotifyId", val),
				validation: {
					verifier: alphanumeric,
					message: t(
						"metadataDialog.builtinOptions.spotifyIdInvalidMsg",
						"Spotify ID should be alphanumeric",
					),
					severe: true,
				},
			},
			{
				label: t(
					"metadataDialog.builtinOptions.appleMusicId",
					"Apple Music ID",
				),
				value: "appleMusicId",
				icon: <AppleMusicIcon />,
				isLinkable: true,
				urlFormatter: (val: string) => getPlatformUrl("appleMusicId", val),
				validation: {
					verifier: numeric,
					message: t(
						"metadataDialog.builtinOptions.appleMusicIdInvalidMsg",
						"Apple Music ID should be numbers only",
					),
					severe: true,
				},
			},
			{
				label: t("metadataDialog.builtinOptions.isrc", "Song ISRC Number"),
				value: "isrc",
				icon: <NumberSymbol16Regular />,
				validation: {
					verifier: (value: string) =>
						/^[A-Z]{2}-?[A-Z0-9]{3}-?\d{2}-?\d{5}$/.test(value),
					message: t(
						"metadataDialog.builtinOptions.isrcInvalidMsg",
						"ISRC format should be CC-XXX-YY-NNNNN",
					),
					severe: true,
				},
			},
			{
				label: t(
					"metadataDialog.builtinOptions.ttmlAuthorGithub",
					"Lyric Author GitHub ID",
				),
				value: "ttmlAuthorGithub",
				icon: <GithubIcon />,
				validation: {
					verifier: numeric,
					message: t(
						"metadataDialog.builtinOptions.ttmlAuthorGithubInvalidMsg",
						"GitHub ID should be numbers only",
					),
					severe: true,
				},
			},
			{
				label: t(
					"metadataDialog.builtinOptions.ttmlAuthorGithubLogin",
					"Lyric Author GitHub Username",
				),
				value: "ttmlAuthorGithubLogin",
				icon: <GithubIcon />,
				isLinkable: true,
				urlFormatter: (val: string) =>
					getPlatformUrl("ttmlAuthorGithubLogin", val),
				validation: {
					verifier: (value: string) =>
						/^(?!.*--)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(
							value,
						),
					message: t(
						"metadataDialog.builtinOptions.ttmlAuthorGithubLoginInvalidMsg",
						"GitHub username should be alphanumeric or hyphens, up to 39 characters",
					),
					severe: true,
				},
			},
		].filter((option) =>
			["musicName", "artists", "songwriter", "album", "isrc"].includes(
				option.value,
			),
		);
	}, [t]);

	const customOptions: SelectOption[] = useMemo(
		() =>
			lyricLines.metadata
				.filter(
					(metadata) =>
						!builtinOptions.some((option) => option.value === metadata.key),
				)
				.map((metadata) => ({
					label: metadata.key,
					value: metadata.key,
					icon: <Info16Regular />,
				})),
		[builtinOptions, lyricLines.metadata],
	);
	const navOptions = useMemo(
		() => [...builtinOptions, ...customOptions],
		[builtinOptions, customOptions],
	);
	const [activeKey, setActiveKey] = useState(
		() => builtinOptions[0]?.value ?? "",
	);
	const activeOption =
		navOptions.find((option) => option.value === activeKey) ?? navOptions[0];
	const activeEntry =
		lyricLines.metadata.find(
			(metadata) => metadata.key === activeOption?.value,
		) ?? null;

	useEffect(() => {
		if (activeOption) return;
		setActiveKey(builtinOptions[0]?.value ?? "");
	}, [activeOption, builtinOptions]);

	const addCustomKey = useCallback(() => {
		const nextKey = customKey.trim();
		if (!nextKey) return;

		setLyricLines((prev) => {
			if (!prev.metadata.some((metadata) => metadata.key === nextKey)) {
				prev.metadata.push({ key: nextKey, value: [] });
			}
		});
		setActiveKey(nextKey);
		setCustomKey("");
	}, [customKey, setLyricLines]);

	const clearAllMetadata = useCallback(() => {
		setLyricLines((prev) => {
			prev.metadata = [];
		});
		setActiveKey(builtinOptions[0]?.value ?? "");
	}, [builtinOptions, setLyricLines]);

	return (
		<Dialog.Root
			open={metadataEditorDialog}
			onOpenChange={setMetadataEditorDialog}
		>
			<Dialog.Content className={styles.dialogContent}>
				<Dialog.Title className={styles.srOnly}>
					{t("metadataDialog.title", "Metadata Editor")}
				</Dialog.Title>

				<aside className={styles.sidebar}>
					<Text as="div" weight="bold" size="2" className={styles.sidebarTitle}>
						{t("metadataDialog.title", "Metadata Editor")}
					</Text>
					<nav className={styles.navList}>
						{navOptions.map((option) => {
							const selected = activeOption?.value === option.value;
							const entry = lyricLines.metadata.find(
								(metadata) => metadata.key === option.value,
							);
							const valueCount =
								entry?.value.filter((value) => value.trim() !== "").length ?? 0;

							return (
								<button
									key={option.value}
									type="button"
									className={styles.navItem}
									data-active={selected || undefined}
									onClick={() => setActiveKey(option.value)}
								>
									<span className={styles.navIcon}>{option.icon}</span>
									<span className={styles.navItemText}>{option.label}</span>
									{valueCount > 0 && (
										<span className={styles.navBadge}>{valueCount}</span>
									)}
								</button>
							);
						})}
					</nav>
					<div className={styles.customKeyForm}>
						<TextField.Root
							placeholder={t("metadataDialog.customKey", "Custom Key Name")}
							value={customKey}
							onChange={(e) => setCustomKey(e.currentTarget.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									addCustomKey();
								}
							}}
						/>
						<IconButton variant="soft" onClick={addCustomKey}>
							<Add16Regular />
						</IconButton>
					</div>
				</aside>

				<section className={styles.mainPane}>
					<header className={styles.header}>
						<div className={styles.titleBlock}>
							<Heading size="7" className={styles.pageTitle}>
								{activeOption?.label}
							</Heading>
							{activeOption && (
								<Text size="2" color="gray" className={styles.titleMeta}>
									{activeOption.value}
								</Text>
							)}
						</div>
					</header>

					<div className={styles.scrollContent}>
						<AnimatePresence mode="wait" initial={false}>
							{activeOption && (
								<motion.div
									key={activeOption.value}
									className={styles.contentTransition}
									variants={contentVariants}
									initial="initial"
									animate="animate"
									transition={contentTransition}
								>
									<MetadataItemEditor
										entry={activeEntry}
										option={activeOption}
										setLyricLines={setLyricLines}
									/>
								</motion.div>
							)}
						</AnimatePresence>
					</div>

					<Flex
						gap="2"
						direction={{
							sm: "row",
							initial: "column",
						}}
						className={styles.dialogFooter}
					>
						<Button
							style={{ flex: "1 0 auto" }}
							color="red"
							variant="solid"
							onClick={clearAllMetadata}
						>
							<Delete16Regular />
							{t("metadataDialog.clear", "Clear")}
						</Button>
					</Flex>
				</section>
			</Dialog.Content>
		</Dialog.Root>
	);
};
