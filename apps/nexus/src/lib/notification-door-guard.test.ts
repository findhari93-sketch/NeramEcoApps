import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * One door for student messages (founder rule, 2026-09-10 and 2026-09-13).
 *
 * Every message to a student must go through sendNudge in nudge-delivery.ts: that
 * is where the Teams chat (from a teacher), the activity feed fallback, the Nexus
 * bell, the dormant filter, auto-filled names and the delivery receipts live. A
 * route that writes a bell row itself reaches the bell and nothing else, which is
 * the silent failure this rule exists to end (three such routes wrote to a column
 * that did not exist for months).
 *
 * notifyStudents and notifyUser are wrappers over sendNudge, so calling them is
 * going through the door. Writing user_notifications, or calling
 * createUserNotification / dispatchNotification, from app code is not.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const NEXUS_SRC = join(REPO_ROOT, 'apps', 'nexus', 'src');

const DOOR = 'apps/nexus/src/lib/nudge-delivery.ts';

const STILL_TO_MIGRATE: Record<string, string> = {
  // Empty since 2026-09-14: every direct write moved to sendNudge, notifyUser or
  // notifyStudents (which calls sendNudge). Keep it empty.
};

const DIRECT_WRITE = [
  /from\(\s*['"]user_notifications['"]\s*\)[\s\S]{0,80}?\.(insert|upsert)\(/,
  /\bcreateUserNotification\(/,
  /\bdispatchNotification\(/,
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
