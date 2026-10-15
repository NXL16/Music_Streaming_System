import type { ParseKeys } from "i18next";
import type { WritableAtom } from "jotai";
import type { RESET_KEYBINDING } from "$/utils/keybindings";

export type I18nKey = ParseKeys<"translation">;
export type KeyBindingsConfig = string[];

export interface KeyBindingCommand {
	/** Unique identifier. */
	id: string;
	/** Default key combination. */
	defaultKeys: KeyBindingsConfig;
	/** i18n key displayed in the interface. */
	description: I18nKey;
	/** Category in the settings panel. */
	category: string;
	/**
	 * Corresponding Jotai atom.
	 */
	atom: WritableAtom<
		KeyBindingsConfig,
		[update?: KeyBindingsConfig | typeof RESET_KEYBINDING | undefined],
		Promise<void>
	>;
}
