import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * The three Question Bank drawing routes are NOT classroom scoped.
 *
 * They were built on verifyQBAccess, which 400s a student who does not name a
 * classroom. The practice panel had no classroom to name, so every student who
 * opened a drawing question read "classroom_id is required" on screen; and
 * because the state call failed, "Show the solutions" could never turn on
 * either. Staff skip the enrolment check, so none of it showed up in testing.
 *
 * Nothing these routes touch is classroom scoped. drawing_submissions has no
 * classroom_id column at all, and nexus_qb_drawing_reveals is keyed on the
 * student and the question. verifyQBAccessAnyClassroom asks the question that
 * can actually be answered, "are you enrolled anywhere", and answers it on the
 * server where the enrolment already is.
 *
 * Same family as NXS-0114, which took the student test builder off the air.
 */

const ROUTES = join(__dirname, '..', 'app', 'api', 'question-bank', 'questions', '[id]');
const DRAWING_ROUTES = [
  'drawing-state',
  'drawing-attempt',
  'drawing-reveal',
  'peer-attempts',
] as const;

/**
 * Comments are where the reasons live, and the reasons name the very strings
 * this guard forbids. Judge the code, not the prose about it.
 */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('Question Bank drawing routes', () => {
  it.each(DRAWING_ROUTES)('%s asks for any classroom, never a named one', (name) => {
    const code = codeOnly(readFileSync(join(ROUTES, name, 'route.ts'), 'utf8'));

    expect(
      code,
      `${name} must gate on verifyQBAccessAnyClassroom.`,
    ).toContain('verifyQBAccessAnyClassroom(');

    expect(
      code,
      `${name} must not call verifyQBAccess: a student has no classroom to pass here, ` +
        'so it 400s every one of them with a developer message.',
    ).not.toContain('verifyQBAccess(');

    expect(
      code,
      `${name} must not read a classroom_id: the tables it writes do not have one.`,
    ).not.toContain('classroom_id');
  });
});

/**
 * "See how others drew this" shows one student's drawing to another.
 *
 * It lives under the Question Bank and authorises through the Question Bank's
 * verifier, so it is easy to forget that what it serves is the Inspiration
 * library. Two things must hold, and neither is visible from reading the route
 * in isolation:
 *
 *   1. It dies with the same switch. Staff turn Inspiration off per classroom;
 *      a second door that stays open would serve the drawings anyway.
 *   2. A student is never given the 'all' scope. That scope is how a teacher
 *      sees work its author asked to keep private.
 */
describe('the peer drawings door', () => {
  const code = codeOnly(readFileSync(join(ROUTES, 'peer-attempts', 'route.ts'), 'utf8'));

  it('dies with the Inspiration switch', () => {
    expect(code).toContain('inspirationEnabledFor(');
  });

  it('only ever widens the scope for staff', () => {
    expect(code).toContain("staff ? 'all' : 'visible'");
    // The only 'all' in the file is the one guarded by `staff ?`.
    expect(code.match(/'all'/g) ?? []).toHaveLength(1);
  });

  it('asks the server whether the student has earned it', () => {
    expect(code).toContain('peers_unlocked');
  });
});
