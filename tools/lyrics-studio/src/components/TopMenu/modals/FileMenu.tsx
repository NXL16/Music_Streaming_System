import { Button, DropdownMenu } from "@radix-ui/themes";
import type { CSSProperties } from "react";
import { Toolbar } from "radix-ui";
import { Trans, useTranslation } from "react-i18next";
import { ImportExportLyric } from "$/modules/project/modals/ImportExportLyric";
import { MusicalLyricsDialog } from "$/modules/musical/MusicalLyricsDialog";
import { formatKeyBindings } from "$/utils/keybindings";
import { useTopMenuActions } from "../useTopMenuActions";

type FileMenuProps = {
	variant: "toolbar" | "submenu";
	buttonStyle?: CSSProperties;
};

const FileMenuItems = () => {
	const { t } = useTranslation();
	const menu = useTopMenuActions();

	return (
		<>
			<DropdownMenu.Item
				onSelect={menu.onNewFile}
				shortcut={formatKeyBindings(menu.newFileKey)}
			>
				<Trans i18nKey="topBar.menu.newLyric">New TTML File</Trans>
			</DropdownMenu.Item>
			<DropdownMenu.Item
				onSelect={menu.onOpenFile}
				shortcut={formatKeyBindings(menu.openFileKey)}
			>
				<Trans i18nKey="topBar.menu.openLyric">Open TTML File</Trans>
			</DropdownMenu.Item>
			<DropdownMenu.Item onSelect={menu.onOpenFileFromClipboard}>
				<Trans i18nKey="topBar.menu.openFromClipboard">
					Open TTML File from Clipboard
				</Trans>
			</DropdownMenu.Item>
			<DropdownMenu.Item
				onSelect={menu.onSaveFile}
				shortcut={formatKeyBindings(menu.saveFileKey)}
			>
				<Trans i18nKey="topBar.menu.saveLyric">Save TTML File</Trans>
			</DropdownMenu.Item>
			<DropdownMenu.Separator />
			<DropdownMenu.Item onSelect={menu.onOpenHistoryRestore}>
				{t("topBar.menu.restoreFromHistory", "Restore from History...")}
			</DropdownMenu.Item>
			<DropdownMenu.Separator />
			<DropdownMenu.Item onSelect={menu.onSaveFileToClipboard}>
				<Trans i18nKey="topBar.menu.saveLyricToClipboard">
					Save TTML File to Clipboard
				</Trans>
			</DropdownMenu.Item>
			<DropdownMenu.Separator />
			<ImportExportLyric />
			<DropdownMenu.Separator />
			<MusicalLyricsDialog />
		</>
	);
};

export const FileMenu = (props: FileMenuProps) => {
	if (props.variant === "submenu") {
		return (
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>
					<Trans i18nKey="topBar.menu.file">File</Trans>
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent>
					<FileMenuItems />
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
		);
	}

	return (
		<DropdownMenu.Root>
			<Toolbar.Button asChild>
				<DropdownMenu.Trigger>
					<Button variant="soft" style={props.buttonStyle}>
						<Trans i18nKey="topBar.menu.file">File</Trans>
					</Button>
				</DropdownMenu.Trigger>
			</Toolbar.Button>
			<DropdownMenu.Content>
				<FileMenuItems />
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	);
};
