#!/usr/bin/env node
/**
 * pnpm pad:simulate: a class of students for a manual Answer Pad test.
 *
 * Joins a live session by its room code as real E2E student accounts and answers
 * every question the teacher asks, after a random delay and with a chosen spread
 * of answers. One person can then drive the real teacher console (in Teams through
 * a tunnel, or in the browser) and watch a class respond.
 *
 *   pnpm pad:simulate --code 482913
 *   pnpm pad:simulate --code 482913 --answers B:60,A:25,C:15 --delay 2-10 --silent 1
 *
 * Options
 *   --code      The six digit room code on the teacher's console (required).
 *   --url       The Nexus dev server (default http://localhost:3022). Local only: the
 *               simulator signs in with test_ tokens, which production refuses anyway.
 *   --students  Comma separated student emails. Default: the E2E students enrolled in
 *               "E2E Test Classroom" on staging.
 *   --answers   Weighted answers, value:weight (default B:50,A:20,C:20,D:10). Letters
 *               beyond a question's options are skipped; yes/no questions use yes and no
 *               weights if given, otherwise half each; number and text questions answer
 *               the first value that fits, or 42 and "triangle".
 *   --delay     Seconds a student waits before answering, min-max (default 2-12).
 *   --silent    How many of the students keep the pad open and never answer (default 0).
 *
 * Stops when the teacher ends the class, or on Ctrl+C.
 */

const DEFAULT_STUDENTS = [
  'e2etestingstudent@neramclasses.com',
  'e2e-checklist-student@neramclasses.com',
  'e2e-checklist-view-student@neramclasses.com',
];
const POLL_MS = 3_000;
const HEARTBEAT_MS = 30_000;

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const base = new URL(option('--url', 'http://localhost:3022'));
if (!['localhost', '127.0.0.1'].includes(base.hostname)) fail('The simulator only talks to a local Nexus dev server.');

const code = (option('--code') ?? '').replace(/\D/g, '');
if (code.length !== 6) fail('Usage: pnpm pad:simulate --code <six digit room code> [--answers B:60,A:40] [--delay 2-12] [--silent 1]');

const students = (option('--students') ?? DEFAULT_STUDENTS.join(',')).split(',').map((email) => email.trim()).filter(Boolean);

const weights = (option('--answers') ?? 'B:50,A:20,C:20,D:10').split(',').flatMap((entry) => {
  const [value, weight] = entry.split(':');
  const n = Number(weight ?? 1);
  return value && Number.isFinite(n) && n > 0 ? [{ value: value.trim(), weight: n }] : [];
});

const [minDelay, maxDelay] = (option('--delay') ?? '2-12').split('-').map(Number);
if (!(minDelay >= 0 && maxDelay >= minDelay)) fail('--delay must look like 2-12');

const silentCount = Math.max(0, Math.min(students.length, Number(option('--silent', '0')) || 0));

const tokenFor = (email) => `test_${Buffer.from(email).toString('base64')}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const between = (min, max) => min + Math.random() * (max - min);

let stopping = false;
process.on('SIGINT', () => {
  if (stopping) process.exit(130);
  stopping = true;
  console.log('\nStopping. Press Ctrl+C again to quit at once.');
});

function log(email, message) {
  const time = new Date().toLocaleTimeString('en-IN', { hour12: false });
  console.log(`${time}  ${email.split('@')[0].padEnd(28)} ${message}`);
}

async function api(email, method, path, body) {
  try {
    const response = await fetch(new URL(path, base), {
      method,
      headers: { Authorization: `Bearer ${tokenFor(email)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body: data };
  } catch {
    return { ok: false, status: 0, body: { code: 'OFFLINE' } };
  }
}

function weighted(candidates) {
  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  let pick = Math.random() * total;
  for (const candidate of candidates) {
    pick -= candidate.weight;
    if (pick <= 0) return candidate.value;
  }
  return candidates[candidates.length - 1]?.value;
}

function answerFor(prompt) {
  switch (prompt.answer_type) {
    case 'mcq': {
      const letters = 'ABCDEF'.slice(0, prompt.option_count ?? 4);
      const valid = weights.filter((w) => w.value.length === 1 && letters.includes(w.value.toUpperCase()));
      return valid.length ? weighted(valid).toUpperCase() : letters[Math.floor(Math.random() * letters.length)];
    }
    case 'yesno': {
      const valid = weights.filter((w) => ['yes', 'no'].includes(w.value.toLowerCase()));
      return valid.length ? weighted(valid).toLowerCase() : Math.random() < 0.5 ? 'yes' : 'no';
    }
    case 'numeric':
      return weights.find((w) => /^-?\d+(\.\d+)?$/.test(w.value))?.value ?? '42';
    default:
      return weights.find((w) => w.value.length > 1)?.value ?? 'triangle';
  }
}

async function runStudent(email, index) {
  const silent = index < silentCount;
  const joined = await api(email, 'POST', '/api/pad/join', { code });
  if (!joined.ok) {
    log(email, `could not join: ${joined.body.code ?? joined.body.error ?? joined.status}`);
    return;
  }
  const sessionId = joined.body.sessionId;
  log(email, silent ? 'joined, and will stay silent' : 'joined');

  let touched = false;
  let lastBeat = Date.now();
  const scheduled = new Set();
  const reported = new Set();

  while (!stopping) {
    const snap = await api(email, 'GET', `/api/pad/sessions/${sessionId}/snapshot${touched ? '' : '?touch=1'}`);
    if (snap.ok) {
      touched = true;
      const { session, prompt, my_response: mine, score } = snap.body;

      if (session.status === 'ended') {
        log(email, `class ended. Score ${score.total_graded ? `${score.correct} of ${score.total_graded}` : 'not graded'}`);
        return;
      }

      if (prompt?.state === 'open' && !mine && !silent && !scheduled.has(prompt.id)) {
        scheduled.add(prompt.id);
        const waitSeconds = between(minDelay, maxDelay);
        log(email, `Q${prompt.sequence} is open, answering in ${waitSeconds.toFixed(1)}s`);
        setTimeout(async () => {
          if (stopping) return;
          const answer = answerFor(prompt);
          const result = await api(email, 'POST', '/api/pad/submit', { promptId: prompt.id, answer });
          log(email, result.ok ? `Q${prompt.sequence}: locked ${result.body.answer}` : `Q${prompt.sequence}: ${result.body.code ?? result.status}`);
        }, waitSeconds * 1000);
      }

      if (prompt?.state === 'revealed' && !reported.has(prompt.id)) {
        reported.add(prompt.id);
        const outcome = !mine ? 'did not answer' : prompt.ungraded ? 'poll' : mine.is_correct ? 'correct' : 'incorrect';
        log(email, `Q${prompt.sequence} revealed: ${outcome}`);
      }
    } else if (snap.status !== 0) {
      log(email, `snapshot refused: ${snap.body.code ?? snap.status}`);
      if (snap.status === 403 || snap.status === 404) return;
    }

    if (Date.now() - lastBeat >= HEARTBEAT_MS) {
      await api(email, 'POST', '/api/pad/heartbeat', { sessionId });
      lastBeat = Date.now();
    }
    await sleep(POLL_MS + index * 150);
  }
}

console.log(`Simulating ${students.length} students on ${base.origin}, room code ${code}. Ctrl+C to stop.`);
await Promise.all(students.map((email, index) => runStudent(email, index)));
