import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * A caught error on a drawing route answers with the status it deserves.
 *
 * Every route here hand-rolled its own catch block:
 *
 *     const message = err instanceof Error ? err.message : 'Failed to load';
 *     return NextResponse.json({ error: message }, { status: 500 });
 *
 * verifyMsToken and getRequestUser throw a plain Error when a Microsoft token has
 * expired, so that block turned "your sign-in ran out" into 500. The client
 * cannot tell that apart from "the server broke", so it showed a crash to a
 * teacher whose only problem was a stale tab, and the real 500s were buried in
 * the same count. A wrong-role request from a parent account did the same.
 *
 * lib/api-errors already classifies those messages. errorResponse is the one way
 * out of a catch block on these routes: 401 for an expired sign-in, 403 for a
 * wrong role, 500 for everything genuinely broken, and the message preserved.
 *
 * A deliberate status a route decides for itself (400 for a malformed body, 404,
 * 409, the 503 that says a table is not migrated here) is untouched by this rule.
 * Only the catch-all belongs to errorResponse.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const API = join(REPO_ROOT, 'apps', 'nexus', 'src', 'app', 'api');

/** The routes the sketchbook hub is built on. */
const COVERED = [
  join(API, 'drawing', 'submissions'),
  join(API, 'drawing', 'notifications'),
  join(API, 'sketchbook'),
];

/**
 * Routes still answering 500 from a catch block.
 *
 * Empty, and meant to stay empty. The gallery, reference-library, homework and
 * brief-type routes are deliberately out of scope: they are retired surfaces, not
 * part of the sketchbook.
 */
const STILL_TO_MIGRATE: Record<string, string> = {};

/** A server error a route picked for itself, rather than one classified for it. */
const HAND_ROLLED = /status:\s*(500|isAuth\b|isAuthError\b|isAuth\s*\?)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) out.push(full);
  }
  return out;
}

function handRolled(): string[] {
  return COVERED.flatMap((dir) => walk(dir))
    .filter((file) => {
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      return HAND_ROLLED.test(code);
    })
    .map((file) => relative(REPO_ROOT, file).split(sep).join('/'))
    .sort();
}

describe('a caught drawing error carries the right status', () => {
  it('no route decides a 500 for itself, except the listed ones still to migrate', () => {
    expect(handRolled()).toEqual(Object.keys(STILL_TO_MIGRATE).sort());
  });
});
