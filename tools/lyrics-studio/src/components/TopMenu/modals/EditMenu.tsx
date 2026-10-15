import { Button, DropdownMenu } from "@radix-ui/themes";
import type { CSSProperties } from "react";
import { Toolbar } from "radix-ui";
import { Trans, useTranslation } from "react-i18next";
import { formatKeyBindings } from "$/utils/keybindings";
import { useTopMenuActions } from "../useTopMenuActions";

type EditMenuProps = {
	variant: "toolbar" | "submenu";
	triggerStyle?: CSSProperties;
	buttonStyle?: CSSProperties;
};

const EditMenuItems = () => {
	const { t } = useTranslation();
	const menu = useTopMenuActions();

	return (
		<>
			<DropdownMenu.Item
				onSelect={menu.onUndo}
				shortcut={formatKeyBindings(menu.undoKey)}
				disabled={menu.undoDisabled}
			>
				<Trans i18nKey="topBar.menu.undo">Undo</Trans>
			</DropdownMenu.Item>
			<DropdownMenu.Item
				onSelect={menu.onRedo}
				shortcut={formatKeyBindings(menu.redoKey)}
				disabled={menu.redoDisabled}
			>
				<Trans i18nKey="topBar.menu.redo">Redo</Trans>
			</DropdownMenu.Item>
			<DropdownMenu.Separator />
			<DropdownMenu.Item
				onSelect={menu.onSelectAll}
				shortcut={formatKeyBindings(menu.selectAllLinesKey)}
			>
				<Trans i18nKey="topBar.menu.selectAllLines">Select All Lyric Lines</Trans>
			</DropdownMenu.Item>
			<DropdownMenu.Item
				onSelect={menu.onUnselectAll}
				shortcut={formatKeyBindings(menu.unselectAllLinesKey)}
			>
				<Trans i18nKey="topBar.menu.unselectAllLines">Deselect All Lyric Lines</Trans>
			</DropdownMenu.Item>
			<DropdownMenu.Item
				onSelect={menu.onSelectInverted}
				shortcut={formatKeyBindings(menu.selectInvertedLinesKey)}
			>
				<Trans i18nKey="topBar.menu.invertSelectAllLines">Invert Select All Lyric Lines</Trans>
			</DropdownMenu.Item>
			<DropdownMenu.Item
				onSelect={menu.onSelectWordsOfMatchedSelection}
				shortcut={formatKeyBindings(menu.selectWordsOfMatchedSelectionKey)}
			>
				<Trans i18nKey="topBar.menu.selectWordsOfMatchedSelection">
					Select Word Matches
				</Trans>
			</DropdownMenu.Item>
			<DropdownMenu.Separator />
			<DropdownMenu.Item
				onSelect={menu.onDeleteSelection}
				shortcut={formatKeyBindings(menu.deleteSelectionKey)}
			>
				<Trans i18nKey="contextMenu.deleteWords">Delete Selected Words</Trans>
			</DropdownMenu.Item>
			<DropdownMenu.Separator />
			<DropdownMenu.Item onSelect={menu.onOpenTimeShift}>
				{t("topBar.menu.timeShift", "Time Shift...")}
			</DropdownMenu.Item>
			<DropdownMenu.Separator />
			<DropdownMenu.Item onSelect={menu.onOpenMetadataEditor}>
				<Trans i18nKey="topBar.menu.editMetadata">Edit Lyric Metadata</Trans>
			</DropdownMenu.Item>
			<DropdownMenu.Separator />
			<DropdownMenu.Item onSelect={menu.onOpenSettings}>
				<Trans i18nKey="settingsDialog.title">Preferences</Trans>
			</DropdownMenu.Item>
		</>
	);
};

export const EditMenu = (props: EditMenuProps) => {
	if (props.variant === "submenu") {
		return (
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>
					<Trans i18nKey="topBar.menu.edit">Edit</Trans>
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent>
					<EditMenuItems />
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
		);
	}

	return (
		<DropdownMenu.Root>
			<Toolbar.Button asChild>
				<DropdownMenu.Trigger style={props.triggerStyle}>
					<Button variant="soft" style={props.buttonStyle}>
						<Trans i18nKey="topBar.menu.edit">Edit</Trans>
					</Button>
				</DropdownMenu.Trigger>
			</Toolbar.Button>
			<DropdownMenu.Content>
				<EditMenuItems />
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	);
};
