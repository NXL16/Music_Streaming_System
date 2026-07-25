import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const FORCE_STOP_DELAY_MS = 10_000;
const TURBO_SHUTDOWN_MESSAGE = 'Shutting down Turborepo tasks...';

function readEnvFile(file) {
  const parsed = {};
  if (!fs.existsSync(file)) return parsed;

  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const index = line.indexOf('=');
    if (index > 0 && !line.trimStart().startsWith('#')) {
      parsed[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    }
  }

  return parsed;
}

const appEnv = process.argv[2] === 'production' ? 'production' : 'development';
const values = readEnvFile('.env.development');
const webEnv = readEnvFile(`apps/web/.env.${appEnv}`);
const mode = (values.DEV_CACHE_MODE || 'on').trim().toLowerCase();
const turboBin = require.resolve('turbo/bin/turbo');
const cloudflaredBin = process.env.CLOUDFLARED_BIN || values.CLOUDFLARED_BIN || 'cloudflared';
const tunnel = appEnv === 'production'
  ? spawn(cloudflaredBin, ['tunnel', 'run'], { stdio: 'inherit' })
  : undefined;
const child = spawn(process.execPath, [turboBin, 'run', 'dev', '--concurrency=32'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  env: {
    ...process.env,
    ...values,
    ...webEnv,
    APP_ENV: appEnv,
    NEXT_PUBLIC_DEV_CACHE_MODE: mode,
  },
});

let shuttingDown = false;
let forceStopTimer;

function scheduleForceStop() {
  if (forceStopTimer) return;

  forceStopTimer = setTimeout(() => {
    shuttingDown = true;
    console.warn('Ép dừng các process dev còn lại...');
    if (process.platform === 'win32') {
      for (const process of [child, tunnel]) {
        if (!process || process.exitCode !== null || process.signalCode !== null) continue;

        spawnSync('taskkill', ['/pid', String(process.pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        });
      }
      process.exit(0);
    }

    child.kill('SIGKILL');
    tunnel?.kill('SIGKILL');
  }, FORCE_STOP_DELAY_MS);
  forceStopTimer.unref();
}

function stopChild(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  child.kill(signal);
  tunnel?.kill(signal);
  scheduleForceStop();
}

function forwardTurboOutput(stream, output) {
  stream?.on('data', (chunk) => {
    const text = chunk.toString();

    if (text.includes(TURBO_SHUTDOWN_MESSAGE)) {
      shuttingDown = true;
      tunnel?.kill('SIGTERM');
      scheduleForceStop();
    }

    if (shuttingDown && /^\d+ tasks? shutting down\.\.\.\s*$/.test(text)) {
      return;
    }

    output.write(chunk);
  });
}

forwardTurboOutput(child.stdout, process.stdout);
forwardTurboOutput(child.stderr, process.stderr);

process.once('SIGINT', () => stopChild('SIGINT'));
process.once('SIGTERM', () => stopChild('SIGTERM'));
process.once('SIGBREAK', () => stopChild('SIGTERM'));

child.once('error', (error) => {
  console.error('Không thể khởi động Turbo:', error);
  process.exitCode = 1;
});

tunnel?.once('error', (error) => {
  console.error('Không thể khởi động Cloudflare Tunnel:', error);
});

child.once('exit', (code, signal) => {
  tunnel?.kill('SIGTERM');
  if (
    forceStopTimer &&
    (!tunnel || tunnel.exitCode !== null || tunnel.signalCode !== null)
  ) {
    clearTimeout(forceStopTimer);
  }
  process.exitCode = shuttingDown ? 0 : (code ?? (signal ? 130 : 1));
});

tunnel?.once('exit', () => {
  if (forceStopTimer && (child.exitCode !== null || child.signalCode !== null)) {
    clearTimeout(forceStopTimer);
  }
});
