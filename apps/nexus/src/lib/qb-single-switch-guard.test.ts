import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * The student Question Bank has ONE switch: `student.question-bank` on the
 * Features screen.
 *
 * It used to have two. The second was per classroom (nexus_qb_classroom_links),
 * set from an "Open to students" switch beside the title of one exam's page and
 * from a row on the classroom page. Features could not see it. On 2026-09-21 it
 * was found closed for the only live classroom: the bank was missing from 42
 * students' sidebars, and because the Tests routes share the Question Bank
 * verifiers, their Tests page was refused too, all while Features read On.
 *
 * So nothing in Nexus may read or write that table, call its helpers, or call
 * the route that fronted it. The table and the helpers in packages/database are
 * left in place only because editing packages/ redeploys all four apps.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const ROOT = join(REPO_ROOT, 'apps', 'nexus', 'src');

const FORBIDDEN = [
  'nexus_qb_classroom_links',
  'isQBEnabledForClassroom',
  'enableQBForClassroom',
  'disableQBForClassroom',
  'question-bank/classroom-link',
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

function offenders(): string[] {
  const found: string[] = [];
  for (const file of walk(ROOT)) {
    const code = readFileSync(file, 'utf8');
    for (const needle of FORBIDDEN) {
      if (code.includes(needle)) {
        found.push(`${relative(REPO_ROOT, file).split(sep).join('/')}: ${needle}`);
      }
    }
  }
  return found;
}

describe('Question Bank single switch', () => {
  it('nothing in Nexus reads the retired per-classroom Question Bank switch', () => {
    expect(
      offenders(),
      'The per-classroom Question Bank switch was retired: it hid the bank and refused Tests ' +
        'while Features read On. Gate students on the student.question-bank flag and on enrolment.',
    ).toEqual([]);
  });
});
