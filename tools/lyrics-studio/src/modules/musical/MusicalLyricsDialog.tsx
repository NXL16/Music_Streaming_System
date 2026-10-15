import {
	Button,
	Dialog,
	DropdownMenu,
	Flex,
	Text,
	TextField,
} from "@radix-ui/themes";
import { useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";
import { toast } from "react-toastify";
import {
	lyricLinesAtom,
	newLyricLinesAtom,
	saveFileNameAtom,
} from "$/states/main";
import {
	fromMusicalTtml,
	LyricsCompatibilityError,
	toMusicalLyricsPayload,
} from "./lyrics-adapter";
import { loadMusicalLyrics, saveMusicalLyrics } from "./lyrics-api";

function errorMessage(error: unknown) {
	return error instanceof Error
		? error.message
		: "Could not complete the 404Hz lyrics request.";
}

export function MusicalLyricsDialog() {
	const lyrics = useAtomValue(lyricLinesAtom);
	const replaceLyrics = useSetAtom(newLyricLinesAtom);
	const setSaveFileName = useSetAtom(saveFileNameAtom);
	const [open, setOpen] = useState(false);
	const [songId, setSongId] = useState(
		() => new URLSearchParams(window.location.search).get("songId") || "",
	);
	const [language, setLanguage] = useState("vi");
	const [busy, setBusy] = useState<"load" | "draft" | "publish" | null>(null);

	const load = async () => {
		if (!songId.trim()) return toast.error("Enter a Song ID first.");
		setBusy("load");
		try {
			const response = await loadMusicalLyrics(songId.trim());
			replaceLyrics(fromMusicalTtml(response.sourceTtml));
			setLanguage(response.language || "vi");
			setSaveFileName(`${songId.trim()}.ttml`);
			toast.success(
				response.published ? "Published lyrics loaded." : "Lyric draft loaded.",
			);
		} catch (error) {
			toast.error(errorMessage(error));
		} finally {
			setBusy(null);
		}
	};

	const save = async (publish: boolean) => {
		if (!songId.trim()) return toast.error("Enter a Song ID first.");
		setBusy(publish ? "publish" : "draft");
		try {
			const payload = toMusicalLyricsPayload(lyrics, language);
			await saveMusicalLyrics(songId.trim(), payload, publish);
			toast.success(
				publish
					? "WORD lyrics published to 404Hz."
					: "WORD lyric draft saved to 404Hz.",
			);
		} catch (error) {
			const message = errorMessage(error);
			toast.error(
				error instanceof LyricsCompatibilityError
					? `Cannot save without data loss: ${message}`
					: message,
			);
		} finally {
			setBusy(null);
		}
	};

	return (
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<DropdownMenu.Item
				onSelect={(event) => {
					event.preventDefault();
					setOpen(true);
				}}
			>
				404Hz Lyrics…
			</DropdownMenu.Item>
			<Dialog.Content maxWidth="500px">
				<Dialog.Title>404Hz Lyrics</Dialog.Title>
				<Dialog.Description size="2" mb="4">
					Load or save WORD-synchronised lyrics for a song you can edit.
				</Dialog.Description>
				<Flex direction="column" gap="3">
					<label>
						<Text as="div" size="2" mb="1" weight="medium">
							Song ID
						</Text>
						<TextField.Root
							value={songId}
							onChange={(event) => setSongId(event.target.value.trim())}
							placeholder="UUID of the song"
						/>
					</label>
					<label>
						<Text as="div" size="2" mb="1" weight="medium">
							Language
						</Text>
						<TextField.Root
							value={language}
							onChange={(event) => setLanguage(event.target.value)}
							placeholder="vi"
						/>
					</label>
					<Text size="1" color="gray">
						Requires an active 404Hz web session. Configure VITE_MUSICAL_API_URL
						when this app is served on a separate origin.
					</Text>
					<Flex gap="2" justify="end" mt="2">
						<Dialog.Close>
							<Button variant="soft" color="gray">
								Close
							</Button>
						</Dialog.Close>
						<Button
							variant="soft"
							onClick={load}
							loading={busy === "load"}
							disabled={busy !== null}
						>
							Load
						</Button>
						<Button
							variant="soft"
							onClick={() => save(false)}
							loading={busy === "draft"}
							disabled={busy !== null}
						>
							Save draft
						</Button>
						<Button
							onClick={() => save(true)}
							loading={busy === "publish"}
							disabled={busy !== null}
						>
							Publish
						</Button>
					</Flex>
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
}
