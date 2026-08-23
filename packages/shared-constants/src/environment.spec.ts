import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadEnvironment } from './environment';

test('loads the selected overlay while preserving injected variables', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'musical-env-'));

  try {
    writeFileSync(join(cwd, '.env'), 'VALUE=base\nBASE_ONLY=base\n');
    writeFileSync(
      join(cwd, '.env.production'),
      'VALUE=production\nOVERLAY_ONLY=production\n',
    );

    const env: Record<string, string | undefined> = {
      APP_ENV: 'production',
      VALUE: 'injected',
    };

    loadEnvironment({ cwd, env });

    assert.deepEqual(env, {
      APP_ENV: 'production',
      VALUE: 'injected',
      BASE_ONLY: 'base',
      OVERLAY_ONLY: 'production',
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('uses APP_ENV from the base file when no process value is provided', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'musical-env-'));

  try {
    writeFileSync(join(cwd, '.env'), 'APP_ENV=staging\nVALUE=base\n');
    writeFileSync(join(cwd, '.env.staging'), 'VALUE=staging\n');

    const env: Record<string, string | undefined> = {};
    loadEnvironment({ cwd, env });

    assert.deepEqual(env, { APP_ENV: 'staging', VALUE: 'staging' });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
