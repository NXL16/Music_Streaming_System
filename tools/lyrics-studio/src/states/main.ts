import { atom } from "jotai";
import { atomWithStorage, selectAtom } from "jotai/utils";
import { REDO, UNDO, withHistory } from "jotai-history";
import { uid } from "uid";
import { identifyProject } from "$/modules/project/logic/project-info";
import type { TTMLLyric } from "../types/ttml";

export enum DarkMode {
	Auto = "auto",
	Light = "light",
	Dark = "dark",
}

export enum ToolMode {
	Edit = "edit",
	Sync = "sync",
	Preview = "preview",
}

export const toolModeAtom = atom(ToolMode.Edit);
export const darkModeAtom = atomWithStorage("darkMode", DarkMode.Auto);
export const isDarkThemeAtom = atom((get) => {
	if (get(darkModeAtom) === DarkMode.Auto) return get(autoDarkModeAtom);
	return get(darkModeAtom) === DarkMode.Dark;
});
export const autoDarkModeAtom = atom(true);

// Lyric line edit context
export const lyricLinesAtom = atom({
	lyricLines: [],
	metadata: [],
} as TTMLLyric);

/**
 * @description Unique identifier of current project
 *
 * - Generates a random UUID on app open and new file creation
 * - Attempts to match historical projects in database when opening file; reuses ID if matched, else generates new ID
 */
export const projectIdAtom = atom(uid());

export const rubyWarningShownProjectIdsAtom = atom(new Set<string>());

/**
 * @description Display identity info of current project, used for displaying project name in UI
 * @readonly
 */
export const projectIdentityAtom = atom((get) => {
	const lyrics = get(lyricLinesAtom);
	return identifyProject(lyrics);
});

/**
 * @description Autosave state
 */
export enum SaveStatus {
	/**
	 * @description Saved, current editor content matches database
	 */
	Saved = "saved",
	/**
	 * @description Waiting to save
	 */
	Pending = "pending",
	/**
	 * @description Saving in progress
	 */
	Saving = "saving",
}

/**
 * @description Current autosave status
 */
export const saveStatusAtom = atom<SaveStatus>(SaveStatus.Saved);

/**
 * @description Timestamp of last autosave
 */
export const lastSavedTimeAtom = atom<number | null>(null);

export const undoableLyricLinesAtom = withHistory(lyricLinesAtom, 256);
export const isDirtyAtom = atom((get) => get(undoableLyricLinesAtom).canUndo);
export const undoLyricLinesAtom = atom(null, (_get, set) => {
	set(undoableLyricLinesAtom, UNDO);
});
export const redoLyricLinesAtom = atom(null, (_get, set) => {
	set(undoableLyricLinesAtom, REDO);
});
export const editingWordStateAtom = atom({
	wordIndex: -1,
	lineIndex: -1,
	word: "",
});
export const newLyricLinesAtom = atom(
	null,
	(
		_get,
		set,
		newState: TTMLLyric = {
			lyricLines: [],
			metadata: [],
		},
	) => {
		set(lyricLinesAtom, newState);
		set(selectedLinesAtom, new Set());
		set(selectedWordsAtom, new Set());
	},
);
export const selectedLinesAtom = atom(new Set<string>());
export const selectedWordsAtom = atom(new Set<string>());

export const saveFileNameAtom = atom("lyric.ttml");

export const showUnselectedLinesAtom = atomWithStorage(
	"showUnselectedLines",
	true,
);
export const bgLyricIgnoreSyncAtom = atom(false);
export const showEndTimeAsDurationAtom = atom(false);

export interface EditingTimeFieldState {
	isWord: boolean;
	field: "startTime" | "endTime";
}

export const editingTimeFieldAtom = atom<EditingTimeFieldState | null>(null);

export const requestFocusAtom = atom<string | null>(null);

/**
 * @description Controls display of global file drag overlay
 */
export const isGlobalFileDraggingAtom = atom(false);

/**
 * Whether lyric line is currently being dragged
 */
export const isDraggingGlobalAtom = atom(false);

/**
 * Number of lines currently being dragged
 */
export const draggedCountAtom = atom(0);

/**
 * Where the drag operation was triggered
 */
export const dragSourceAtom = atom<"main" | "outline" | null>(null);

/**
 * Whether current drag is in copy mode
 */
export const isCopyModeAtom = atom(false);

/**
 * Atom used to trigger locate current line event
 */
export const locateActionAtom = atom(0);

/**
 * ID array updated only on line add/delete/reorder
 */
export const lyricLineIdsAtom = selectAtom(
	lyricLinesAtom,
	(state) => state.lyricLines.map((line) => line.id),
	(prev, next) =>
		prev.length === next.length && prev.every((id, i) => id === next[i]),
);

/**
 * ID -> Index hash map updated only on ID structure change
 *
 * Used for O(1) line number lookup
 */
export const lyricIdToIndexMapAtom = selectAtom(lyricLineIdsAtom, (ids) => {
	const map = new Map<string, number>();
	ids.forEach((id, index) => {
		map.set(id, index);
	});
	return map;
});
