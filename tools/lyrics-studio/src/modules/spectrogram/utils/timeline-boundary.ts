import type { ProcessedLyricLine } from "$/modules/segmentation/utils/segment-processing.ts";

//#region Data model
export type BoundaryKind = "line-start" | "internal" | "line-end";

export type BoundaryVisualState =
	| "default"
	| "selected"
	| "hovered"
	| "editing";

export type WordVisualState =
	| "default"
	| "selected"
	| "hovered"
	| "selected-hovered";

export interface TimelineBoundary {
	/** Boundary ID. */
	id: string;

	/** Boundary timestamp. */
	timeMs: number;

	/**
	 * Index in the source segments array.
	 *
	 * -1 denotes the line-start boundary. */
	segmentIndex: number;
	/**
	 * Boundary kind.
	 */
	kind: BoundaryKind;

	/** Adjacent segment ID on the left. */
	leftSegmentId: string | null;

	/** Adjacent segment ID on the right. */
	rightSegmentId: string | null;

	/**
	 * Adjacent word ID on the left; gaps are null.
	 * Used to resolve selection and hover state efficiently.
	 */
	leftWordId: string | null;

	/**
	 * Adjacent word ID on the right; gaps are null.
	 * Used to resolve selection and hover state efficiently.
	 */
	rightWordId: string | null;
}
//#endregion

//#region Boundary generation
/**
 * Converts a lyric line with multiple syllables to explicit boundaries.
 * A line with N syllables produces N + 1 boundaries.
 */
export function generateBoundaries(
	line: ProcessedLyricLine,
): TimelineBoundary[] {
	const { id: lineId, startTime, segments } = line;
	if (startTime == null) return [];

	const boundaries: TimelineBoundary[] = [];

	boundaries.push({
		id: `${lineId}:start`,
		timeMs: startTime,
		segmentIndex: -1,
		kind: "line-start",
		leftSegmentId: null,
		rightSegmentId: segments[0]?.id ?? null,
		leftWordId: null,
		rightWordId: segments[0]?.type === "word" ? segments[0].id : null,
	});

	segments.forEach((segment, index) => {
		const nextSegment = segments[index + 1];
		const isEndBoundary = index === segments.length - 1;

		const resolvedEndTime =
			segment.endTime ??
			nextSegment?.startTime ??
			line.endTime ??
			segment.startTime;

		boundaries.push({
			id: `${lineId}:boundary:${segment.id}`,
			timeMs: resolvedEndTime,
			segmentIndex: index,
			kind: isEndBoundary ? "line-end" : "internal",
			leftSegmentId: segment.id,
			rightSegmentId: nextSegment?.id ?? null,
			leftWordId: segment.type === "word" ? segment.id : null,
			rightWordId: nextSegment?.type === "word" ? nextSegment.id : null,
		});
	});

	return boundaries;
}
//#endregion

//#region Visual-state resolution
interface BoundaryStateOptions {
	selectedWordId: string | null;
	hoveredWordId: string | null;
	focusedWordId: string | null;
	draggingBoundaryId: string | null;
}

/**
 * Resolves a vertical boundary's visual state.
 * Priority: dragging > hovered/focused > selected > default.
 */
export function resolveBoundaryVisualState(
	boundary: TimelineBoundary,
	options: BoundaryStateOptions,
): BoundaryVisualState {
	const { selectedWordId, hoveredWordId, focusedWordId, draggingBoundaryId } =
		options;

	if (draggingBoundaryId === boundary.id) {
		return "editing";
	}

	const adjacentWordIds = [boundary.leftWordId, boundary.rightWordId];

	if (hoveredWordId && adjacentWordIds.includes(hoveredWordId)) {
		return "hovered";
	}
	if (focusedWordId && adjacentWordIds.includes(focusedWordId)) {
		return "hovered";
	}

	if (selectedWordId && adjacentWordIds.includes(selectedWordId)) {
		return "selected";
	}

	return "default";
}

/**
 * Resolves a word's background and border state.
 */
export function resolveWordVisualState(
	wordId: string,
	selectedWordId: string | null,
	hoveredWordId: string | null,
	focusedWordId: string | null,
): WordVisualState {
	const isSelected = selectedWordId === wordId;
	const isHovered = hoveredWordId === wordId || focusedWordId === wordId;

	if (isSelected && isHovered) {
		return "selected-hovered";
	}
	if (isSelected) {
		return "selected";
	}
	if (isHovered) {
		return "hovered";
	}

	return "default";
}
//#endregion
