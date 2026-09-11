import { describe, it, expect } from 'vitest';
import { findRosterDuplicates } from './roster-duplicates';

describe('findRosterDuplicates', () => {
  it('pairs a record with no Microsoft account and one with it, both ways (the Afrin shape)', () => {
    const flags = findRosterDuplicates([
      { id: 'gmail', name: 'Afrin', ms_oid: null },
      { id: 'org', name: 'Afrin banu', ms_oid: 'oid-1' },
      { id: 'other', name: 'Humaira safrin', ms_oid: 'oid-2' },
    ]);
    expect(flags.get('gmail')).toEqual({ id: 'org', name: 'Afrin banu' });
    expect(flags.get('org')).toEqual({ id: 'gmail', name: 'Afrin' });
    expect(flags.has('other')).toBe(false);
  });

  it('does not pair two Microsoft records that share a first name', () => {
    const flags = findRosterDuplicates([
      { id: 'a', name: 'Keerthana S', ms_oid: 'oid-a' },
      { id: 'b', name: 'Keerthana Suresh', ms_oid: 'oid-b' },
    ]);
    expect(flags.size).toBe(0);
  });

  it('ignores first names too short to mean anything', () => {
    const flags = findRosterDuplicates([
      { id: 'a', name: 'Al', ms_oid: null },
      { id: 'b', name: 'Al Khan', ms_oid: 'oid-b' },
    ]);
    expect(flags.size).toBe(0);
  });

  it('copes with missing names', () => {
    expect(findRosterDuplicates([{ id: 'a', name: null, ms_oid: null }]).size).toBe(0);
  });
});
