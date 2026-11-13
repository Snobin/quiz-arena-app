// Tests for check-compose.mjs. Run with: node --test deploy/
// Each fixture breaks one rule; the CLI must fail and name it. Needs `docker compose`.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { checkConfig, heapCap, parseBytes, requiredVariables } from './check-compose.mjs';

const script = fileURLToPath(new URL('./check-compose.mjs', import.meta.url));
const fixture = (name) => fileURLToPath(new URL(`./fixtures/compose-${name}.yaml`, import.meta.url));

function run(file) {
  const env = { ...process.env };
  delete env.FIXTURE_PASSWORD; // the script must supply its own placeholder
  const res = spawnSync(process.execPath, [script, ...(file ? [file] : [])], { encoding: 'utf8', env });
  return { code: res.status, out: res.stdout + res.stderr };
}

describe('check-compose CLI', () => {
  it('passes the real deploy/compose.yaml and prints the total', () => {
    const { code, out } = run();
    assert.equal(code, 0, out);
    assert.match(out, /total memory limit: \d+ MB/);
  });

  it('passes a good fixture, filling required variables with placeholders', () => {
    const { code, out } = run(fixture('good'));
    assert.equal(code, 0, out);
    assert.match(out, /total memory limit: 2816 MB/);
  });

  it('fails a service with no memory limit', () => {
    const { code, out } = run(fixture('no-limit'));
    assert.equal(code, 1, out);
    assert.match(out, /valkey: no memory limit/);
  });

  it('fails a JVM heap above 384m and a JVM service with no -Xmx', () => {
    const { code, out } = run(fixture('heap-too-big'));
    assert.equal(code, 1, out);
    assert.match(out, /game-service: heap cap 512 MB/);
    assert.match(out, /ratings-service: no -Xmx heap cap/);
    assert.match(out, /2 violation/);
  });

  it('fails limits summing to 3.2 GB and prints the total', () => {
    const { code, out } = run(fixture('over-budget'));
    assert.equal(code, 1, out);
    assert.match(out, /total memory limit 3200 MB is not below the 3200 MB budget/);
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
