import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * WHO a student's message comes from.
 *
 * Founder, 2026-09-24: EVERY Teams chat to a student comes from Neram Assistant.
 * Nothing is ever sent from a teacher's own Teams. With 200 students, each
 * reaction, marked drawing and reminder opened another thread in the teacher's
 * personal chat list ("Hari commented on your sketch", 19 of them in three days)
 * and buried the conversations that matter.
 *
 * (The 2026-09-20 rule sent system messages as the Assistant but kept teacher
 * actions in the teacher's own chat so students could reply. That is replaced:
 * a teacher action now goes out as the Assistant with "From Hari" on the card
 * and a "Message Hari" button, so a student who wants to answer starts that chat
 * themselves, and only then.)
 *
 * Three kinds of call site, held here as data:
 *
 *   ASSISTANT     The system decided it. Sent as Neram Assistant with no name on it.
 *   FROM_TEACHER  A person did something for this student. Sent as Neram
 *                 Assistant with that teacher's name and Message button, which is
 *                 what passing `teacher`, `chat`, `sendAs` or `from` now means.
 *   NO_CHAT       Reaches no Teams chat at all by design.
 *
 * And one rule under all three, checked at the door itself: nudge-delivery.ts
 * never posts a chat with a person's token, and no file but teams-messaging.ts
 * touches sendTeamsChatMessage.
 *
 * Adding a sendNudge call? Put it in one of the three lists, with the reason.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const NEXUS_SRC = join(REPO_ROOT, 'apps', 'nexus', 'src');
const DOOR = 'apps/nexus/src/lib/nudge-delivery.ts';

/**
 * Nobody wrote these. They must never arrive from a person's own chat.
 *
 * The crons are not listed here one by one: they take their sender from
 * senderLookup() in teams-sender.ts, which returns an `assistant` fragment, and
 * the last test below holds that line for them.
 */
const ASSISTANT: Record<string, string> = {
  'apps/nexus/src/app/api/exams/[examId]/notify/route.ts':
    'Exam results. The founder named this one: it went out from their personal chat.',
  'apps/nexus/src/app/api/students/detail-request/nudge/route.ts':
    'The application form request. The founder named this one too.',
  'apps/nexus/src/app/api/cron/join-reminders/route.ts': 'A sweep, every morning.',
  'apps/nexus/src/app/api/cron/sketchbook-reminders/route.ts': 'A sweep, every morning.',
  'apps/nexus/src/app/api/student/exams/[examId]/query/route.ts':
    'A student asking about their result. Generated from their own data, and sent to STAFF, who are not who raised it.',
  'apps/nexus/src/lib/notify-students.ts':
    'Class notices: created, moved, cancelled, recording up, week published. An announcement to a class.',
};

/**
 * A person did something for this student, so the Assistant's card carries
 * their name and a Message button. Still Neram Assistant, never their own Teams.
 */
const FROM_TEACHER: Record<string, string> = {
  'apps/nexus/src/app/api/assignments/nudge/route.ts': 'A teacher chasing named students.',
  'apps/nexus/src/app/api/assignments/[id]/route.ts': 'A teacher marked their work.',
  'apps/nexus/src/app/api/catchup/nudge/route.ts': 'A teacher asking why.',
  'apps/nexus/src/app/api/timetable/[classId]/catchup-nudge/route.ts': 'A teacher asking why.',
  'apps/nexus/src/app/api/tests/runs/[placementId]/message/route.ts':
    'The Message button on the Students tab: a teacher typed it.',
  'apps/nexus/src/app/api/study-materials/files/[id]/nudge/route.ts': 'A teacher pointing at material.',
  'apps/nexus/src/app/api/students/watchlist/route.ts': 'A teacher chasing an inactive student.',
  'apps/nexus/src/app/api/photo-review/route.ts': 'A reviewer asking for a photo.',
  'apps/nexus/src/app/api/exam-schedule/remind/route.ts': 'A teacher reminding about a date.',
  'apps/nexus/src/app/api/exams/[examId]/makeup/route.ts': 'A teacher opened a window for this student.',
  'apps/nexus/src/app/api/exams/[examId]/attempt-override/route.ts': 'A teacher granted an extra attempt.',
  'apps/nexus/src/app/api/exams/[examId]/eligibility-override/route.ts': 'A teacher made a call on this student.',
  'apps/nexus/src/app/api/exams/[examId]/eligibility-override/bulk/route.ts': 'The same call, for several.',
  'apps/nexus/src/app/api/sketchbook/nudge/route.ts': 'A teacher chasing a sketchbook.',
  'apps/nexus/src/app/api/sketchbook/entries/[id]/react/route.ts': 'A teacher reacted to their drawing.',
  'apps/nexus/src/app/api/sketchbook/entries/[id]/feature/route.ts': 'A teacher featured their drawing.',
  'apps/nexus/src/app/api/documents/exam-broadcasts/route.ts': 'A teacher released a scorecard.',
  'apps/nexus/src/app/api/admin/delivery-health/route.ts': 'A diagnostic send, by hand.',
  'apps/nexus/src/lib/test-access-notify.ts': 'A teacher opened or refused a door for this student.',
  'apps/nexus/src/lib/drawing-release-server.ts':
    'A teacher releasing their own drawing feedback, with their praise line and sometimes their voice note attached. As personal as a message gets.',
  'apps/nexus/src/app/api/drawing/submissions/[id]/review/route.ts': 'The same feedback, released one at a time.',
  'apps/nexus/src/lib/qb-report-notify.ts':
    'A teacher checked the mistake these students reported and says what came of it, often with the reason. They may want to answer.',
  'apps/nexus/src/app/api/pad/prompts/[id]/nudge/route.ts':
    'The teacher pressed Nudge in a live class: "we are on Q.38, a guess is fine". The student may answer back with why.',
};

/** Deliberately no Teams chat, so no identity to get wrong. */
const NO_CHAT: Record<string, string> = {
  'apps/nexus/src/app/api/cron/catchup-digest/route.ts': "audience: 'staff'. A teacher digest.",
  'apps/nexus/src/app/api/cron/sketchbook-digest/route.ts': "audience: 'staff'. A teacher digest.",
  'apps/nexus/src/lib/recap-autodraft.ts': "audience: 'staff'. A recap waiting for review.",
  'apps/nexus/src/app/api/student/away-windows/route.ts': 'Tells STAFF that a student declared leave.',
  'apps/nexus/src/app/api/timetable/prework-escalations/route.ts': 'Sends to PARENT ids, not students.',
  'apps/nexus/src/app/api/classrooms/[id]/enrollments/route.ts':
    'Enrolled, removed, batch changed. Nobody wrote it to the student: the roster changed.',
  'apps/nexus/src/app/api/classrooms/[id]/enrollments/restore/route.ts': 'The same, in reverse.',
  'apps/nexus/src/lib/exam-recall-notifications.ts': 'Six recall events, feed and bell.',
  'apps/nexus/src/app/api/question-bank/questions/[id]/report/route.ts':
    "audience: 'staff', bell only. Tells the paper's uploader a student reported a mistake.",
  // Worth knowing rather than fixing here: a teacher presses this and the
  // student gets no chat from anybody, only the feed and the bell.
  'apps/nexus/src/app/api/timetable/[classId]/class-test/nudge/route.ts': 'Passes no sender at all.',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

interface CallSite {
  path: string;
  assistant: boolean;
  person: boolean;
  /** Spreads senderLookup()'s fragment, which is itself an Assistant sender. */
  viaLookup: boolean;
}

function callSites(): CallSite[] {
  const out: CallSite[] = [];
  for (const file of walk(NEXUS_SRC)) {
    const path = relative(REPO_ROOT, file).split(sep).join('/');
    if (path === DOOR) continue;
    const code = stripComments(readFileSync(file, 'utf8'));
    // Imported from the door, not merely a local function that shares the name:
    // ApplicationFormSheet.tsx declares its own sendNudge helper. The dynamic
    // form counts too, which is how away-windows avoids an import cycle.
    const fromDoor =
      /import\s*\{[^}]*\bsendNudge\b[^}]*\}\s*from\s*['"][^'"]*nudge-delivery['"]/.test(code) ||
      /import\(\s*['"][^'"]*nudge-delivery['"]\s*\)/.test(code);
    if (!fromDoor) continue;
    if (!/\bsendNudge\(/.test(code)) continue;
    out.push({
      path,
      assistant: /\bassistant:\s*\S/.test(code),
      person: /\b(teacher|sendAs):\s*\S/.test(code) || /\bchat:\s*\{/.test(code),
      viaLookup: /\bsenderFor\(/.test(code) || /\bsenderLookup\(/.test(code),
    });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

describe('who a student message comes from', () => {
  const sites = callSites();
  const listed = (p: string) => ASSISTANT[p] || FROM_TEACHER[p] || NO_CHAT[p];

  it('finds the call sites at all, so a rename cannot make this test vacuous', () => {
    expect(sites.length).toBeGreaterThan(20);
  });

  it('classifies every sendNudge call site', () => {
    expect(sites.filter((s) => !s.viaLookup && !listed(s.path)).map((s) => s.path)).toEqual([]);
  });

  it('never sends a system message from a person', () => {
    expect(sites.filter((s) => ASSISTANT[s.path] && s.person).map((s) => s.path)).toEqual([]);
  });

  it('actually sends the system messages as the Assistant', () => {
    expect(sites.filter((s) => ASSISTANT[s.path] && !s.assistant).map((s) => s.path)).toEqual([]);
  });

  it('names the teacher on every message a teacher did for a student', () => {
    expect(sites.filter((s) => FROM_TEACHER[s.path] && !s.person).map((s) => s.path)).toEqual([]);
  });

  it('keeps the no-chat call sites free of any sender', () => {
    expect(sites.filter((s) => NO_CHAT[s.path] && (s.person || s.assistant)).map((s) => s.path)).toEqual([]);
  });

  it('lists no file that has stopped calling sendNudge', () => {
    const live = new Set(sites.map((s) => s.path));
    const all = [...Object.keys(ASSISTANT), ...Object.keys(FROM_TEACHER), ...Object.keys(NO_CHAT)];
    expect(all.filter((p) => !live.has(p))).toEqual([]);
  });

  it('never posts a chat as a person at the door', () => {
    const door = stripComments(readFileSync(join(REPO_ROOT, DOOR), 'utf8'));
    expect(door).not.toMatch(/\bsendTeamsChatMessage\b/);
    expect(door).not.toMatch(/\bgetSenderAccessToken\b/);
  });

  it('keeps sendTeamsChatMessage inside teams-messaging.ts, called by nobody', () => {
    const users = walk(NEXUS_SRC)
      .map((f) => relative(REPO_ROOT, f).split(sep).join('/'))
      .filter((p) => p !== 'apps/nexus/src/lib/teams-messaging.ts')
      .filter((p) => /\bsendTeamsChatMessage\b/.test(stripComments(readFileSync(join(REPO_ROOT, p), 'utf8'))));
    expect(users).toEqual([]);
  });

  // The crons reach the Assistant through senderLookup rather than by naming it,
  // so the rule they have to keep is the simpler one: a job that runs itself at
  // ten in the morning never puts a teacher's name on what it sends.
  it('never lets a cron send as a person', () => {
    const crons = sites.filter((s) => s.path.includes('/api/cron/'));
    expect(crons.length).toBeGreaterThan(4);
    expect(crons.filter((s) => s.person).map((s) => s.path)).toEqual([]);
  });
});
