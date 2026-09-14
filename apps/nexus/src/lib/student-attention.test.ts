import { describe, it, expect } from 'vitest';
import { buildAttentionRows } from './student-attention';

const none = {
  duplicateCount: 0,
  mismatchCount: 0,
  neverSignedInCount: 0,
  noFormCount: 0,
  noStageCount: 0,
  noYearCount: 0,
  suggestionCount: 0,
};

describe('buildAttentionRows', () => {
  it('lists nothing when nothing needs attention', () => {
    expect(buildAttentionRows(none)).toEqual([]);
  });

  it('orders the most damaging problem first', () => {
    const rows = buildAttentionRows({
      duplicateCount: 1,
      mismatchCount: 2,
      neverSignedInCount: 6,
      noFormCount: 7,
      noStageCount: 14,
      noYearCount: 3,
      suggestionCount: 0,
    });
    expect(rows.map((r) => r.key)).toEqual([
      'duplicates',
      'mismatch',
      'never_signed_in',
      'no_form',
      'no_stage',
      'no_year',
    ]);
  });

  it('uses singular and plural copy', () => {
    expect(buildAttentionRows({ ...none, neverSignedInCount: 1 })[0].message).toBe(
      '1 student has never signed in to Nexus.',
    );
    expect(buildAttentionRows({ ...none, neverSignedInCount: 6 })[0].message).toBe(
      '6 students have never signed in to Nexus.',
    );
    expect(buildAttentionRows({ ...none, noStageCount: 14 })[0].message).toBe(
      '14 students have no class set. Priority and reminders cannot be targeted until they do.',
    );
    expect(buildAttentionRows({ ...none, noFormCount: 1 })[0].message).toBe(
      '1 student has no application form linked, so their class and exam year cannot be filled in from it.',
    );
  });

  it('lets every teacher look for missing forms', () => {
    expect(buildAttentionRows({ ...none, noFormCount: 3 })[0].actions).toEqual([
      { key: 'review_forms', label: 'Find their forms', primary: true },
    ]);
  });

  it('offers the application-form prefill only when there is something to fill', () => {
    expect(buildAttentionRows({ ...none, noStageCount: 2 })[0].actions.map((a) => a.key)).toEqual(['fix_stages']);
    const withPrefill = buildAttentionRows({ ...none, noStageCount: 2, suggestionCount: 5 })[0].actions;
    expect(withPrefill.map((a) => [a.key, !!a.primary])).toEqual([
      ['prefill', true],
      ['fix_stages', false],
    ]);
  });

  it('marks data-changing actions and leaves the list filters open to everyone', () => {
    const rows = buildAttentionRows({ ...none, duplicateCount: 1, neverSignedInCount: 1, noYearCount: 1 });
    expect(rows.flatMap((r) => r.actions).map((a) => [a.key, !!a.requiresEdit])).toEqual([
      ['review_duplicates', false],
      ['show_never_signed_in', false],
      ['fix_years', true],
    ]);
  });

  it('puts the two dormant decisions after sign-ins and before data housekeeping', () => {
    const rows = buildAttentionRows({
      ...none,
      neverSignedInCount: 1,
      noFormCount: 1,
      backInNexusCount: 1,
      notStartedLongCount: 2,
    });
    expect(rows.map((r) => r.key)).toEqual(['never_signed_in', 'back_in_nexus', 'not_started_long', 'no_form']);
  });

  it('words the dormant decisions for one and for many', () => {
    expect(buildAttentionRows({ ...none, backInNexusCount: 1 })[0].message).toBe(
      '1 paused student is back in Nexus. Bring them back, or leave them paused.',
    );
    expect(buildAttentionRows({ ...none, notStartedLongCount: 2 })[0].message).toBe(
      '2 students joined over 2 weeks ago and have not entered Nexus. Remind them again, or pause them with a reason.',
    );
    expect(buildAttentionRows({ ...none, notStartedLongCount: 1 })[0].message).toBe(
      '1 student joined over 2 weeks ago and has not entered Nexus. Remind them again, or pause them with a reason.',
    );
  });

  it('never uses a dash as punctuation in its copy', () => {
    const rows = buildAttentionRows({
      duplicateCount: 2,
      mismatchCount: 2,
      neverSignedInCount: 2,
      noFormCount: 2,
      noStageCount: 2,
      noYearCount: 2,
      suggestionCount: 2,
      backInNexusCount: 2,
      notStartedLongCount: 2,
    });
    for (const row of rows) {
      expect(row.message).not.toMatch(/—|--/);
      for (const action of row.actions) expect(action.label).not.toMatch(/—|--/);
    }
  });
});
