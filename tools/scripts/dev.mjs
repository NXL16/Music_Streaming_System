import fs from 'node:fs';
import { spawn } from 'node:child_process';

const values = {};
if (fs.existsSync('.env.development')) {
  for (const line of fs.readFileSync('.env.development', 'utf8').split(/\r?\n/)) {
    const index = line.indexOf('=');
    if (index > 0 && !line.trimStart().startsWith('#')) values[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
}
const mode = values.HOME_CACHE_MODE || 'on';
const child = spawn('pnpm', ['turbo', 'run', 'dev', '--parallel'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, ...values, NEXT_PUBLIC_DISABLE_HOME_CACHE: mode === 'off' ? 'true' : 'false' },
});
child.once('exit', (code) => process.exit(code ?? 1));
