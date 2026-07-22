import fs from 'node:fs';
import { spawn } from 'node:child_process';

const values = {};
if (fs.existsSync('.env.development')) {
  for (const line of fs.readFileSync('.env.development', 'utf8').split(/\r?\n/)) {
    const index = line.indexOf('=');
    if (index > 0 && !line.trimStart().startsWith('#')) values[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
}
const mode = (values.DEV_CACHE_MODE || 'on').trim().toLowerCase();
const child = spawn('pnpm', ['turbo', 'run', 'dev', '--parallel'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    ...values,
    NEXT_PUBLIC_DEV_CACHE_MODE: mode,
  },
});
child.once('exit', (code) => process.exit(code ?? 1));
