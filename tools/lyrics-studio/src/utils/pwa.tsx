import { registerSW } from "virtual:pwa-register";
import { Button, Flex } from "@radix-ui/themes";
import { t } from "i18next";
import { toast } from "react-toastify";

if (!import.meta.env.TAURI_ENV_PLATFORM) {
	const refresh = registerSW({
		onOfflineReady() {
			toast.info(
				t("pwa.offlineReady", "This site is ready for offline use."),
			);
		},
		onNeedRefresh() {
			toast.info(() => (
				<Flex direction="column" gap="2" align="stretch">
					<div>
						{t("pwa.updateRefresh", "An update is available. Refresh to use the latest version.")}
					</div>
					<Button
						size="2"
						onClick={() => {
							refresh(true);
						}}
					>
						{t("pwa.refresh", "Refresh")}
					</Button>
				</Flex>
			));
		},
	});
}
