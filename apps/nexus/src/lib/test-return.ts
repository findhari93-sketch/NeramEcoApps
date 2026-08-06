/**
 * Getting a student to a test, and back to where they came from.
 *
 * A test now always opens at /student/tests/take, the one player in the app.
 * That player used to be reachable only from the tests list, so "back" could be
 * hardcoded; a chapter test opening there needs to return to the chapter
 * instead, and a class test to the class.
 *
 * The return path therefore arrives in a query string, which makes it the one
 * value in this flow that someone other than us chooses. It is passed straight
 * to router.push, so an unchecked '//evil.example' would send a logged-in
 * student off-site from a link that looks like ours. Everything below exists to
 * stop that, and to stop it in the builder as well as the reader so a bad path
 * never even reaches the address bar to be copied.
 *
 * Pure TypeScript, no JSX and no next/* imports, so the viewer, the player and
 * any future caller share one definition of what a return path is.
 */

/** Where a test returns to when nobody said otherwise. */
export const DEFAULT_TEST_RETURN = '/student/tests';
export const DEFAULT_TEST_RETURN_LABEL = 'Back to tests';

/** Longer than any real in-app path, short enough not to be worth pushing. */
const MAX_RETURN_LENGTH = 512;
/** A button, not a paragraph. */
const MAX_LABEL_LENGTH = 40;

/**
 * Space, any C0 control character, or DEL.
 *
 * Tested by codepoint rather than by a regex literal, because a character class
 * holding real control bytes is invisible in a diff and does not survive being
 * copied between files. `<= 0x20` covers tab, newline, carriage return and the
 * rest of C0 along with the plain space.
 */
function isControlOrSpace(code: number): boolean {
  return code <= 0x20 || code === 0x7f;
}

/**
 * An in-app path, or the default.
 *
 * Deliberately a whitelist of one shape rather than a blacklist of bad ones:
 * a single leading slash, then no backslash, no whitespace and no control
 * character. Everything else, including an absolute URL to our own host, is
 * refused, because allowing one host means owning and maintaining a host list.
 */
export function safeReturnPath(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_TEST_RETURN;
  const value = raw.trim();

  if (!value || value.length > MAX_RETURN_LENGTH) return DEFAULT_TEST_RETURN;
  // Must be rooted. A relative path would resolve against /student/tests/take.
  if (value[0] !== '/') return DEFAULT_TEST_RETURN;
  // '//host' and '/\host' are both read as a different site, the second because
  // browsers have historically normalised the backslash into a slash.
  if (value[1] === '/' || value[1] === '\\') return DEFAULT_TEST_RETURN;
  if (value.includes('\\')) return DEFAULT_TEST_RETURN;

  // A legitimate path carries %20, never a literal space. The regex catches the
  // exotic unicode spaces that a codepoint ceiling does not.
  if (/\s/.test(value)) return DEFAULT_TEST_RETURN;
  for (let i = 0; i < value.length; i += 1) {
    if (isControlOrSpace(value.charCodeAt(i))) return DEFAULT_TEST_RETURN;
  }

  return value;
}

/** The words on the button that goes back. Never blank, never long enough to wrap badly. */
export function safeReturnLabel(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_TEST_RETURN_LABEL;

  let cleaned = '';
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    // Control characters become spaces rather than disappearing, so two words
    // either side of a stray newline do not fuse into one.
    cleaned += isControlOrSpace(code) ? ' ' : raw[i];
  }

  const value = cleaned.replace(/\s+/g, ' ').trim();
  if (!value) return DEFAULT_TEST_RETURN_LABEL;
  return value.length > MAX_LABEL_LENGTH ? value.slice(0, MAX_LABEL_LENGTH).trimEnd() : value;
}

export interface TakeTestLink {
  testId: string;
  /**
   * The placement being sat. Carries the passing mark, the availability window
   * and the side-effect that marks a chapter complete, so a chapter test opened
   * without it grades against the test's own defaults and records nothing.
   */
  placementId?: string | null;
  /** 'revision' is practice after completion, and never touches the record. */
  mode?: 'official' | 'revision';
  returnTo?: string | null;
  returnLabel?: string | null;
}

/**
 * The player URL, built through URLSearchParams so a return path carrying its
 * own query string survives instead of being read as parameters of the player.
 */
export function takeTestHref(input: TakeTestLink): string {
  const qs = new URLSearchParams({ test_id: input.testId });

  // Omitted rather than sent empty: '' would reach getPlacementById as a
  // malformed uuid and fail the whole load rather than falling back.
  if (input.placementId) qs.set('placement_id', input.placementId);
  // 'official' is the engine's default. Sending it anyway would mean every
  // caller has to keep agreeing with that default in a second place.
  if (input.mode === 'revision') qs.set('mode', 'revision');

  if (input.returnTo) {
    const safe = safeReturnPath(input.returnTo);
    // Only when it is a real destination. Writing the default in would put a
    // redundant parameter on every link the tests list itself produces.
    if (safe !== DEFAULT_TEST_RETURN) {
      qs.set('return', safe);
      if (input.returnLabel) qs.set('return_label', safeReturnLabel(input.returnLabel));
    }
  }

  return `/student/tests/take?${qs.toString()}`;
}
