import { Copy16Regular, Dismiss24Regular } from "@fluentui/react-icons";
import {
	Badge,
	Button,
	Callout,
	Dialog,
	Flex,
	Heading,
	ScrollArea,
	Text,
} from "@radix-ui/themes";
import { useAtom } from "jotai";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { generateRustcStyleLog } from "$/modules/ttml-processor/message";
import { ttmlErrorDialogAtom } from "$/states/dialogs.ts";
import styles from "./TtmlErrorDialog.module.css";

export const TtmlErrorDialog = () => {
	const [dialogState, setDialogState] = useAtom(ttmlErrorDialogAtom);
	const { t } = useTranslation();

	const error = dialogState?.error;
	const rawText = dialogState?.rawText;

	const localizedKindMsg = useMemo(() => {
		if (!error) return "";
		switch (error.kind) {
			case "AttrError":
				return t("error.ttml.kind.AttrError", "XML attribute parsing error");
			case "EntityError":
				return t("error.ttml.kind.EntityError", "Unknown XML entity");
			case "InvalidTimestamp":
				return t("error.ttml.kind.InvalidTimestamp", "Invalid timestamp format");
			case "MissingAttribute":
				return t("error.ttml.kind.MissingAttribute", "Missing required attribute");
			case "UnexpectedEof":
				return t("error.ttml.kind.UnexpectedEof", "Unexpected end of file");
			case "XmlError":
				return t("error.ttml.kind.XmlError", "XML syntax error");
			default:
				return t("error.ttml.kind.ParseError", "General parse error");
		}
	}, [error, t]);

	const localizedSuggestion = useMemo(() => {
		if (!error) return "";
		switch (error.kind) {
			case "AttrError":
				return t(
					"error.ttml.suggestion.AttrError",
					"Please check if the XML attribute format is correct.",
				);
			case "EntityError":
				return t(
					"error.ttml.suggestion.EntityError",
					"Check if the XML predefined entity references used are valid",
				);
			case "InvalidTimestamp":
				return t(
					"error.ttml.suggestion.InvalidTimestamp",
					"Allowed timestamp format is 'hh:mm:ss.sss', leading zeros can be omitted. E.g., '1:03:36.120'.",
				);
			case "MissingAttribute":
				return t(
					"error.ttml.suggestion.MissingAttribute",
					"Please check the prompt above and add the required attributes.",
				);
			case "UnexpectedEof":
				return t(
					"error.ttml.suggestion.UnexpectedEof",
					"Please ensure all opened tags (e.g., </tt>, </body>) are correctly closed.",
				);
			case "XmlError":
				return t(
					"error.ttml.suggestion.XmlError",
					"Please check if the file has XML syntax errors.",
				);
			default:
				return t(
					"error.ttml.suggestion.ParseError",
					"Please refer to the prompt above and check if the file format is correct.",
				);
		}
	}, [error, t]);

	const displayLog = useMemo(
		() => (error ? generateRustcStyleLog(error, rawText) : ""),
		[error, rawText],
	);

	const handleClose = useCallback(() => setDialogState(null), [setDialogState]);

	const handleCopy = useCallback(() => {
		if (!error) return;

		const clipboardLog = generateRustcStyleLog(
			error,
			rawText,
			localizedSuggestion,
		);

		navigator.clipboard
			.writeText(clipboardLog)
			.then(() => toast.success(t("error.ttml.copied", "Copied successfully")))
			.catch(() => toast.error(t("error.ttml.copyFailed", "Copy failed")));
	}, [error, rawText, localizedSuggestion, t]);

	if (!error) return null;

	return (
		<Dialog.Root open={!!error} onOpenChange={(open) => !open && handleClose()}>
			<Dialog.Content maxWidth="800px">
				<Flex direction="column" gap="4">
					<Flex gap="3" align="start">
						<div className={styles.iconContainer}>
							<Dismiss24Regular color="var(--red-9)" />
						</div>
						<Flex direction="column" gap="1">
							<Heading size="5" color="red">
								{t("error.ttml.title", "TTML Processing Failed")}
							</Heading>
							<Text size="2" color="gray">
								{t("error.ttml.subtitle", "An error occurred while processing the TTML file")}
							</Text>
						</Flex>
					</Flex>

					<Callout.Root color="red" variant="soft" size="1">
						<Callout.Icon>
							<Badge color="red" variant="solid">
								{error.kind}
							</Badge>
						</Callout.Icon>
						<Callout.Text weight="bold" ml="2">
							{localizedKindMsg}
						</Callout.Text>
					</Callout.Root>

					<ScrollArea type="auto" scrollbars="horizontal">
						<pre className={styles.codeBlock}>{displayLog}</pre>
					</ScrollArea>

					<Flex direction="column" gap="1" mt="1">
						<Text color="gray">{localizedSuggestion}</Text>
					</Flex>

					<Flex gap="3" mt="4" justify="end">
						<Button variant="soft" color="gray" onClick={handleClose}>
							{t("error.ttml.close", "Close")}
						</Button>
						<Button variant="solid" onClick={handleCopy}>
							<Copy16Regular />
							{t("error.ttml.copyError", "Copy Log")}
						</Button>
					</Flex>
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
};
