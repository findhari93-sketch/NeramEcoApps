import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Founder rule, 2026-09-13: a dormant (paused) student appears in no student
 * list and no count, anywhere in Nexus.
 *
 * loadClassroomRoster already leaves them out by default. The way a list starts
 * showing them again is a new `includeDormant: true`, so every one of those has
 * to be written down here with the reason it is safe. A new one fails this test
 * until someone decides; a stale entry fails too, so the list stays honest.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

const ALLOWED: Record<string, string> = {
  'apps/nexus/src/app/api/students/stage-facts/route.ts':
    'The avatar ring must be able to show the paused state; it lists nobody.',
  'apps/nexus/src/app/api/catchup/overview/route.ts':
    'Loads everyone once, then splits with isTracked; dormant rows never reach the screen.',
  'apps/nexus/src/lib/catchup-cohort.ts':
    'Filters with isTracked immediately; dormant students are never on the All Clear wall.',
  'apps/nexus/src/app/api/sketchbook/class-rhythm/route.ts':
    'Splits with isTracked and sends only the paused COUNT for the footnote.',
  'packages/database/src/queries/nexus/exam-eligibility.ts':
    'Returns a dormant flag so test results can keep a paused student\'s real attempt (tagged, not counted) and drop the rest.',
  'apps/nexus/src/lib/exam-access.ts':
    'Scheduled exam roster (invigilation, publish). Still to migrate: see feedback_shared_student_list rollout checklist.',
};

const SCAN_DIRS = ['apps/nexus/src', 'packages/database/src'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function filesLoadingDormant(): string[] {
  const hits: string[] = [];
  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(REPO_ROOT, dir))) {
      const code = readFileSync(file, 'utf8')
        // Comments may mention the option; only real code counts.
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      if (/includeDormant\s*:\s*true/.test(code)) hits.push(relative(REPO_ROOT, file).split(sep).join('/'));
    }
  }
  return hits.sort();
}

describe('dormant students stay out of lists', () => {
  it('every includeDormant: true is allowlisted with a reason, and no entry is stale', () => {
    expect(filesLoadingDormant()).toEqual(Object.keys(ALLOWED).sort());
  });
});
