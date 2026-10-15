import { useAtomValue } from "jotai";
import type { DependencyList } from "react";
import { type KeyBindingCallback, useKeyBinding } from "$/utils/keybindings";
import type { KeyBindingCommand } from "./types";

// biome-ignore lint/correctness/noUnusedVariables: JSDoc
type Commands = typeof import("./commands");

/**
 * Bind shortcut commands in components
 * @param command Registered command object, see {@link Commands commands.ts}
 * @param callback Callback function when triggered
 * @param deps Dependency array (same as useEffect)
 */
export function useCommand(
	command: KeyBindingCommand,
	callback: KeyBindingCallback,
	deps: DependencyList = [],
) {
	const currentKeys = useAtomValue(command.atom);

	useKeyBinding(currentKeys, callback, deps);
}
