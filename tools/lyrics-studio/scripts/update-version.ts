import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const getGitCommitCount = () => {
	try {
		const count = execSync("git rev-list --count HEAD").toString().trim();
		return parseInt(count, 10);
	} catch (e) {
		console.warn("Unable to get the Git commit count", e);
		return 0;
	}
};

const tauriConfigPath = join(process.cwd(), "src-tauri", "tauri.conf.json");

try {
	const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, "utf-8"));
	const currentVersion = tauriConfig.version;

	const [major, minor] = currentVersion.split(".");

	const commitCount = getGitCommitCount();
	const newVersion = `${major}.${minor}.${commitCount}`;

	console.log(`Updating version: ${currentVersion} -> ${newVersion}`);

	tauriConfig.version = newVersion;
	writeFileSync(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 4)}\n`);
} catch (e) {
	console.error("Failed to update the version", e);
	process.exit(1);
}
