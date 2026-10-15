import type { TTMLLyric } from "$/types/ttml";

/**
 * @description List of metadata keys used for identifying projects.
 * Sorted by priority from high to low; if matching an earlier ID, generate `sourceLabel` using that ID
 */
export const ID_SOURCES = [
	{ key: "isrc", label: "ISRC" },
];

/**
 * @description Describe project display info in UI
 */
export interface ProjectIdentity {
	/**
	 * @description Display name (`Title - Artist` or `Untitled (NCM: 123)`, etc.)
	 */
	displayName: string;
	/**
	 * @description Flag whether it is an untitled project (no title and no artist metadata)
	 */
	isUntitled: boolean;
}

/**
 * @description Compute how the project should be displayed in UI based on metadata content
 * @param lyrics - Lyric object to identify
 * @returns
 */
export function identifyProject(lyrics: TTMLLyric): ProjectIdentity {
	const getMeta = (key: string) =>
		lyrics.metadata.find((m) => m.key.toLowerCase() === key.toLowerCase())
			?.value[0];

	const title = getMeta("musicName")?.trim();
	const artist = getMeta("artists")?.trim();

	for (const source of ID_SOURCES) {
		const idValue = getMeta(source.key)?.trim();
		if (idValue) {
			if (title) {
				return {
					displayName: artist ? `${title} - ${artist}` : title,
					isUntitled: false,
				};
			}

			return {
				displayName: `Untitled (${source.label}: ${idValue})`,
				isUntitled: true,
			};
		}
	}

	if (title && artist) {
		return {
			displayName: `${title} - ${artist}`,
			isUntitled: false,
		};
	}
	if (title) {
		return {
			displayName: title,
			isUntitled: false,
		};
	}

	return {
		displayName: "Untitled Project",
		isUntitled: true,
	};
}
