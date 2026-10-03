// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { compactStudentFacts, type StudentFact } from './stage-facts';

const full = (over: Partial<StudentFact> = {}): StudentFact => ({
  stage: null,
  dormant: false,
  photo: null,
  name: null,
  language: 'english',
  limitedEnglish: false,
  drawingLevel: null,
  overallLevel: null,
  ...over,
});

describe('compactStudentFacts', () => {
  it('drops every field still at the value the provider would default it to', () => {
    expect(compactStudentFacts({ s1: full() })).toEqual({ s1: {} });
  });

  it('keeps every field that differs from its default', () => {
    const fact = full({
      stage: '12th',
      dormant: true,
      photo: 'https://x/p.jpg',
      name: 'Asha',
      language: 'tamil' as StudentFact['language'],
      limitedEnglish: true,
      drawingLevel: 'top' as StudentFact['drawingLevel'],
      overallLevel: 'top' as StudentFact['overallLevel'],
    });
    expect(compactStudentFacts({ s1: fact })).toEqual({ s1: fact });
  });

  it('keeps an entry per student, so optimistic patches still find it', () => {
    const out = compactStudentFacts({ a: full(), b: full({ name: 'B' }) });
    expect(Object.keys(out)).toEqual(['a', 'b']);
    expect(out.b).toEqual({ name: 'B' });
  });
});
