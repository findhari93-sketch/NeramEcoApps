#!/usr/bin/env node
/**
 * pnpm pad:load: the Answer Pad under a burst (test plan level 9).
 *
 * Against a Nexus wired to STAGING, never production, as the E2E accounts:
 *   1. a teacher starts a session in "E2E Test Classroom" and asks a question;
 *   2. the students fire answers all at once (60 submits in one burst by default,
 *      spread over the students, with different letters): every student must end
 *      with exactly one locked answer, and every repeat must report that same answer;
 *   3. student and teacher snapshots are fetched all at once, as after a Realtime hint;
 *   4. the question is closed and the class ended.
 * Prints p50, p95 and max for each burst and writes a JSON report.
 *
 *   E2E_NEXUS_URL=http://localhost:3022 pnpm pad:load [--burst 60] [--out <file>] [--strict]
 *
 * A local dev server compiles on demand and is unoptimised, so its timings are an
 * upper bound. The p95 pass mark (under 1 second) fails the run only with --strict,
 * which is meant for a deployed preview. Correctness failures always fail it.
 */

import { writeFileSync } from 'node:fs';

const TEACHER = 'e2e-checklist@neramclasses.com';
const STUDENTS = [
  'e2etestingstudent@neramclasses.com',
  'e2e-checklist-student@neramclasses.com',
  'e2e-checklist-view-student@neramclasses.com',
];
const TEACHER_SNAPSHOTS = 20;
const P95_LIMIT_MS = 1_000;

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

const base = new URL(process.env.E2E_NEXUS_URL || 'http://localhost:3022');
if (/(^|\.)neramclasses\.com$/i.test(base.hostname) && !/staging|preview/i.test(base.hostname)) {
  console.error('Refusing to load-test production.');
  process.exit(1);
}
const burst = Math.max(STUDENTS.length, Number(option('--burst', '60')) || 60);
const strict = process.argv.includes('--strict');
const out = option('--out');

const tokenFor = (email) => `test_${Buffer.from(email).toString('base64')}`;

async function call(email, method, path, body) {
  const started = performance.now();
  try {
    const response = await fetch(new URL(path, base), {
      method,
      headers: { Authorization: `Bearer ${tokenFor(email)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    return { status: response.status, body: data, ms: performance.now() - started };
  } catch (err) {
    return { status: 0, body: { error: err instanceof Error ? err.message : 'fetch failed' }, ms: performance.now() - started };
  }
}

function stats(results) {
  const times = results.map((r) => r.ms).sort((a, b) => a - b);
  const at = (p) => times[Math.min(times.length - 1, Math.ceil((p / 100) * times.length) - 1)] ?? 0;
  return {
    requests: results.length,
    errors: results.filter((r) => r.status === 0 || r.status >= 500).length,
    p50: Math.round(at(50)),
    p95: Math.round(at(95)),
    max: Math.round(times[times.length - 1] ?? 0),
  };
}

const failures = [];
const expect = (ok, message) => {
  if (!ok) failures.push(message);
};

async function startSession() {
  const choice = await call(TEACHER, 'POST', '/api/pad/sessions', {});
  const room = choice.body.classrooms?.find((c) => c.name === 'E2E Test Classroom');
  if (!room) throw new Error(`E2E Test Classroom not offered (${choice.status})`);

  let started = await call(TEACHER, 'POST', '/api/pad/sessions', { classroomId: room.id });
  if (started.status === 409 && started.body.code === 'SESSION_CONFLICT') {
    await call(TEACHER, 'POST', `/api/pad/sessions/${started.body.existing.session_id}/end`, { confirmUnrevealed: true });
    started = await call(TEACHER, 'POST', '/api/pad/sessions', { classroomId: room.id });
  }
  if (started.status !== 200) throw new Error(`could not start a session (${started.status} ${started.body.code ?? ''})`);
  return started.body.sessionId;
}

console.log(`Load test on ${base.origin}: ${burst} submits at once from ${STUDENTS.length} students.`);
const sessionId = await startSession();
const report = { target: base.origin, sessionId, burst, at: new Date().toISOString() };

try {
  for (const email of STUDENTS) await call(email, 'GET', `/api/pad/sessions/${sessionId}/snapshot?touch=1`);

  const asked = await call(TEACHER, 'POST', '/api/pad/prompts/ask', { sessionId, answerType: 'mcq', optionCount: 4 });
  if (asked.status !== 200) throw new Error(`ASK failed (${asked.status})`);
  const promptId = asked.body.promptId;

  // 2. The submit burst.
  const submits = await Promise.all(
    Array.from({ length: burst }, (_, i) => {
      const email = STUDENTS[i % STUDENTS.length];
      return call(email, 'POST', '/api/pad/submit', { promptId, answer: 'ABCD'[i % 4] }).then((r) => ({ ...r, email }));
    }),
  );
  report.submit = stats(submits);

  for (const email of STUDENTS) {
    const mine = submits.filter((r) => r.email === email && r.status === 200);
    const accepted = mine.filter((r) => r.body.status === 'accepted');
    expect(accepted.length === 1, `${email}: ${accepted.length} answers accepted, expected exactly 1`);
    const locked = accepted[0]?.body.answer;
    expect(mine.every((r) => r.body.answer === locked), `${email}: a repeat reported a different answer than the one locked`);
  }
  expect(submits.every((r) => r.status === 200), `${submits.filter((r) => r.status !== 200).length} submits did not answer 200`);

  const teacherView = await call(TEACHER, 'GET', `/api/pad/sessions/${sessionId}/snapshot`);
  expect(teacherView.body.prompt?.answered_count === STUDENTS.length, `answered_count is ${teacherView.body.prompt?.answered_count}, expected ${STUDENTS.length}`);

  // 3. The refetch storm after a hint.
  const storm = await Promise.all([
    ...Array.from({ length: burst }, (_, i) => call(STUDENTS[i % STUDENTS.length], 'GET', `/api/pad/sessions/${sessionId}/snapshot`)),
    ...Array.from({ length: TEACHER_SNAPSHOTS }, () => call(TEACHER, 'GET', `/api/pad/sessions/${sessionId}/snapshot`)),
  ]);
  report.snapshots = stats(storm);
  expect(storm.every((r) => r.status === 200), `${storm.filter((r) => r.status !== 200).length} snapshots did not answer 200`);

  // 4. Tidy up.
  const closed = await call(TEACHER, 'POST', `/api/pad/prompts/${promptId}/close`);
  expect(closed.status === 200, `CLOSE failed (${closed.status})`);
} finally {
  await call(TEACHER, 'POST', `/api/pad/sessions/${sessionId}/end`, { confirmUnrevealed: true });
}

for (const [name, s] of [['submit burst', report.submit], ['snapshot storm', report.snapshots]]) {
  if (!s) continue;
  console.log(`${name.padEnd(15)} ${String(s.requests).padStart(4)} requests  p50 ${s.p50} ms  p95 ${s.p95} ms  max ${s.max} ms  errors ${s.errors}`);
  if (s.p95 >= P95_LIMIT_MS) {
    const note = `${name} p95 ${s.p95} ms is over ${P95_LIMIT_MS} ms`;
    if (strict) failures.push(note);
    else console.log(`  note: ${note} (dev server timings are an upper bound; run with --strict against a preview)`);
  }
}

report.failures = failures;
if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

if (failures.length) {
  console.error(`FAILED:\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log('PASSED: one locked answer per student, no server errors.');
