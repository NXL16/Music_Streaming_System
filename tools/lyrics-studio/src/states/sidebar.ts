import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

/**
 * IDs of tabs that can appear in the sidebar.
 */
export type SidebarTabId = "outline" | "bpm";

/**
 * Panel types that can appear in the sidebar.
 *
 * "none" means the sidebar is closed.
 */
export type SidebarPanelType = "none" | SidebarTabId;

/**
 * Currently open sidebar tabs.
 */
export const openSidebarTabsAtom = atomWithStorage<SidebarTabId[]>(
	"openSidebarTabs",
	["outline"],
);

const baseActiveSidebarTabAtom = atomWithStorage<SidebarPanelType>(
	"activeSidebarTab",
	"outline",
);

/**
 * Currently active sidebar panel.
 *
 * Setting this to "none" closes the sidebar and clears openSidebarTabsAtom.
 */
export const activeSidebarTabAtom = atom(
	(get) => {
		const active = get(baseActiveSidebarTabAtom);
		const openTabs = get(openSidebarTabsAtom);
		if (active !== "none" && !openTabs.includes(active as SidebarTabId)) {
			return openTabs.length > 0 ? openTabs[openTabs.length - 1] : "none";
		}
		return active;
	},
	(
		get,
		set,
		update: SidebarPanelType | ((prev: SidebarPanelType) => SidebarPanelType),
	) => {
		const nextValue =
			typeof update === "function"
				? update(get(baseActiveSidebarTabAtom))
				: update;
		set(baseActiveSidebarTabAtom, nextValue);
		if (nextValue === "none") {
			set(openSidebarTabsAtom, []);
		}
	},
);

/**
 * Opens and activates a tab.
 */
export const openTabAtom = atom(null, (get, set, tabId: SidebarTabId) => {
	const currentOpen = get(openSidebarTabsAtom);
	if (!currentOpen.includes(tabId)) {
		set(openSidebarTabsAtom, [...currentOpen, tabId]);
	}
	set(activeSidebarTabAtom, tabId);
});

/**
 * Closes a tab.
 */
export const closeTabAtom = atom(null, (get, set, tabId: SidebarTabId) => {
	const currentOpen = get(openSidebarTabsAtom);
	const newOpen = currentOpen.filter((id) => id !== tabId);
	set(openSidebarTabsAtom, newOpen);

	const activeTab = get(activeSidebarTabAtom);
	if (activeTab === tabId) {
		if (newOpen.length > 0) {
			set(activeSidebarTabAtom, newOpen[newOpen.length - 1]);
		} else {
			set(activeSidebarTabAtom, "none");
		}
	}
});

/**
 * Toggles a tab's open state.
 */
export const toggleTabAtom = atom(
	null,
	(get, set, { tabId, open }: { tabId: SidebarTabId; open: boolean }) => {
		if (open) {
			const currentOpen = get(openSidebarTabsAtom);
			if (!currentOpen.includes(tabId)) {
				set(openSidebarTabsAtom, [...currentOpen, tabId]);
			}
			set(activeSidebarTabAtom, tabId);
		} else {
			const currentOpen = get(openSidebarTabsAtom);
			const newOpen = currentOpen.filter((id) => id !== tabId);
			set(openSidebarTabsAtom, newOpen);

			const activeTab = get(activeSidebarTabAtom);
			if (activeTab === tabId) {
				if (newOpen.length > 0) {
					set(activeSidebarTabAtom, newOpen[newOpen.length - 1]);
				} else {
					set(activeSidebarTabAtom, "none");
				}
			}
		}
	},
);

/**
 * Sidebar width.
 */
export const sidebarWidthAtom = atomWithStorage("sidebarWidth", 300);

/**
 * Event atom used to trigger an editor jump.
 */
export const outlineJumpActionAtom = atom<{ id: string; ts: number } | null>(
	null,
);
