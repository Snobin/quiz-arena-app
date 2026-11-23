import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const launch = read('./grafana/dashboards/launch.json');
const health = read('./grafana/dashboards/health.json');
const alerts = read('./grafana/alerts.json');

const titles = (dashboard) => dashboard.panels.map((p) => p.title);
const exprs = (dashboard) => dashboard.panels.flatMap((p) => p.targets.map((t) => t.expr));

test('the Launch dashboard has every panel the story names', () => {
  const t = titles(launch).join('\n');
  for (const wanted of [/7-day return/, /per session/, /bot-ended/, /queue wait/, /completed vs aborted/i, /Answer confirmation/, /Scoreboard broadcast/, /Battle Room hosts.*proxy/i]) {
    assert.match(t, wanted);
  }
});

test('the Launch dashboard draws the target lines', () => {
  const byTitle = (re) => launch.panels.find((p) => re.test(p.title));
  assert.equal(byTitle(/7-day return/).fieldConfig.defaults.thresholds.steps.at(-1).value, 0.4);
  assert.equal(byTitle(/per session/).fieldConfig.defaults.thresholds.steps.at(-1).value, 2);
  assert.equal(byTitle(/bot-ended/).fieldConfig.defaults.thresholds.steps.at(-1).value, 0.6);
  assert.equal(byTitle(/Answer confirmation/).fieldConfig.defaults.thresholds.steps.at(-1).value, 0.2);
  assert.equal(byTitle(/Scoreboard/).fieldConfig.defaults.thresholds.steps.at(-1).value, 0.5);
});

test('the Health dashboard covers requests, 5xx, heap and dead letters', () => {
  const t = titles(health).join('\n');
  for (const wanted of [/Requests/, /5xx/, /heap/, /Dead-lettered/, /Restarts/]) assert.match(t, wanted);
});

test('every dashboard query uses only the allowlisted label keys of Minnal metrics', () => {
  const allowed = new Set(['service', 'mode', 'outcome', 'reason', 'kind', 'source', 'status', 'le', 'area']);
  for (const expr of [...exprs(launch), ...exprs(health)]) {
    for (const [, labels] of expr.matchAll(/\{([^}]*)\}/g)) {
      for (const [, key] of labels.matchAll(/(\w+)\s*(?:=~|!=|=)/g)) assert.ok(allowed.has(key), `${key} in ${expr}`);
    }
    for (const [, keys] of expr.matchAll(/by \(([^)]*)\)/g)) {
      for (const key of keys.split(',').map((k) => k.trim()).filter(Boolean)) assert.ok(allowed.has(key), `${key} in ${expr}`);
    }
  }
});

test('the five alert rules exist, send by email, and keep no real address or token', () => {
  const rules = alerts.groups[0].rules;
  const ids = rules.map((r) => r.uid);
  for (const wanted of ['minnal-ack-p95', 'minnal-nometrics-core', 'minnal-nometrics-game', 'minnal-nometrics-ratings', 'minnal-5xx', 'minnal-deadletter', 'minnal-heap']) {
    assert.ok(ids.includes(wanted), wanted);
  }
  assert.equal(alerts.contactPoints[0].receivers[0].type, 'email');
  assert.equal(alerts.contactPoints[0].receivers[0].settings.addresses, '${ALERT_EMAIL}');
  assert.ok(rules.every((r) => r.data[0].datasourceUid === '${PROM_DS_UID}'));
  assert.doesNotMatch(JSON.stringify(alerts), /@[a-z0-9.-]+\.[a-z]{2,}/i);
  const forOf = (uid) => rules.find((r) => r.uid === uid).for;
  assert.equal(forOf('minnal-ack-p95'), '10m');
  assert.equal(forOf('minnal-5xx'), '10m');
  assert.equal(forOf('minnal-heap'), '10m');
  assert.equal(forOf('minnal-nometrics-ratings'), '0m'); // absent_over_time already spans 10 minutes
});
