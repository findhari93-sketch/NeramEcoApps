import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * One door for student messages (founder rule, 2026-09-10 and 2026-09-13).
 *
 * Every message to a student must go through sendNudge in nudge-delivery.ts: that
 * is where the Teams chat (teacher or bot), the activity feed fallback, the Nexus
 * bell, the dormant filter, auto-filled names and the delivery receipts live. A
 * route that writes a bell row itself reaches the bell and nothing else, which is
 * the silent failure this rule exists to end (three such routes wrote to a column
 * that did not exist for months).
 *
 * The allowlist below is the MIGRATION CHECKLIST: routes that still write
 * notifications another way. Migrating one means removing its entry. A NEW file
 * that writes notifications directly fails this test.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const NEXUS_SRC = join(REPO_ROOT, 'apps', 'nexus', 'src');

const DOOR = 'apps/nexus/src/lib/nudge-delivery.ts';

const STILL_TO_MIGRATE: Record<string, string> = {
  'apps/nexus/src/lib/notify-students.ts': 'Timetable bell + activity ping fan-out; no chat, no dormant filter.',
  'apps/nexus/src/app/api/cron/catchup-digest/route.ts': 'Staff digest; move to sendNudge({ audience: "staff" }).',
  'apps/nexus/src/app/api/study-materials/files/[id]/nudge/route.ts': 'Copies the old tier logic by hand; no dormant filter, no receipts.',
  'apps/nexus/src/lib/recap-autodraft.ts': 'Staff notification written directly.',
  'apps/nexus/src/lib/exam-recall-notifications.ts': 'Bell rows written directly.',
  'apps/nexus/src/lib/test-access-notify.ts': 'Reopen granted/declined; bell only.',
  'apps/nexus/src/lib/teams-assignment-announcements.ts': 'Uses notifyStudents.',
  'apps/nexus/src/app/api/classrooms/[id]/enrollments/route.ts': 'Enrolment notices; bell only.',
  'apps/nexus/src/app/api/classrooms/[id]/enrollments/restore/route.ts': 'Enrolment restored; bell only.',
  'apps/nexus/src/app/api/assignments/[id]/route.ts': 'Document assignment reviewed; bell only (drawing reviews already use sendNudge).',
  'apps/nexus/src/app/api/timetable/route.ts': 'Class moved; uses notifyStudents.',
  'apps/nexus/src/app/api/timetable/[classId]/followup/route.ts': 'Absence reason needed; uses notifyStudents.',
  'apps/nexus/src/app/api/exams/route.ts': 'Test scheduled; uses notifyStudents.',
  'apps/nexus/src/app/api/cron/auto-close-issues/route.ts': 'Issue auto-closed; bell only.',
  'apps/nexus/src/app/api/foundation/issues/[id]/route.ts': 'Issue updates; bell only.',
};

const DIRECT_WRITE = [
  /from\(\s*['"]user_notifications['"]\s*\)[\s\S]{0,80}?\.(insert|upsert)\(/,
  /\bcreateUserNotification\(/,
  /\bdispatchNotification\(/,
  /\bnotifyStudents\(/,
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function directWriters(): string[] {
  return walk(NEXUS_SRC)
    .filter((file) => {
      const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      return DIRECT_WRITE.some((re) => re.test(code));
    })
    .map((file) => relative(REPO_ROOT, file).split(sep).join('/'))
    .filter((path) => path !== DOOR)
    .sort();
}

describe('student messages go through sendNudge', () => {
  it('no file writes notifications another way, except the listed ones still to migrate', () => {
    expect(directWriters()).toEqual(Object.keys(STILL_TO_MIGRATE).sort());
  });
});
