// The restore drill's R2 path (code review of Epics 6 and 7): which dump it picks, what it downloads, and the checksum gate,
// with a stub `aws` that serves a fake bucket and a stub `docker` that stops the run once the download is checked. The restore
// itself is exercised against a real Postgres by deploy/backup-drill-e2e.sh in CI, which reads from a folder, not from R2.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, it } from 'node:test';

const drill = fileURLToPath(new URL('./restore-drill.sh', import.meta.url));
let dir;
let bucket;

const script = (name, body) => {
  const path = join(dir, name);
  writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
};

/** One dump and its manifest in the fake bucket; `sha` lets a test corrupt the manifest. */
function putBackup(stamp, content, sha = createHash('sha256').update(content).digest('hex')) {
  writeFileSync(join(bucket, `minnal-${stamp}.dump`), content);
  writeFileSync(join(bucket, `minnal-${stamp}.manifest.json`), `{\n  "dump": "minnal-${stamp}.dump",\n  "sha256": "${sha}",\n  "rowCounts": {\n    "core.app_user": 1\n  }\n}\n`);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'minnal-drill-test-'));
  bucket = join(dir, 'bucket');
  mkdirSync(bucket);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function run(args = []) {
  // `aws s3 ls …/postgres/` lists the bucket like the real CLI (date time size key); `aws s3 cp …/postgres/<key> <dest>` copies out of it.
  const aws = script(
    'aws.sh',
    `echo "$@" >> "${dir}/aws.log"
case "$2" in
  ls) for f in "${bucket}"/*; do printf '2026-11-02 02:15:00 %10d %s\\n' "$(wc -c < "$f")" "$(basename "$f")"; done ;;
  cp) cp "${bucket}/$(basename "$5")" "$6" ;;
esac`,
  );
  // Stops the drill at "start the throwaway Postgres": everything before it (selection, download, checksum) has been exercised.
  const docker = script('docker.sh', '[ "$1" = run ] && exit 1\nexit 0');
  const env = {
    PATH: process.env.PATH,
    BACKUP_SKIP_ENV: '1',
    AWS_CMD: aws,
    DOCKER_CMD: docker,
    R2_ENDPOINT: 'https://r2.example',
    R2_BUCKET: 'minnal-backups',
    R2_ACCESS_KEY_ID: 'id',
    R2_SECRET_ACCESS_KEY: 'secret',
  };
  const res = spawnSync('bash', [drill, ...args], { env, encoding: 'utf8' });
  return { code: res.status, out: res.stdout + res.stderr };
}

const awsLog = () => (existsSync(join(dir, 'aws.log')) ? readFileSync(join(dir, 'aws.log'), 'utf8').trim().split('\n') : []);

describe('restore-drill.sh against R2', () => {
  it('takes the newest dump by name, downloads it and its manifest only, and passes the checksum', () => {
    putBackup('20261101T021500Z', 'OLD-DUMP');
    putBackup('20261102T021500Z', 'NEW-DUMP');
    writeFileSync(join(bucket, 'README.txt'), 'not a backup');
    const { out } = run();
    assert.match(out, /using minnal-20261102T021500Z\.dump/);
    assert.match(out, /checksum ok/);
    const copies = awsLog().filter((l) => l.startsWith('s3 cp'));
    assert.equal(copies.length, 2);
    assert.ok(copies.some((l) => l.includes('s3://minnal-backups/postgres/minnal-20261102T021500Z.dump')));
    assert.ok(copies.some((l) => l.includes('s3://minnal-backups/postgres/minnal-20261102T021500Z.manifest.json')));
    assert.ok(!copies.some((l) => l.includes('20261101')), 'the older dump is not downloaded');
  });

  it('drills the dump it is told to, not the newest', () => {
    putBackup('20261101T021500Z', 'OLD-DUMP');
    putBackup('20261102T021500Z', 'NEW-DUMP');
    const { out } = run(['minnal-20261101T021500Z.dump']);
    assert.match(out, /using minnal-20261101T021500Z\.dump/);
    assert.match(out, /checksum ok/);
  });

  it('fails on a checksum mismatch before it starts anything', () => {
    putBackup('20261102T021500Z', 'NEW-DUMP', 'f'.repeat(64));
    const { code, out } = run();
    assert.notEqual(code, 0);
    assert.match(out, /checksum mismatch for minnal-20261102T021500Z\.dump/);
    assert.doesNotMatch(out, /checksum ok/);
  });

  it('fails clearly when the bucket holds no dump', () => {
    writeFileSync(join(bucket, 'README.txt'), 'not a backup');
    const { code, out } = run();
    assert.notEqual(code, 0);
    assert.match(out, /no dump found/);
    assert.deepEqual(awsLog().filter((l) => l.startsWith('s3 cp')), []);
  });

  it('fails when the newest dump has no manifest, naming the download', () => {
    writeFileSync(join(bucket, 'minnal-20261102T021500Z.dump'), 'NEW-DUMP');
    const { code, out } = run();
    assert.notEqual(code, 0);
    assert.match(out, /download of minnal-20261102T021500Z\.manifest\.json failed|cannot read/);
  });
});
