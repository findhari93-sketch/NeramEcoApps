import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TEST_RETURN,
  DEFAULT_TEST_RETURN_LABEL,
  safeReturnPath,
  safeReturnLabel,
  takeTestHref,
} from './test-return';

/**
 * The return path arrives in a query string and ends up in router.push, which
 * makes it the one value in this feature an attacker can choose. Everything
 * here is about that: a link that looks like it goes back to a chapter must not
 * be able to land a logged-in student anywhere else.
 *
 * The rule throughout is the same as the language list's: never throw, always
 * return something usable. A bad return path should send the student to the
 * tests list, not to an error screen in the middle of a test they just sat.
 */

describe('safeReturnPath', () => {
  it('keeps an ordinary in-app path, query string and all', () => {
    expect(safeReturnPath('/student/study-materials?folder=8c9f4ef8')).toBe(
      '/student/study-materials?folder=8c9f4ef8',
    );
  });

  it('refuses a protocol-relative path, which is a different site', () => {
    // '//evil.example' is a URL, not a path: the browser reads the host from it
    // and the leading slash makes it look local at a glance.
    expect(safeReturnPath('//evil.example/login')).toBe(DEFAULT_TEST_RETURN);
    expect(safeReturnPath('///evil.example')).toBe(DEFAULT_TEST_RETURN);
  });

  it('refuses a backslash, which some browsers normalise into a slash', () => {
    // '/\evil.example' has been treated as '//evil.example' often enough that
    // the character is simply not allowed here.
    expect(safeReturnPath('/\\evil.example')).toBe(DEFAULT_TEST_RETURN);
    expect(safeReturnPath('/student\\..\\admin')).toBe(DEFAULT_TEST_RETURN);
  });

  it('refuses an absolute URL even when the host is ours', () => {
    // Nothing needs it, and allowing one host means owning a host allowlist.
    expect(safeReturnPath('https://nexus.neramclasses.com/student/tests')).toBe(DEFAULT_TEST_RETURN);
    expect(safeReturnPath('javascript:alert(1)')).toBe(DEFAULT_TEST_RETURN);
  });

  it('refuses a relative path, because router.push would resolve it against the player', () => {
    expect(safeReturnPath('student/tests')).toBe(DEFAULT_TEST_RETURN);
    expect(safeReturnPath('../admin')).toBe(DEFAULT_TEST_RETURN);
  });

  it('refuses whitespace and control characters rather than trying to clean them', () => {
    expect(safeReturnPath('/student /tests')).toBe(DEFAULT_TEST_RETURN);
    expect(safeReturnPath('/student\n/tests')).toBe(DEFAULT_TEST_RETURN);
    expect(safeReturnPath('/student\t/tests')).toBe(DEFAULT_TEST_RETURN);
  });

  it('falls back for anything that is not a usable string', () => {
    for (const raw of [null, undefined, '', '   ', 42, {}, []]) {
      expect(safeReturnPath(raw)).toBe(DEFAULT_TEST_RETURN);
    }
  });

  it('caps an absurdly long path instead of pushing it', () => {
    expect(safeReturnPath(`/student/${'a'.repeat(3000)}`)).toBe(DEFAULT_TEST_RETURN);
  });
});

describe('safeReturnLabel', () => {
  it('keeps a short label', () => {
    expect(safeReturnLabel('Back to the chapter')).toBe('Back to the chapter');
  });

  it('trims and collapses whitespace, because this sits on a button', () => {
    expect(safeReturnLabel('  Back to   the chapter \n')).toBe('Back to the chapter');
  });

  it('truncates rather than letting a label break the button', () => {
    const out = safeReturnLabel('B'.repeat(200));
    expect(out.length).toBeLessThanOrEqual(40);
  });

  it('falls back when there is nothing to show', () => {
    for (const raw of [null, undefined, '', '   ', 42]) {
      expect(safeReturnLabel(raw)).toBe(DEFAULT_TEST_RETURN_LABEL);
    }
  });
});

describe('takeTestHref', () => {
  it('builds the player URL the take page already reads', () => {
    const href = takeTestHref({ testId: 't1', placementId: 'p1' });
    expect(href.startsWith('/student/tests/take?')).toBe(true);
    const qs = new URLSearchParams(href.split('?')[1]);
    expect(qs.get('test_id')).toBe('t1');
    expect(qs.get('placement_id')).toBe('p1');
  });

  it('omits a placement rather than sending an empty one', () => {
    // placement_id='' would reach getPlacementById as a malformed uuid.
    const qs = new URLSearchParams(takeTestHref({ testId: 't1' }).split('?')[1]);
    expect(qs.has('placement_id')).toBe(false);
  });

  it('encodes a return path that carries its own query string', () => {
    const href = takeTestHref({
      testId: 't1',
      placementId: 'p1',
      returnTo: '/student/study-materials?folder=abc&file=def',
      returnLabel: 'Back to the chapter',
    });
    const qs = new URLSearchParams(href.split('?')[1]);
    // The whole thing survives, rather than 'file=def' being read as a
    // parameter of the player.
    expect(qs.get('return')).toBe('/student/study-materials?folder=abc&file=def');
    expect(qs.get('return_label')).toBe('Back to the chapter');
  });

  it('only sends mode when it is revision', () => {
    // 'official' is the engine's default. Sending it would mean every caller
    // has to keep agreeing with that default in a second place.
    expect(new URLSearchParams(takeTestHref({ testId: 't1' }).split('?')[1]).has('mode')).toBe(false);
    expect(
      new URLSearchParams(takeTestHref({ testId: 't1', mode: 'official' }).split('?')[1]).has('mode'),
    ).toBe(false);
    expect(
      new URLSearchParams(takeTestHref({ testId: 't1', mode: 'revision' }).split('?')[1]).get('mode'),
    ).toBe('revision');
  });

  it('refuses to smuggle an off-site return through the builder', () => {
    const qs = new URLSearchParams(
      takeTestHref({ testId: 't1', returnTo: '//evil.example' }).split('?')[1],
    );
    // Sanitised on the way in as well as on the way out, so a bad path never
    // reaches the address bar to be copied and shared.
    expect(qs.get('return')).toBe(null);
  });
});
