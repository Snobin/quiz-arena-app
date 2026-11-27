#!/usr/bin/env node
// Load test for the real server: N concurrent Quick Matches played by guest players over /ws (Story 1.2 launch gate).
// Needs Node 22+ (built-in WebSocket and fetch). Nothing is persisted for guests; it uses the question bank and CPU only.
//
//   node deploy/loadtest/quick-match.mjs --matches 10
//   node deploy/loadtest/quick-match.mjs --matches 50 --stagger-ms 100
//
// Options: --api https://api.minnal.snobin.in  --origin https://minnal.snobin.in  --matches N (players = 2N)
// It prints the client-measured answer round trip (send answer -> ANSWER_ACCEPTED, includes your network) and error counts.
// The server-side answer-confirm p95 is on the Grafana Launch dashboard.

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, token, i, all) => {
    if (token.startsWith('--')) pairs.push([token.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
    return pairs;
  }, []),
);
const API = (args.api ?? 'https://api.minnal.snobin.in').replace(/\/$/, '');
const ORIGIN = args.origin ?? 'https://minnal.snobin.in';
const MATCHES = Number(args.matches ?? 10);
const ROUNDS = Number(args.rounds ?? 1); // waves of MATCHES matches, back to back (total matches = MATCHES x ROUNDS)
const STAGGER_MS = Number(args['stagger-ms'] ?? 50);
const QUESTIONS = 10;
const WS_URL = API.replace(/^http/, 'ws') + '/ws';

const rtts = [];
const stuck = [];
const errors = { token: 0, connect: 0, socket: 0, timeout: 0, serverError: 0 };
let completed = 0;
let receivedChars = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

async function guestToken() {
  const res = await fetch(`${API}/api/core/v1/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ lang: 'ml' }),
  });
  if (!res.ok) throw new Error(`guest token ${res.status}`);
  return (await res.json()).accessToken;
}

const frame = (command, headers, body = '') =>
  `${command}\n${Object.entries(headers).map(([k, v]) => `${k}:${v}`).join('\n')}\n\n${body}\0`;

async function play(index) {
  await sleep(index * STAGGER_MS);
  let token;
  try {
    token = await guestToken();
  } catch {
    errors.token++;
    return;
  }
  await new Promise((resolve) => {
    const ws = new WebSocket(WS_URL, { headers: { Origin: ORIGIN } });
    const sent = new Map();
    let matchId = null;
    let reveals = 0;
    let last = 'none';
    let done = false;
    const finish = (ok, kind) => {
      if (done) return;
      done = true;
      clearInterval(beat);
      clearTimeout(deadline);
      if (ok) completed++;
      else if (kind) errors[kind]++;
      try { ws.close(); } catch { /* already closed */ }
      resolve();
    };
    const beat = setInterval(() => ws.readyState === 1 && ws.send('\n'), 10_000);
    const deadline = setTimeout(() => {
      stuck.push({ player: index, matchId, reveals, answered: sent.size, lastMessage: last });
      finish(false, 'timeout');
    }, 4 * 60_000);

    const send = (destination, json = '{}') =>
      ws.send(frame('SEND', { destination, 'content-type': 'application/json' }, json));

    const onMessage = (m) => {
      last = m.type;
      if (m.type === 'MATCH_FOUND') {
        matchId = m.matchId;
        ws.send(frame('SUBSCRIBE', { id: 'match', destination: `/topic/match/${matchId}` }));
      } else if (m.type === 'QUESTION_STARTED') {
        const q = m.payload.questionIndex;
        setTimeout(() => {
          sent.set(q, performance.now());
          send(`/app/match/${matchId}/answer`, JSON.stringify({ questionIndex: q, optionIndex: Math.floor(Math.random() * 4) }));
        }, Math.random() * 800);
      } else if (m.type === 'ANSWER_ACCEPTED') {
        const t0 = sent.get(m.payload?.questionIndex);
        if (t0 !== undefined) rtts.push(performance.now() - t0);
      } else if (m.type === 'QUESTION_REVEALED') {
        if (++reveals >= QUESTIONS) finish(true);
      } else if (m.type === 'ERROR') {
        errors.serverError++;
      }
    };

    ws.onopen = () => ws.send(frame('CONNECT', { 'accept-version': '1.2', host: 'minnal', 'heart-beat': '10000,10000', Authorization: `Bearer ${token}` }));
    ws.onerror = () => finish(false, 'socket');
    ws.onclose = () => finish(false, 'socket');
    ws.onmessage = (event) => {
      receivedChars += String(event.data).length;
      for (const raw of String(event.data).split('\0')) {
        const text = raw.replace(/^\n+/, '');
        if (!text) continue;
        const [head, ...rest] = text.split('\n\n');
        const command = head.split('\n')[0];
        if (command === 'CONNECTED') {
          ws.send(frame('SUBSCRIBE', { id: 'priv', destination: '/user/queue/game' }));
          send('/app/matchmaking/QUICK/join');
        } else if (command === 'MESSAGE') {
          try { onMessage(JSON.parse(rest.join('\n\n'))); } catch { /* ignore non-JSON */ }
        } else if (command === 'ERROR') {
          errors.connect++;
          finish(false);
        }
      }
    };
  });
}

console.log(`Quick Match load: ${ROUNDS} round(s) of ${MATCHES} matches (${MATCHES * 2} players each) against ${API}`);
const started = performance.now();
let totalFinished = 0;
for (let round = 1; round <= ROUNDS; round++) {
  const from = rtts.length;
  const before = completed;
  const t0 = performance.now();
  await Promise.all(Array.from({ length: MATCHES * 2 }, (_, i) => play(i)));
  const wave = rtts.slice(from).sort((a, b) => a - b);
  totalFinished += completed - before;
  if (ROUNDS > 1) {
    console.log(`round ${round}/${ROUNDS}: ${((performance.now() - t0) / 1000).toFixed(0)}s, finished ${completed - before}/${MATCHES * 2}, answers ${wave.length}, rtt p95 ${wave.length ? pct(wave, 0.95).toFixed(0) : '-'} ms, max ${wave.length ? wave.at(-1).toFixed(0) : '-'} ms`);
  }
}
const seconds = ((performance.now() - started) / 1000).toFixed(0);
const sorted = [...rtts].sort((a, b) => a - b);
const totalPlayers = MATCHES * 2 * ROUNDS;
console.log(`\nDone in ${seconds}s. Players finished: ${completed}/${totalPlayers} (${Math.floor(completed / 2)} matches)`);
console.log(`Answers confirmed: ${sorted.length}`);
if (sorted.length) {
  console.log(`Answer round trip (client side, ms): p50 ${pct(sorted, 0.5).toFixed(0)}  p95 ${pct(sorted, 0.95).toFixed(0)}  p99 ${pct(sorted, 0.99).toFixed(0)}  max ${sorted.at(-1).toFixed(0)}`);
}
const kb = receivedChars / 1024;
console.log(`Received by all clients: ${(kb / 1024).toFixed(2)} MB, about ${(kb / totalPlayers).toFixed(0)} KB per player per match (payload only, before TLS/TCP overhead)`);
console.log('Errors:', JSON.stringify(errors));
if (stuck.length) console.log('Stuck players:', JSON.stringify(stuck.slice(0, 5)));
process.exit(completed === totalPlayers && Object.values(errors).every((n) => n === 0) ? 0 : 1);
