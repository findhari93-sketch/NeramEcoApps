import { describe, it, expect } from 'vitest';
import { pickSectionedDraw, testDrawSeed, type SectionedItem } from './question-draw';

/**
 * A sectioned draw is what makes a scheduled exam sittable: the questions move
 * inside each section so two students at adjacent desks see different orders,
 * but both still sit Mathematics, then Aptitude, then Drawing.
 */

const item = (id: string, section: string | null, order: number | null): SectionedItem => ({
  id,
  section,
  section_order: order,
});

/** A JEE-shaped paper: 4 maths, 6 aptitude, 2 drawing. */
const PAPER: SectionedItem[] = [
  ...Array.from({ length: 4 }, (_, i) => item(`m${i + 1}`, 'math_mcq', 1)),
  ...Array.from({ length: 6 }, (_, i) => item(`a${i + 1}`, 'aptitude', 3)),
  ...Array.from({ length: 2 }, (_, i) => item(`d${i + 1}`, 'drawing', 4)),
];

const sectionOf = (id: string) => (id[0] === 'm' ? 'math_mcq' : id[0] === 'a' ? 'aptitude' : 'drawing');

describe('pickSectionedDraw', () => {
  it('serves every question exactly once', () => {
    const out = pickSectionedDraw(PAPER, null, 1, 'seed');
    expect(out).toHaveLength(PAPER.length);
    expect(new Set(out).size).toBe(PAPER.length);
    expect([...out].sort()).toEqual(PAPER.map((i) => i.id).sort());
  });

  it('keeps each section contiguous', () => {
    const out = pickSectionedDraw(PAPER, null, 1, 'seed');
    const runs: string[] = [];
    for (const id of out) {
      const s = sectionOf(id);
      if (runs[runs.length - 1] !== s) runs.push(s);
    }
    // One run per section means nothing interleaved.
    expect(runs).toEqual(['math_mcq', 'aptitude', 'drawing']);
  });

  it('keeps sections in section_order regardless of input order', () => {
    const scrambled = [
      item('d1', 'drawing', 4),
      item('a1', 'aptitude', 3),
      item('m1', 'math_mcq', 1),
    ];
    expect(pickSectionedDraw(scrambled, null, 1, 'seed').map(sectionOf)).toEqual([
      'math_mcq',
      'aptitude',
      'drawing',
    ]);
  });

  it('does shuffle inside a section', () => {
    // Across a spread of seeds at least one must differ from the stored order,
    // or the shuffle is not happening at all.
    const stored = PAPER.filter((i) => i.section === 'aptitude').map((i) => i.id);
    const anyDifferent = Array.from({ length: 12 }, (_, s) =>
      pickSectionedDraw(PAPER, null, 1, `seed-${s}`).filter((id) => sectionOf(id) === 'aptitude'),
    ).some((order) => order.join() !== stored.join());
    expect(anyDifferent).toBe(true);
  });

  it('is deterministic for the same student, test and attempt', () => {
    const seed = testDrawSeed('student-1', 'test-1');
    expect(pickSectionedDraw(PAPER, null, 1, seed)).toEqual(pickSectionedDraw(PAPER, null, 1, seed));
  });

  it('gives two students different papers', () => {
    const a = pickSectionedDraw(PAPER, null, 1, testDrawSeed('student-a', 'test-1'));
    const b = pickSectionedDraw(PAPER, null, 1, testDrawSeed('student-b', 'test-1'));
    expect(a).not.toEqual(b);
  });

  it('reorders between attempts so position carries no memory', () => {
    const seed = testDrawSeed('student-1', 'test-1');
    expect(pickSectionedDraw(PAPER, null, 1, seed)).not.toEqual(
      pickSectionedDraw(PAPER, null, 2, seed),
    );
  });

  it('does not give two same-length sections the same permutation', () => {
    // Without folding the section key into the seed, these two would shuffle
    // identically, which would leak one section's order from the other.
    const paper = [
      ...Array.from({ length: 5 }, (_, i) => item(`m${i}`, 'math_mcq', 1)),
      ...Array.from({ length: 5 }, (_, i) => item(`a${i}`, 'aptitude', 3)),
    ];
    const out = pickSectionedDraw(paper, null, 1, 'seed');
    const maths = out.slice(0, 5).map((id) => id.replace('m', ''));
    const aptitude = out.slice(5).map((id) => id.replace('a', ''));
    expect(maths).not.toEqual(aptitude);
  });

  it('sorts an unsectioned group last, whatever order it carries', () => {
    const paper = [
      item('x1', null, 1),
      item('m1', 'math_mcq', 1),
      item('d1', 'drawing', 4),
    ];
    expect(pickSectionedDraw(paper, null, 1, 'seed')).toEqual(['m1', 'd1', 'x1']);
  });

  it('lets the smallest section_order in a group win', () => {
    // One stale row must not drag a whole section out of place.
    const paper = [
      item('a1', 'aptitude', 3),
      item('a2', 'aptitude', 99),
      item('d1', 'drawing', 4),
    ];
    expect(pickSectionedDraw(paper, null, 1, 'seed').indexOf('d1')).toBe(2);
  });

  it('degrades to a plain shuffle for a single-section paper', () => {
    const paper = Array.from({ length: 5 }, (_, i) => item(`q${i}`, 'aptitude', 3));
    const out = pickSectionedDraw(paper, null, 1, 'seed');
    expect([...out].sort()).toEqual(paper.map((p) => p.id).sort());
  });

  it('honours a per-section serve count when one is given', () => {
    const serve = new Map([['math_mcq', 2], ['aptitude', 3]]);
    const out = pickSectionedDraw(PAPER, serve, 1, 'seed');
    expect(out.filter((id) => sectionOf(id) === 'math_mcq')).toHaveLength(2);
    expect(out.filter((id) => sectionOf(id) === 'aptitude')).toHaveLength(3);
    // A section with no entry serves all of itself.
    expect(out.filter((id) => sectionOf(id) === 'drawing')).toHaveLength(2);
  });

  it('survives an empty paper and skips blank ids', () => {
    expect(pickSectionedDraw([], null, 1, 'seed')).toEqual([]);
    expect(pickSectionedDraw([item('', 'aptitude', 3), item('a1', 'aptitude', 3)], null, 1, 's')).toEqual(['a1']);
  });

  it('round-trips through a stored question_ids array', () => {
    // What nexus_test_draws stores is exactly this flat array, and applyTestDraw
    // rebuilds the served paper from it. Order in, same order out.
    const stored = pickSectionedDraw(PAPER, null, 1, 'seed');
    const byId = new Map(PAPER.map((i) => [i.id, i]));
    const rebuilt = stored.map((id) => byId.get(id)!.id);
    expect(rebuilt).toEqual(stored);
  });
});
