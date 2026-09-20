import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Every `users` embed on nexus_enrollments must name its foreign key.
 *
 * nexus_enrollments references users FOUR times (user_id, removed_by, dormant_by,
 * current_standard_set_by), so PostgREST cannot guess which one a bare
 * `users(...)` or `users!inner(...)` embed means. It refuses the whole query with
 * PGRST201, "Could not embed because more than one relationship was found for
 * 'nexus_enrollments' and 'users'".
 *
 * This is written as a guard rather than left to review because the failure is
 * usually SILENT. Most callers destructure `{ data }` and drop `error`, so a
 * rejected query reads as an empty roster: a backfill that reports success having
 * touched nobody, a Teams sync that removes everyone, a summary line saying no
 * student owes the test. Four of the five sites this test first caught were of
 * exactly that shape, and had been wrong for months. The fifth surfaced the raw
 * PostgREST sentence to a teacher inside a dialog, which is how it was noticed.
 *
 * The fix is always the same: `users!nexus_enrollments_user_id_fkey(...)`. An
 * un-aliased embed keeps the `users` result key when the hint is added, so adding
 * one never changes the shape the caller reads.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const ROOTS = [
  join(REPO_ROOT, 'apps', 'nexus', 'src'),
  join(REPO_ROOT, 'packages', 'database', 'src'),
];

/** `users(`, or `users!inner(`, with no `!nexus_enrollments_..._fkey` between. */
const UNHINTED_EMBED = /\busers(?:!inner)?\s*\(/;

const FROM_ENROLLMENTS = /\.from\(\s*['"]nexus_enrollments['"]\s*\)/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * The chained calls belonging to one query: everything up to the next `.from(`,
 * so a later query on a different table cannot be blamed on this one.
 */
function queryChunk(code: string, start: number): string {
  const next = code.indexOf('.from(', start);
  const end = next === -1 ? code.length : next;
  return code.slice(start, Math.min(end, start + 1500));
}

function offenders(): string[] {
  const found: string[] = [];
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      FROM_ENROLLMENTS.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = FROM_ENROLLMENTS.exec(code)) !== null) {
        if (UNHINTED_EMBED.test(queryChunk(code, match.index + match[0].length))) {
          found.push(relative(REPO_ROOT, file).split(sep).join('/'));
          break;
        }
      }
    }
  }
  return [...new Set(found)].sort();
}

describe('nexus_enrollments embeds name their foreign key', () => {
  it('no query embeds users without a !nexus_enrollments_..._fkey hint', () => {
    expect(offenders()).toEqual([]);
  });
});
