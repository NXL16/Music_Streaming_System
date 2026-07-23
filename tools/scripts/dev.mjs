import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const values = {};
if (fs.existsSync('.env.development')) {
  for (const line of fs.readFileSync('.env.development', 'utf8').split(/\r?\n/)) {
    const index = line.indexOf('=');
    if (index > 0 && !line.trimStart().startsWith('#')) values[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
}
const mode = (values.DEV_CACHE_MODE || 'on').trim().toLowerCase();
const turboBin = require.resolve('turbo/bin/turbo');
const child = spawn(process.execPath, [turboBin, 'run', 'dev', '--concurrency=32'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ...values,
    NEXT_PUBLIC_DEV_CACHE_MODE: mode,
  },
});

let shuttingDown = false;
let forceStopTimer;

function stopChild(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  child.kill(signal);
  forceStopTimer = setTimeout(() => {
    if (child.exitCode !== null || child.signalCode !== null) return;

    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      }).unref();
      return;
    }

    child.kill('SIGKILL');
  }, 10_000);
  forceStopTimer.unref();
}

process.once('SIGINT', () => stopChild('SIGINT'));
process.once('SIGTERM', () => stopChild('SIGTERM'));

child.once('error', (error) => {
  console.error('Không thể khởi động Turbo:', error);
  process.exitCode = 1;
});

child.once('exit', (code, signal) => {
  if (forceStopTimer) clearTimeout(forceStopTimer);
  process.exitCode = code ?? (signal ? 130 : 1);
});
