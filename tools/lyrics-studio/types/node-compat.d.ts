/**
 * @types/node 26 currently exposes its `node:` module declarations only to
 * TypeScript versions through 5.7. Keep the Vite config type-safe while this
 * tool uses TypeScript 7.
 */
declare module "node:child_process" {
	export function exec(
		command: string,
		callback: (error: Error | null, stdout: string) => void,
	): unknown;
}

declare module "node:path" {
	export function resolve(...paths: string[]): string;
}

declare namespace NodeJS {
	interface ProcessEnv {
		NODE_ENV?: string;
		TAURI_PLATFORM?: string;
		TAURI_ENV_PLATFORM?: string;
	}
}

interface ImportMeta {
	readonly dirname: string;
}
