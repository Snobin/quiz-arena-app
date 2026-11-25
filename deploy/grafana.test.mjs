import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

test('the no-metrics alerts fire on absence, never on presence', () => {
  // `absent_over_time` returns nothing while the service reports (Grafana calls that NoData) and 1 once it stops. NoData
  // must therefore be OK: with "Alerting" the rule fires all the time, healthy or not.
  const rules = alerts.groups[0].rules.filter((r) => r.uid.startsWith('minnal-nometrics-'));
  assert.equal(rules.length, 3);
  for (const rule of rules) {
    assert.match(rule.data[0].model.expr, /^absent_over_time\(/, rule.uid);
    assert.equal(rule.noDataState, 'OK', rule.uid);
  }
});

// Every `minnal_*` metric a dashboard or alert queries must be a meter some service really registers. Without this a typo, or
// a Valkey stream name mistaken for a meter, leaves a panel empty and an alert that can never fire.
const root = fileURLToPath(new URL('..', import.meta.url));
const javaFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(path).isDirectory() ? javaFiles(path) : path.endsWith('.java') ? [path] : [];
  });

function registeredMeters() {
  const sources = [`${root}/contracts/src/main/java`, ...readdirSync(`${root}/services`).map((s) => `${root}/services/${s}/src/main/java`)].flatMap((d) => {
    try {
      return javaFiles(d).map((f) => readFileSync(f, 'utf8'));
    } catch {
      return [];
    }
  });
  const constants = new Map(); // NAME -> literals
  for (const src of sources) {
    for (const [, name, literal] of src.matchAll(/\b([A-Z][A-Z0-9_]*)\s*=\s*"(minnal\.[a-z0-9_.]+)"/g)) {
      constants.set(name, [...(constants.get(name) ?? []), literal]);
    }
  }
  const meters = new Set();
  const arg = /(?:Counter|Timer|Gauge|DistributionSummary|LongTaskTimer|MultiGauge)\.builder\(\s*([^,)\n]+)|\.(?:counter|timer|gauge|summary)\(\s*([^,)\n]+)/g;
  for (const src of sources) {
    for (const match of src.matchAll(arg)) {
      const token = (match[1] ?? match[2]).trim();
      const literal = token.match(/^"(minnal\.[a-z0-9_.]+)"$/);
      const names = literal ? [literal[1]] : (constants.get(token.split('.').pop()) ?? []);
      for (const name of names) meters.add(name.replaceAll('.', '_'));
    }
  }
  return meters;
}

test('every minnal_* metric on a dashboard or alert is registered by a service', () => {
  const meters = registeredMeters();
  assert.ok(meters.size > 10, `found only ${meters.size} registered meters: the scan is broken`);
  const queries = [...exprs(launch), ...exprs(health), ...alerts.groups.flatMap((g) => g.rules.flatMap((r) => r.data.map((d) => d.model?.expr ?? '')))];
  const used = new Set(queries.flatMap((q) => q.match(/\bminnal_[a-z0-9_]+/g) ?? []));
  assert.ok(used.size > 10, 'found no dashboard metrics: the scan is broken');
  for (const metric of used) {
    const stem = metric.replace(/_(bucket|count|sum|max)$/, '');
    const candidates = [stem, stem.replace(/_total$/, ''), stem.replace(/_(seconds|milliseconds|bytes|ratio)$/, ''), stem.replace(/_total$/, '').replace(/_(seconds|milliseconds|bytes|ratio)$/, '')];
    assert.ok(candidates.some((c) => meters.has(c)), `${metric} is on a dashboard or alert but no service registers a meter named like it`);
  }
});
