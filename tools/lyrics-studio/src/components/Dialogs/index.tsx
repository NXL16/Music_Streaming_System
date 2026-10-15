import { LatencyTestDialog } from "$/modules/audio/modals/LatencyTest.tsx";
import { ReplaceWordDialog } from "$/modules/lyric-editor/tools/ReplaceWordDialog.tsx";
import { SyllableSmoothingDialog } from "$/modules/lyric-editor/tools/SyllableSmoothingDialog.tsx";
import { TimeShiftDialog } from "$/modules/lyric-editor/tools/TimeShift.tsx";
import { DistributeRomanizationDialog } from "$/modules/project/modals/DistributeRomanization.tsx";
import { HistoryRestoreDialog } from "$/modules/project/modals/HistoryRestore.tsx";
import { ImportFromText } from "$/modules/project/modals/ImportFromText.tsx";
import { MetadataEditor } from "$/modules/project/modals/MetadataEditor.tsx";
import { AdvancedSegmentationDialog } from "$/modules/segmentation/components/AdvancedSegmentation.tsx";
import { SplitWordDialog } from "$/modules/segmentation/components/split-word.tsx";
import { SettingsDialog } from "$/modules/settings/modals/index.tsx";
import { ConfirmationDialog } from "./confirmation.tsx";
import { TtmlErrorDialog } from "./TtmlErrorDialog.tsx";

export const Dialogs = () => {
	return (
		<>
			<ImportFromText />
			<MetadataEditor />
			<SettingsDialog />
			<SplitWordDialog />
			<ReplaceWordDialog />
			<LatencyTestDialog />
			<ConfirmationDialog />
			<HistoryRestoreDialog />
			<AdvancedSegmentationDialog />
			<TimeShiftDialog />
			<SyllableSmoothingDialog />
			<DistributeRomanizationDialog />
			<TtmlErrorDialog />
		</>
	);
};

export default Dialogs;
