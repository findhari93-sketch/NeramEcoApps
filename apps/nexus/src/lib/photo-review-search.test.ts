import { describe, it, expect } from 'vitest';
import { rankPeople } from './people-search';
import {
  matchCountsByTab,
  otherTabsWithMatches,
  searchableName,
  toSearchable,
  type PhotoSearchEntry,
} from './photo-review-search';

const ORDER = ['pending', 'auto', 'missing', 'rejected', 'approved'] as const;

const row = (name: string | null, email: string | null) => ({ student: { name, email } });

/** The three students from the report, plus one on another tab. */
const INDEX: PhotoSearchEntry[] = [
  { id: '1', name: 'Afrin banu', tab: 'approved' },
  { id: '2', name: 'Bavishiya Senthilkumar', tab: 'approved' },
  { id: '3', name: 'Kaveya Rameshbabu', tab: 'approved' },
  { id: '4', name: 'Balaji Kumar', tab: 'pending' },
  { id: '5', name: 'Ooveya Velmurugan', tab: 'missing' },
];

describe('toSearchable', () => {
  it('matches only the name a card shows, never the email behind it', () => {
    const rows = [
      row('Bavishiya Senthilkumar', 'nathibavi85@gmail.com'),
      row('Ayana khan', 'nathi.ayana@neramclasses.com'),
    ];
    expect(rankPeople(toSearchable(rows), 'nathi')).toEqual([]);
  });

  it('ranks the rows it wraps, so the page can map them straight back', () => {
    const rows = [
      row('Afrin banu', 'Afrin_banu@neramclasses.com'),
      row('Bavishiya Senthilkumar', 'nathibavi85@gmail.com'),
      row('Kaveya Rameshbabu', 'Kaveya@neram.co.in'),
    ];
    const ranked = rankPeople(toSearchable(rows), 'ba').map((s) => s.row);
    expect(ranked).toEqual([rows[1], rows[0], rows[2]]);
  });
});

describe('searchableName', () => {
  it('falls back to the email when a student has no name, as the card does', () => {
    expect(searchableName({ name: null, email: 'someone@neramclasses.com' })).toBe(
      'someone@neramclasses.com',
    );
    expect(searchableName({ name: null, email: null })).toBe('');
  });
});

describe('matchCountsByTab', () => {
  it('is null while nothing is typed', () => {
    expect(matchCountsByTab(INDEX, '   ')).toBeNull();
  });

  it('counts the matching students on every tab', () => {
    expect(matchCountsByTab(INDEX, 'ba')).toEqual({
      pending: 1,
      auto: 0,
      missing: 0,
      rejected: 0,
      approved: 3,
    });
  });
});

describe('otherTabsWithMatches', () => {
  it('lists the other tabs holding matches, in tab order', () => {
    const counts = { pending: 1, auto: 0, missing: 2, rejected: 0, approved: 3 };
    expect(otherTabsWithMatches(counts, 'missing', ORDER)).toEqual([
      { tab: 'pending', count: 1 },
      { tab: 'approved', count: 3 },
    ]);
  });

  it('is empty while nothing is typed', () => {
    expect(otherTabsWithMatches(null, 'pending', ORDER)).toEqual([]);
  });
});
