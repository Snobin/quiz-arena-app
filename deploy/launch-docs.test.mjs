// Checks the launch documents of Story 7.4b: the checklist tags every item, the runbook carries what the story requires,
// and the monthly workflow opens the reminder issue.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const checklist = read('./LAUNCH-CHECKLIST.md');
const runbook = read('./RUNBOOK-restore.md');
const workflow = read('../.github/workflows/monthly-restore-drill.yml');

test('every checklist item is tagged OWNER or ENG and has a recorded answer or evidence', () => {
  const items = checklist.split('\n').filter((l) => /^- \[[ x]\]/.test(l));
  assert.ok(items.length >= 15, `only ${items.length} items`);
  for (const item of items) {
    assert.match(item, /\*\*\[(OWNER|ENG)\]\*\*/, item);
    if (/\*\*\[OWNER\]\*\*/.test(item)) assert.match(item, /Answer: /, item);
    if (/\*\*\[ENG\]\*\*/.test(item)) assert.match(item, /Evidence: |Evidence:/, item);
  }
});

test('an owner item is never checked by the checklist itself', () => {
  const checkedOwner = checklist.split('\n').filter((l) => /^- \[x\]/.test(l) && /\*\*\[OWNER\]\*\*/.test(l));
  assert.deepEqual(checkedOwner, []);
});

test('the checklist covers every topic the story names', () => {
  for (const topic of [/domain/i, /Cloudflare Pages/, /api\./, /OVHcloud Mumbai/, /50-player room/, /DPDP/, /consent screen/, /ADMIN_EMAILS/, /500 published/, /\/health/, /heartbeat/, /restore drill/, /dashboards and alerts/, /error budget/i, /TBD/]) {
    assert.match(checklist, topic);
  }
  assert.match(checklist, /launch is blocked while this item is open/);
});

test('the runbook states the targets, both procedures, the budget source and a drill log', () => {
  assert.match(runbook, /RPO 24 h/);
  assert.match(runbook, /RTO about 2 h/);
  assert.match(runbook, /## Monthly drill/);
  assert.match(runbook, /## Real recovery onto a new VPS/);
  for (const step of [/Provision/, /empty database/, /pg_restore/, /Point DNS/, /Verify/]) assert.match(runbook, step);
  assert.match(runbook, /uptime monitor's monthly report/);
  assert.match(runbook, /## Drill log\s+\| Date \(UTC\) \| Dump \| Duration \| Result \| By \|/);
});

test('the monthly workflow runs on the 1st and opens an issue titled "Monthly restore drill"', () => {
  assert.match(workflow, /cron: '0 3 1 \* \*'/);
  assert.match(workflow, /issues: write/);
  assert.match(workflow, /gh issue create --title "Monthly restore drill"/);
  assert.match(workflow, /RUNBOOK-restore\.md/);
});
