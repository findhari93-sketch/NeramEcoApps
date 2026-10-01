import { describe, expect, it } from 'vitest';
import {
  availableSections,
  buildColumns,
  buildSectionWeightage,
  chapterReason,
  classifyTrend,
  describeYears,
  formatPerPaper,
  heatCuts,
  heatStep,
  topChapters,
  trendGroups,
  type QBWeightagePayload,
} from './qb-weightage';

/**
 * Chapter weightage maths.
 *
 * The fixture is shaped like the real JEE bank: one paper most years, three in
 * one year, a run of missing years, and one half-imported year.
 */

const YEARS = [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2026];

function payload(): QBWeightagePayload {
  const papers = YEARS.map((year) => ({ year, papers: year === 2019 ? 3 : 1 }));
  papers.push({ year: 2020, papers: 2 });
  const totals = YEARS.map((year) => ({ section: 'math', year, questions: year === 2019 ? 75 : 25 }));
  // 2020 is only partly in the bank: 10 questions over two papers.
  totals.push({ section: 'math', year: 2020, questions: 10 });
  totals.push({ section: 'drawing', year: 2026, questions: 2 });

  const cells: QBWeightagePayload['cells'] = [];
  for (const year of YEARS) {
    const k = year === 2019 ? 3 : 1;
    // Integrals: two a paper, every year.
    cells.push({ section: 'math', year, chapter: 'definite_integrals', questions: 2 * k });
    // Vectors: only in the early years.
    if (year <= 2014) cells.push({ section: 'math', year, chapter: 'vectors', questions: 2 * k });
    // Probability: rare early, regular late.
    if (year >= 2017) cells.push({ section: 'math', year, chapter: 'probability', questions: 2 * k });
    // Questions still on the bare unit tag.
    cells.push({ section: 'math', year, chapter: 'trigonometry', questions: 1 });
  }
  cells.push({ section: 'math', year: 2020, chapter: 'definite_integrals', questions: 1 });

  return {
    exam_type: 'JEE_PAPER_2',
    papers,
    totals,
    cells,
    chapters: [
      { slug: 'definite_integrals', label: 'Definite Integrals', unit: 'calculus', unit_label: 'Calculus', unit_order: 2, chapter_order: 1, has_children: false },
      { slug: 'vectors', label: 'Vectors', unit: 'vectors_and_3d_geometry', unit_label: 'Vectors & 3D', unit_order: 3, chapter_order: 1, has_children: false },
      { slug: 'probability', label: 'Probability', unit: 'probability_and_statistics', unit_label: 'Probability & Statistics', unit_order: 4, chapter_order: 1, has_children: false },
      { slug: 'trigonometry', label: 'Trigonometry', unit: 'trigonometry', unit_label: 'Trigonometry', unit_order: 5, chapter_order: 0, has_children: true },
    ],
  };
}

describe('year columns', () => {
  it('folds missing years into one gap and marks a half-imported year', () => {
    const cols = buildColumns(payload(), 'math');
    const gap = cols.find((c) => c.kind === 'gap');
    expect(gap).toEqual({ kind: 'gap', from: 2021, to: 2025 });
    const y2020 = cols.find((c) => c.kind === 'year' && c.year === 2020);
    expect(y2020).toMatchObject({ partial: true });
    const y2019 = cols.find((c) => c.kind === 'year' && c.year === 2019);
    expect(y2019).toMatchObject({ partial: false, papers: 3 });
  });

  it('lists only sections with questions', () => {
    expect(availableSections(payload())).toEqual(['math', 'drawing']);
    expect(availableSections(null)).toEqual([]);
  });
});

describe('section weightage', () => {
  const s = buildSectionWeightage(payload(), 'math')!;

  it('uses share per paper, so a three-paper year does not triple a chapter', () => {
    const di = s.chapters.find((c) => c.slug === 'definite_integrals')!;
    // 2 of 25 every year, and 6 of 75 in 2019: always 2 in a 25-question paper.
    expect(di.perPaper).toBeCloseTo(2, 5);
    expect(di.askedAll).toBe(11);
    expect(di.ofAll).toBe(11);
  });

  it('leaves the partial year out of the averages but keeps its count', () => {
    expect(s.countedYears).not.toContain(2020);
    const di = s.chapters.find((c) => c.slug === 'definite_integrals')!;
    expect(di.counts[2020]).toBe(1);
  });

  it('hides questions still sitting on a bare unit tag', () => {
    expect(s.chapters.map((c) => c.slug)).not.toContain('trigonometry');
  });

  it('reads the paper size from the latest full year', () => {
    expect(s.paperSize).toBe(25);
  });

  it('calls trends from recent vs earlier years', () => {
    const by = Object.fromEntries(s.chapters.map((c) => [c.slug, c.trend]));
    expect(by.definite_integrals).toBe('steady');
    expect(by.vectors).toBe('stopped');
    expect(by.probability).toBe('new');
  });

  it('keeps units when chapters have parents', () => {
    expect(s.units.map((u) => u.slug)).toEqual(['calculus', 'vectors_and_3d_geometry', 'probability_and_statistics']);
  });

  it('switches to the recent window', () => {
    const r = buildSectionWeightage(payload(), 'math', 'recent')!;
    expect(r.window).toBe('recent');
    const p = r.chapters.find((c) => c.slug === 'probability')!;
    expect(p.of).toBe(5);
    expect(p.asked).toBe(4); // 2017, 2018, 2019, 2026 of 2016..2026
  });

  it('marks a short history as thin', () => {
    const d = buildSectionWeightage(payload(), 'drawing')!;
    expect(d.mode).toBe('thin');
    expect(d.hasTrends).toBe(false);
  });

  it('returns null for a section with no questions', () => {
    expect(buildSectionWeightage(payload(), 'aptitude')).toBeNull();
  });
});

describe('top chapters and groups', () => {
  const s = buildSectionWeightage(payload(), 'math')!;

  it('puts the every-year chapter first', () => {
    expect(topChapters(s, 2).map((c) => c.slug)[0]).toBe('definite_integrals');
  });

  it('explains a chapter in plain words', () => {
    const di = s.chapters.find((c) => c.slug === 'definite_integrals')!;
    expect(chapterReason(di, 'all')).toBe('Asked every year · 2 a paper');
  });

  it('sorts chapters into the four trend groups', () => {
    const groups = Object.fromEntries(trendGroups(s).map((g) => [g.key, g.chapters.map((c) => c.slug)]));
    expect(groups.regular).toEqual(['definite_integrals']);
    expect(groups.more).toEqual(['probability']);
    expect(groups.less).toEqual(['vectors']);
  });

  it('summarises the years behind the numbers', () => {
    expect(describeYears(s)).toBe('2010 to 2019 and 2026');
  });
});

describe('small helpers', () => {
  it('needs a real change before calling something rising', () => {
    expect(classifyTrend(0.012, 0.008, 25)).toBe('steady'); // 0.1 a paper more
    expect(classifyTrend(0.08, 0.04, 25)).toBe('rising');
    expect(classifyTrend(0.02, 0.06, 25)).toBe('falling');
  });

  it('steps heat colours by questions per paper', () => {
    const cuts = heatCuts(25);
    expect([0, 1, 2, 3, 4, 6].map((v) => heatStep(v, cuts))).toEqual([0, 1, 2, 3, 4, 5]);
    expect(heatStep(19, heatCuts(50))).toBe(5);
  });

  it('formats questions per paper', () => {
    expect(formatPerPaper(1.26)).toBe('1.3');
    expect(formatPerPaper(12.4)).toBe('12');
    expect(formatPerPaper(0.02)).toBe('<0.1');
  });
});
