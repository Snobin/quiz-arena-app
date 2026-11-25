// Tests for check-compose.mjs. Run with: node --test deploy/*.test.mjs (the shell expands the glob;
// Node 22+ does not search a bare directory argument for test files).
// Each fixture breaks one rule; the CLI must fail and name it. Needs `docker compose`.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { readFileSync } from 'node:fs';
import { checkConfig, heapCap, parseBytes, requiredVariables } from './check-compose.mjs';

const script = fileURLToPath(new URL('./check-compose.mjs', import.meta.url));
const fixture = (name) => fileURLToPath(new URL(`./fixtures/compose-${name}.yaml`, import.meta.url));

function run(file, scriptPath = script) {
  const env = { ...process.env };
  delete env.FIXTURE_PASSWORD; // the script must supply its own placeholder
  const res = spawnSync(process.execPath, [scriptPath, ...(file ? [file] : [])], { encoding: 'utf8', env });
  return { code: res.status, out: res.stdout + res.stderr };
}

describe('check-compose CLI', () => {
  it('passes the real deploy/compose.yaml and prints the total', () => {
    const { code, out } = run();
    assert.equal(code, 0, out);
    assert.match(out, /total memory limit: \d+\.\d\d GB \(\d+ MiB\)/);
  });

  it('passes a good fixture, filling required variables with placeholders', () => {
    const { code, out } = run(fixture('good'));
    assert.equal(code, 0, out);
    assert.match(out, /total memory limit: 2\.95 GB \(2816 MiB\)/);
  });

  it('fails a service with no memory limit', () => {
    const { code, out } = run(fixture('no-limit'));
    assert.equal(code, 1, out);
    assert.match(out, /valkey: no memory limit/);
  });

  it('fails a JVM heap above 384m and a JVM service with no -Xmx', () => {
    const { code, out } = run(fixture('heap-too-big'));
    assert.equal(code, 1, out);
    assert.match(out, /game-service: heap cap 512 MiB/);
    assert.match(out, /ratings-service: no -Xmx heap cap/);
    assert.match(out, /2 violation/);
  });

  it('fails limits summing to exactly 3.2 GB and prints the total', () => {
    const { code, out } = run(fixture('over-budget'));
    assert.equal(code, 1, out);
    assert.match(out, /total memory limit 3\.20 GB \(3052 MiB\) is not below the 3\.20 GB \(3052 MiB\) budget/);
  });

  it('fails when a JVM service is missing from the file', () => {
    const { code, out } = run(fixture('missing-jvm'));
    assert.equal(code, 1, out);
    assert.match(out, /ratings-service: JVM service is missing/);
    assert.match(out, /1 violation/);
  });

  it('treats healthcheck test ["NONE"] as no healthcheck', () => {
    const { code, out } = run(fixture('healthcheck-none'));
    assert.equal(code, 1, out);
    assert.match(out, /postgres: no healthcheck/);
  });

  it('never reads a .env beside the Compose file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'check-compose-test-'));
    try {
      const file = join(dir, 'compose.yaml');
      copyFileSync(fixture('good'), file);
      writeFileSync(join(dir, '.env'), 'not a valid line\n'); // Compose fails if it reads this
      const { code, out } = run(file);
      assert.equal(code, 0, out);
      assert.equal(out.replace(file, '<file>'), run(fixture('good')).out.replace(fixture('good'), '<file>'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runs the check when invoked through a symlink', () => {
    const dir = mkdtempSync(join(tmpdir(), 'check-compose-test-'));
    try {
      const link = join(dir, 'check-compose.mjs');
      symlinkSync(script, link);
      const { code, out } = run(fixture('no-limit'), link);
      assert.equal(code, 1, out);
      assert.match(out, /valkey: no memory limit/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails a service with no healthcheck', () => {
    const { code, out } = run(fixture('no-healthcheck'));
    assert.equal(code, 1, out);
    assert.match(out, /postgres: no healthcheck/);
  });

  it('fails a wrong or missing restart policy', () => {
    const { code, out } = run(fixture('wrong-restart'));
    assert.equal(code, 1, out);
    assert.match(out, /valkey: restart policy is always/);
    assert.match(out, /caddy: restart policy is not set/);
  });
});

describe('check-compose helpers', () => {
  it('parses sizes', () => {
    assert.equal(parseBytes('640m'), 640 * 1024 * 1024);
    assert.equal(parseBytes('1g'), 1024 ** 3);
    assert.equal(parseBytes(671088640), 671088640);
    assert.equal(parseBytes('lots'), null);
  });

  it('reads the effective (last) -Xmx', () => {
    assert.equal(heapCap('-Xmx384m'), 384 * 1024 * 1024);
    assert.equal(heapCap('-Xmx1g -Xmx256m'), 256 * 1024 * 1024);
    assert.equal(heapCap('-XX:MaxRAMPercentage=75'), null);
    assert.equal(heapCap(undefined), null);
  });

  it('finds required variables', () => {
    assert.deepEqual(requiredVariables('a: ${A:?x}\nb: ${B:-d}\nc: ${C?y}\nd: ${A:?again}'), ['A', 'C']);
  });

  it('treats a disabled healthcheck as missing and reads list-style environment', () => {
    const svc = (extra) => ({ restart: 'unless-stopped', mem_limit: 1, healthcheck: { test: ['CMD', 'true'] }, ...extra });
    const { violations } = checkConfig({
      services: {
        'core-service': svc({ environment: ['JAVA_TOOL_OPTIONS=-Xmx384m'] }),
        'game-service': svc({ environment: { JAVA_TOOL_OPTIONS: '-Xmx384m' }, healthcheck: { disable: true } }),
        'ratings-service': svc({ environment: { JAVA_TOOL_OPTIONS: '-Xmx384m' } }),
      },
    });
    assert.deepEqual(violations, ['game-service: no healthcheck']);
  });
});

describe('core-service sign-in settings (Story 2.1)', () => {
  const names = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'WEB_URL', 'ADMIN_EMAILS'];

  it('passes every sign-in variable to core-service from the environment', () => {
    // Raw text, not `docker compose config`, so this runs without Docker.
    const compose = readFileSync(fileURLToPath(new URL('./compose.yaml', import.meta.url)), 'utf8');
    const core = compose.slice(compose.indexOf('\n  core-service:'), compose.indexOf('\n  game-service:'));
    for (const name of names) assert.match(core, new RegExp(`^\\s+${name}: \\$\\{${name}:-`, 'm'), `${name} is missing from core-service`);
    // Secrets never get a default value in the Compose file itself.
    assert.match(core, /GOOGLE_CLIENT_ID: \$\{GOOGLE_CLIENT_ID:-\}/);
    assert.match(core, /GOOGLE_CLIENT_SECRET: \$\{GOOGLE_CLIENT_SECRET:-\}/);
  });

  it('documents each variable in .env.example and commits no secret', () => {
    const example = readFileSync(fileURLToPath(new URL('./.env.example', import.meta.url)), 'utf8');
    for (const name of names) assert.match(example, new RegExp(`^${name}=`, 'm'));
    assert.match(example, /^GOOGLE_CLIENT_ID=$/m);
    assert.match(example, /^GOOGLE_CLIENT_SECRET=$/m);
  });
});

describe('metrics push settings reach every JVM service (code review of Epics 6 and 7)', () => {
  const compose = readFileSync(fileURLToPath(new URL('./compose.yaml', import.meta.url)), 'utf8');
  const example = readFileSync(fileURLToPath(new URL('./.env.example', import.meta.url)), 'utf8');
  const names = ['GRAFANA_OTLP_URL', 'GRAFANA_OTLP_AUTHORIZATION'];

  it('defines both variables once, in the environment block the services share, with no default value', () => {
    // Raw text, not `docker compose config`, so this runs without Docker.
    const shared = compose.slice(compose.indexOf('x-service-env: &service-env'), compose.indexOf('\nservices:'));
    for (const name of names) assert.match(shared, new RegExp(`^\\s+${name}: \\$\\{${name}:-\\}$`, 'm'), `${name} is missing from the shared service environment`);
  });

  it('merges that shared block into core, game and ratings', () => {
    for (const [service, next] of [['core-service', 'game-service'], ['game-service', 'ratings-service'], ['ratings-service', null]]) {
      const start = compose.indexOf(`\n  ${service}:`);
      assert.ok(start >= 0, `${service} not found`);
      const end = next ? compose.indexOf(`\n  ${next}:`) : compose.length;
      assert.match(compose.slice(start, end), /<<: \*service-env/, `${service} does not use the shared environment`);
    }
  });

  it('documents both variables in .env.example', () => {
    for (const name of names) assert.match(example, new RegExp(`^${name}=`, 'm'), name);
  });
});
