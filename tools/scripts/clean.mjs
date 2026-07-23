import { access, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const requiredRootFiles = ["package.json", "pnpm-workspace.yaml"];

for (const file of requiredRootFiles) {
  try {
    await access(path.join(rootDir, file));
  } catch {
    throw new Error(`Run this script from the repository root: missing ${file}.`);
  }
}

const targets = [
  "node_modules",
  ".turbo",
];

for (const workspaceGroup of ["apps", "packages"]) {
  const groupDir = path.join(rootDir, workspaceGroup);
  const entries = await readdir(groupDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const workspaceDir = path.join(workspaceGroup, entry.name);
    targets.push(
      path.join(workspaceDir, "node_modules"),
      path.join(workspaceDir, "dist"),
      path.join(workspaceDir, ".next"),
      path.join(workspaceDir, ".turbo"),
    );
  }
}

const removed = [];

for (const target of targets) {
  const absoluteTarget = path.join(rootDir, target);

  try {
    await rm(absoluteTarget, { recursive: true, force: true });
    removed.push(target);
  } catch (error) {
    throw new Error(`Could not remove ${target}. Stop any process using it and try again.`, {
      cause: error,
    });
  }
}

console.log(`Cleaned ${removed.length} workspace cache and dependency directories.`);
