// A5 (Epic 2 retro): a stream's name is the only thing a producer and its consumers in different services share, so it
// is defined once, in contracts/, and every service takes it from there. This fails if a service's production code spells
// a stream key as a string literal (a copy that can drift), so a new stream, feeder or runner is wired to the real name.
// The names themselves are pinned in contracts/.../StreamNamesTest.java; behaviour through them is covered by the
// *Integration tests of each stream.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith('.java') ? [path] : [];
  });

describe('stream names', () => {
  const contracts = walk(join(root, 'contracts/src/main/java')).filter((f) => f.includes('/events/'));
  const services = readdirSync(join(root, 'services')).flatMap((s) => {
    try {
      return walk(join(root, 'services', s, 'src/main/java'));
    } catch {
      return [];
    }
  });
  // A quoted `minnal.<word>.<word>` is a stream key (metric names have other shapes or live in metrics classes).
  const streamLiteral = /"minnal\.(match\.completed|user\.deleted|rating\.updated)"/;

  it('are defined in contracts/ and nowhere else in production code', () => {
    const defined = contracts.filter((f) => streamLiteral.test(readFileSync(f, 'utf8')));
    assert.ok(defined.length >= 3, `expected the three streams to be defined in contracts, found ${defined.length}`);
    const copies = services.filter((f) => streamLiteral.test(readFileSync(f, 'utf8'))).map((f) => relative(root, f));
    assert.deepEqual(copies, [], `use the constant from contracts (MatchCompletedEvent, UserDeletedEvent, RatingUpdatedStream) instead of a copy of the name in: ${copies.join(', ')}`);
  });

  it('every stream a service touches is one of the contract constants', () => {
    // Any other quoted stream-key shape passed to a stream API in production code is a new stream: it must come with a contract.
    const bareKey = /(opsForStream\(\)|StreamRecords\.newRecord\(\)\.in\()[^;]*"minnal\./;
    const offenders = services.filter((f) => bareKey.test(readFileSync(f, 'utf8'))).map((f) => relative(root, f));
    assert.deepEqual(offenders, []);
  });
});
