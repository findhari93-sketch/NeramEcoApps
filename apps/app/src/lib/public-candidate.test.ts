import { describe, it, expect } from 'vitest';
import { toPublicCandidate, toPublicCandidates, withoutSimilarStudents } from './public-candidate';

const row = {
  rank: 120,
  aggregate_mark: 172.5,
  community: 'BC',
  college_code: '1101',
  college_name: 'Sample School of Architecture',
  allotted_category: 'BC',
  candidate_name: 'Someone Real',
  date_of_birth: '2007-01-01',
  application_number: 'APP123',
  id: 'uuid',
};

describe('toPublicCandidate', () => {
  it('keeps only non-personal fields', () => {
    expect(toPublicCandidate(row)).toEqual({
      rank: 120,
      aggregate_mark: 172.5,
      community: 'BC',
      college_code: '1101',
      college_name: 'Sample School of Architecture',
      allotted_category: 'BC',
    });
  });

  it('never returns a name, date of birth or application number', () => {
    const out = toPublicCandidate(row) as Record<string, unknown>;
    expect(out.candidate_name).toBeUndefined();
    expect(out.date_of_birth).toBeUndefined();
    expect(out.application_number).toBeUndefined();
    expect(out.id).toBeUndefined();
  });
});

describe('toPublicCandidates', () => {
  it('handles missing or malformed input', () => {
    expect(toPublicCandidates(undefined)).toEqual([]);
    expect(toPublicCandidates([null, 3, row])).toHaveLength(1);
  });
});

describe('withoutSimilarStudents', () => {
  it('removes the list and keeps the rest', () => {
    expect(withoutSimilarStudents({ predictedRankMin: 10, similarStudents: [row] })).toEqual({ predictedRankMin: 10 });
  });

  it('passes null through', () => {
    expect(withoutSimilarStudents(null)).toBeNull();
  });
});
