import { describe, it, expect, beforeEach } from 'vitest';
import {
  REPLY_TEMPLATES,
  defaultNote,
  mayReplaceNote,
  quickReplies,
  readLastNote,
  saveLastNote,
  templatesFor,
} from './issue-reply-templates';
import { STAFF_OUTCOMES } from './issue-status';

describe('issue reply templates', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('has at least one template for every outcome staff can pick, in both modes', () => {
    for (const mode of ['resolve', 'close'] as const) {
      for (const o of STAFF_OUTCOMES) {
        expect(templatesFor(mode, o.code).length, `${mode}/${o.code}`).toBeGreaterThan(0);
      }
    }
  });

  it('never offers a template for the system-only outcome or no outcome', () => {
    expect(templatesFor('resolve', 'no_response')).toEqual([]);
    expect(templatesFor('resolve', null)).toEqual([]);
  });

  it('uses no em dashes or double dashes (student-facing copy)', () => {
    const all = Object.values(REPLY_TEMPLATES).flatMap((m) => Object.values(m).flat());
    for (const t of all) {
      expect(t).not.toMatch(/—|--/);
    }
  });

  it('fills the built-in note when the teacher has none of their own', () => {
    expect(defaultNote('resolve', 'fixed', null)).toBe(REPLY_TEMPLATES.resolve.fixed[0]);
  });

  it("prefers the teacher's own last note for that outcome", () => {
    saveLastNote('resolve', 'fixed', '  Check and let me know if it is fixed ma  ');
    const last = readLastNote('resolve', 'fixed');
    expect(last).toBe('Check and let me know if it is fixed ma');
    expect(defaultNote('resolve', 'fixed', last)).toBe('Check and let me know if it is fixed ma');
    // Kept per outcome and per mode.
    expect(readLastNote('resolve', 'answered')).toBeNull();
    expect(readLastNote('close', 'fixed')).toBeNull();
  });

  it('lists the last note first and never twice', () => {
    const mine = quickReplies('resolve', 'fixed', 'My own words');
    expect(mine[0]).toEqual({ text: 'My own words', mine: true });
    expect(mine).toHaveLength(REPLY_TEMPLATES.resolve.fixed.length + 1);

    const same = quickReplies('resolve', 'fixed', REPLY_TEMPLATES.resolve.fixed[0]);
    expect(same).toHaveLength(REPLY_TEMPLATES.resolve.fixed.length);
    expect(same.every((r) => !r.mine)).toBe(true);
  });

  it('only replaces the note when the teacher has not typed their own', () => {
    expect(mayReplaceNote('', 'anything')).toBe(true);
    expect(mayReplaceNote('   ', 'anything')).toBe(true);
    expect(mayReplaceNote('Template text', 'Template text')).toBe(true);
    expect(mayReplaceNote('Template text, plus my edit', 'Template text')).toBe(false);
  });

  it('does not save an empty note', () => {
    saveLastNote('resolve', 'fixed', '   ');
    expect(readLastNote('resolve', 'fixed')).toBeNull();
  });
});
