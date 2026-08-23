import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';

type Environment = Record<string, string | undefined>;

export type LoadEnvironmentOptions = {
  cwd?: string;
  environment?: string;
  env?: Environment;
};

/**
 * Loads the base file and the selected environment overlay without replacing
 * variables supplied by the process manager, container, or CI.
 */
export function loadEnvironment({
  cwd = process.cwd(),
  environment,
  env = process.env,
}: LoadEnvironmentOptions = {}): void {
  const base = readEnvironmentFile(resolve(cwd, '.env'));
  const selectedEnvironment =
    environment ?? env.APP_ENV ?? base.APP_ENV ?? 'development';

  if (!/^[A-Za-z0-9_-]+$/.test(selectedEnvironment)) {
    throw new Error('APP_ENV must contain only letters, numbers, underscores, or hyphens');
  }

  const overlay = readEnvironmentFile(
    resolve(cwd, `.env.${selectedEnvironment}`),
  );
  const merged = { ...base, ...overlay };

  for (const [key, value] of Object.entries(merged)) {
    if (env[key] === undefined) {
      env[key] = value;
    }
  }
}

function readEnvironmentFile(path: string): Environment {
  if (!existsSync(path)) {
    return {};
  }

  return parse(readFileSync(path));
}
