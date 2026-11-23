// Tests for deploy/backup.sh (Story 7.4a) with stub docker, aws and curl commands. No Docker needed.
// The real dump and restore are exercised against a live Postgres by deploy/backup-drill-e2e.sh in CI.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, it } from 'node:test';

const backup = fileURLToPath(new URL('./backup.sh', import.meta.url));
let dir;

const script = (name, body) => {
  const path = join(dir, name);
  writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'minnal-backup-test-'));
  mkdirSync(join(dir, 'uploaded'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function run(overrides = {}) {
  // Args seen by PG_EXEC: `bash -s -- <path>` (the script is on stdin), `cat <path>`, `rm -f <path>`.
  const pg = script(
    'pg.sh',
    `case "$1" in
  bash) cat > /dev/null; [ "\${STUB_FAIL:-}" = dump ] && exit 3; printf 'FAKE-DUMP-BYTES' > "$4"; [ "\${STUB_FAIL:-}" = nocounts ] || printf 'core.app_user\\t3\\nratings.rating\\t5\\n' ;;
  cat) cat "$2" ;;
  rm) rm -f "$3" ;;
esac`,
  );
  const aws = script(
    'aws.sh',
    `[ "\${STUB_FAIL:-}" = aws ] && exit 4
echo "$@" >> "${dir}/aws.log"; cp "$5" "${dir}/uploaded/$(basename "$5")"`,
  );
  const curl = script('curl.sh', `[ "\${STUB_FAIL:-}" = curl ] && exit 5\necho "$@" >> "${dir}/curl.log"`);
  const env = {
    PATH: process.env.PATH,
    BACKUP_SKIP_ENV: '1',
    PG_EXEC: pg,
    AWS_CMD: aws,
    CURL_CMD: curl,
    BACKUP_DIR: join(dir, 'local'),
    R2_ENDPOINT: 'https://r2.example',
    R2_BUCKET: 'minnal-backups',
    R2_ACCESS_KEY_ID: 'id',
    R2_SECRET_ACCESS_KEY: 'secret',
    BACKUP_HEARTBEAT_URL: 'https://beat.example/abc',
    ...overrides,
  };
  const res = spawnSync('bash', [backup], { env, encoding: 'utf8' });
  return { code: res.status, out: res.stdout + res.stderr };
}

const read = (file) => readFileSync(join(dir, file), 'utf8');
const logLines = (file) => (existsSync(join(dir, file)) ? read(file).trim().split('\n') : []);

describe('backup.sh', () => {
  it('uploads the dump then the manifest, writes the manifest fields, and calls the heartbeat last', () => {
    const { code, out } = run();
    assert.equal(code, 0, out);
    const files = readdirSync(join(dir, 'uploaded')).sort();
    assert.equal(files.length, 2);
    const dump = files.find((f) => f.endsWith('.dump'));
    const manifestFile = files.find((f) => f.endsWith('.manifest.json'));
    assert.match(dump, /^minnal-\d{8}T\d{6}Z\.dump$/);
    const manifest = JSON.parse(read(`uploaded/${manifestFile}`));
    assert.equal(manifest.dump, dump);
    assert.match(manifest.createdAtUtc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    assert.equal(manifest.sizeBytes, 'FAKE-DUMP-BYTES'.length);
    assert.match(manifest.sha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(manifest.rowCounts, { 'core.app_user': 3, 'ratings.rating': 5 });
    const uploads = logLines('aws.log');
    assert.equal(uploads.length, 2);
    assert.match(uploads[0], new RegExp(`s3://minnal-backups/postgres/${dump}$`));
    assert.match(uploads[1], /\.manifest\.json$/);
    assert.deepEqual(logLines('curl.log'), ['-fsS -m 20 --retry 3 -o /dev/null https://beat.example/abc']);
    assert.deepEqual(readdirSync(join(dir, 'local')), [], 'the local copies are removed after a good upload');
  });

  it('records the SHA-256 of the dump it uploaded', () => {
    assert.equal(run().code, 0);
    const dump = readdirSync(join(dir, 'uploaded')).find((f) => f.endsWith('.dump'));
    const manifest = JSON.parse(read(`uploaded/${readdirSync(join(dir, 'uploaded')).find((f) => f.endsWith('.json'))}`));
    const sha = spawnSync('sha256sum', [join(dir, 'uploaded', dump)], { encoding: 'utf8' }).stdout.split(' ')[0];
    assert.equal(manifest.sha256, sha);
  });

  it('exits non-zero and sends no heartbeat when the upload fails', () => {
    const { code, out } = run({ STUB_FAIL: 'aws' });
    assert.notEqual(code, 0);
    assert.match(out, /upload of .* failed/);
    assert.deepEqual(logLines('curl.log'), []);
  });

  it('exits non-zero, uploads nothing and sends no heartbeat when the dump fails', () => {
    const { code, out } = run({ STUB_FAIL: 'dump' });
    assert.notEqual(code, 0);
    assert.match(out, /pg_dump or the row counts failed/);
    assert.deepEqual(readdirSync(join(dir, 'uploaded')), []);
    assert.deepEqual(logLines('curl.log'), []);
  });

  it('refuses a dump with no row counts', () => {
    const { code, out } = run({ STUB_FAIL: 'nocounts' });
    assert.notEqual(code, 0);
    assert.match(out, /no row counts/);
    assert.deepEqual(logLines('curl.log'), []);
  });

  it('exits non-zero when the heartbeat call fails, after the backup is safely off-site', () => {
    const { code, out } = run({ STUB_FAIL: 'curl' });
    assert.notEqual(code, 0);
    assert.match(out, /heartbeat call failed/);
    assert.equal(readdirSync(join(dir, 'uploaded')).length, 2);
  });

  it('with BACKUP_UPLOAD=off keeps the files locally and touches neither R2 nor the heartbeat', () => {
    const { code, out } = run({ BACKUP_UPLOAD: 'off' });
    assert.equal(code, 0, out);
    assert.equal(readdirSync(join(dir, 'local')).length, 2);
    assert.deepEqual(readdirSync(join(dir, 'uploaded')), []);
    assert.deepEqual(logLines('curl.log'), []);
  });

  it('needs the R2 settings', () => {
    const { code, out } = run({ R2_BUCKET: '' });
    assert.notEqual(code, 0);
    assert.match(out, /R2_BUCKET/);
  });
});
