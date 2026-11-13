#!/usr/bin/env node
// Checks that a Compose file stays inside the VPS resource envelope and health rules.
//   node deploy/check-compose.mjs [path/to/compose.yaml]   (default: deploy/compose.yaml)
// It resolves the file with `docker compose config --format json`, so it judges what Compose
// will actually run (anchors merged, mem_limit in bytes), not the raw YAML.
// Required `${VAR:?}` values get harmless placeholders, and an empty env file stops Compose
// from reading a real deploy/.env. Exit code 1 lists every violation.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIB = 1024 * 1024;
export const JVM_SERVICES = ['core-service', 'game-service', 'ratings-service'];
export const MAX_HEAP_BYTES = 384 * MIB;
// "Total memory < 3.2 GB", counted in the same MB (MiB) units Compose limits are written in.
export const MEMORY_BUDGET_BYTES = 3200 * MIB;
export const REQUIRED_RESTART = 'unless-stopped';

const UNIT = { '': 1, b: 1, k: 1024, kb: 1024, m: MIB, mb: MIB, g: 1024 * MIB, gb: 1024 * MIB };

/** Parses a Compose/JVM size ("640m", "1g", 671088640) into bytes, or null. */
export function parseBytes(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const match = /^\s*(\d+(?:\.\d+)?)\s*([a-z]*)\s*$/i.exec(value);
  if (!match || !(match[2].toLowerCase() in UNIT)) return null;
  return Math.round(Number(match[1]) * UNIT[match[2].toLowerCase()]);
}

/** The effective -Xmx in bytes (the JVM uses the last one), or null when there is none. */
export function heapCap(javaToolOptions) {
  const caps = [...String(javaToolOptions ?? '').matchAll(/(?:^|\s)-Xmx(\d+[kKmMgG]?)(?=\s|$)/g)];
  return caps.length ? parseBytes(caps[caps.length - 1][1]) : null;
}

function environmentOf(service) {
  const env = service.environment;
  if (Array.isArray(env)) {
    return Object.fromEntries(env.map((entry) => {
      const i = entry.indexOf('=');
      return i < 0 ? [entry, undefined] : [entry.slice(0, i), entry.slice(i + 1)];
    }));
  }
  return env ?? {};
}

function memoryLimitOf(service) {
  return parseBytes(service.mem_limit) ?? parseBytes(service.deploy?.resources?.limits?.memory);
}

const mib = (bytes) => `${Math.round(bytes / MIB)} MB`;

/** Applies every rule to a resolved Compose config. Returns { violations, totalBytes }. */
export function checkConfig(config) {
  const services = config.services ?? {};
  const violations = [];
  let totalBytes = 0;

  for (const [name, service] of Object.entries(services)) {
    const limit = memoryLimitOf(service);
    if (!limit) violations.push(`${name}: no memory limit (set mem_limit)`);
    else totalBytes += limit;

    const hc = service.healthcheck;
    if (!hc || hc.disable || !hc.test || (Array.isArray(hc.test) && hc.test[0] === 'NONE')) {
      violations.push(`${name}: no healthcheck`);
    }

    if (service.restart !== REQUIRED_RESTART) {
      violations.push(`${name}: restart policy is ${service.restart ?? 'not set'}, expected ${REQUIRED_RESTART}`);
    }
  }

  for (const name of JVM_SERVICES) {
    if (!services[name]) {
      violations.push(`${name}: JVM service is missing from the Compose file`);
      continue;
    }
    const opts = environmentOf(services[name]).JAVA_TOOL_OPTIONS;
    const cap = heapCap(opts);
    if (cap === null) violations.push(`${name}: no -Xmx heap cap in JAVA_TOOL_OPTIONS`);
    else if (cap > MAX_HEAP_BYTES) {
      violations.push(`${name}: heap cap ${mib(cap)} in JAVA_TOOL_OPTIONS is above ${mib(MAX_HEAP_BYTES)}`);
    }
  }

  if (totalBytes >= MEMORY_BUDGET_BYTES) {
    violations.push(`total memory limit ${mib(totalBytes)} is not below the ${mib(MEMORY_BUDGET_BYTES)} budget`);
  }
  return { violations, totalBytes };
}

/** Names of every `${VAR:?...}` / `${VAR?...}` the file requires. */
export function requiredVariables(yamlText) {
  return [...new Set([...yamlText.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*):?\?/g)].map((m) => m[1]))];
}

/** Resolves a Compose file with placeholder secrets and no real .env. */
export function resolveCompose(file) {
  const env = { ...process.env };
  for (const name of requiredVariables(readFileSync(file, 'utf8'))) env[name] = 'ci-placeholder';
  const dir = mkdtempSync(join(tmpdir(), 'check-compose-'));
  const emptyEnvFile = join(dir, 'empty.env');
  writeFileSync(emptyEnvFile, '');
  try {
    const out = execFileSync(
      'docker',
      ['compose', '-f', file, '--env-file', emptyEnvFile, 'config', '--format', 'json'],
      { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return JSON.parse(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const file = resolve(process.argv[2] ?? join(here, 'compose.yaml'));
  let config;
  try {
    config = resolveCompose(file);
  } catch (err) {
    console.error(`check-compose: could not resolve ${file}`);
    console.error(String(err.stderr || err.message).trim());
    process.exit(2);
  }
  const { violations, totalBytes } = checkConfig(config);
  console.log(`check-compose: ${file}`);
  console.log(`total memory limit: ${mib(totalBytes)} (budget: below ${mib(MEMORY_BUDGET_BYTES)})`);
  if (violations.length) {
    console.error(`FAIL: ${violations.length} violation(s)`);
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log('OK: every service has a memory limit, healthcheck and restart: unless-stopped; JVM heaps capped.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
