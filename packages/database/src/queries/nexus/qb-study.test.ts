import { describe, expect, it } from 'vitest';
import type { NexusNcertSection, NexusQBQuestionStudy } from '../../types';
import { buildQBStudyView, ncertPdfUrl, qbStudyIsVisible, qbStudyIsVisibleFor, type QBStudyCatalog } from './qb-study';

const sec = (ref: string, cls: number, ch: number, chTitle: string, no: string | null, title: string | null, pdf: string): NexusNcertSection => ({
  ref,
  subject: 'mathematics',
  class_level: cls,
  chapter_no: ch,
  chapter_title: chTitle,
  section_no: no,
  section_title: title,
  pdf_file: pdf,
  edition: 'Reprint 2026-27',
  sort_order: 0,
  is_active: true,
});

const catalog: QBStudyCatalog = {
  ncert: new Map(
    [
      sec('c11.2.4', 11, 2, 'Relations and Functions', '2.4', 'Functions', 'kemh102'),
      sec('c11.3', 11, 3, 'Trigonometric Functions', null, null, 'kemh103'),
      sec('c11.3.4', 11, 3, 'Trigonometric Functions', '3.4', 'Trigonometric Functions of Sum and Difference of Two Angles', 'kemh103'),
    ].map((s) => [s.ref, s]),
  ),
  tagNcert: new Map([
    ['functions', [{ ref: 'c11.2.4', beyond_ncert: false }]],
    ['trigonometry', [{ ref: 'c11.3', beyond_ncert: false }]],
    ['properties_of_triangles', [{ ref: 'c11.3.4', beyond_ncert: true }]],
  ]),
  tagLabels: new Map([
    ['functions', 'Functions'],
    ['trigonometry', 'Trigonometry'],
  ]),
};

const row = (over: Partial<NexusQBQuestionStudy>): NexusQBQuestionStudy => ({
  question_id: 'q1',
  primary_slug: 'functions',
  also_uses: [],
  concepts: [],
  source: 'ai',
  model: 'm',
  confidence: 0.95,
  rationale: null,
  reviewed_by: null,
  reviewed_at: null,
  created_at: '',
  updated_at: '',
  ...over,
});

describe('qbStudyIsVisible', () => {
  it('shows staff rows, reviewed rows and confident AI rows only', () => {
    expect(qbStudyIsVisible(row({ source: 'staff', confidence: null }))).toBe(true);
    expect(qbStudyIsVisible(row({ confidence: 0.5, reviewed_at: '2026-10-01' }))).toBe(true);
    expect(qbStudyIsVisible(row({ confidence: 0.85 }))).toBe(true);
    expect(qbStudyIsVisible(row({ confidence: 0.84 }))).toBe(false);
    expect(qbStudyIsVisible(null)).toBe(false);
  });
});

describe('qbStudyIsVisibleFor', () => {
  it('shows an unsure AI row when it agrees with the chapter the question already has', () => {
    const unsure = row({ primary_slug: 'functions', confidence: 0.6 });
    expect(qbStudyIsVisibleFor(unsure, ['mathematics', 'functions'])).toBe(true);
    // Disagreement waits for a teacher.
    expect(qbStudyIsVisibleFor(unsure, ['mathematics', 'trigonometry'])).toBe(false);
  });
});

describe('buildQBStudyView', () => {
  it('the founder example: domain of sqrt(2x-3) + sin x is Functions, trig only supports', () => {
    const view = buildQBStudyView(
      row({
        also_uses: ['trigonometry', 'functions', 'mathematics'],
        concepts: [
          { name: 'Domain of a function', why: 'Each square root needs a non-negative argument', ncert_ref: 'c11.2.4' },
          { name: 'sin x is defined for every real x', ncert_ref: 'c99.missing' },
        ],
      }),
      ['mathematics', 'trigonometry'],
      catalog,
    )!;

    expect(view.source).toBe('ai');
    expect(view.primary).toMatchObject({ slug: 'functions', label: 'Functions' });
    expect(view.primary!.ncert[0]).toMatchObject({ class_level: 11, section_no: '2.4', url: ncertPdfUrl('kemh102') });
    // The primary and broad subjects never repeat as "also uses".
    expect(view.also_uses.map((c) => c.slug)).toEqual(['trigonometry']);
    expect(view.concepts[0].ncert?.section_title).toBe('Functions');
    // An unknown NCERT ref is dropped, never a broken link.
    expect(view.concepts[1].ncert).toBeNull();
  });

  it('falls back to the chapter reading while the row waits for review', () => {
    const view = buildQBStudyView(row({ confidence: 0.4 }), ['mathematics', 'trigonometry'], catalog)!;
    expect(view.source).toBe('chapter');
    expect(view.primary?.slug).toBe('trigonometry');
    expect(view.concepts).toEqual([]);
  });

  it('marks chapters NCERT no longer covers', () => {
    const view = buildQBStudyView(null, ['mathematics', 'properties_of_triangles'], catalog)!;
    expect(view.primary?.ncert[0].beyond_ncert).toBe(true);
  });

  it('links a Foundation section for aptitude', () => {
    const view = buildQBStudyView(
      row({ primary_slug: 'building_materials', concepts: [{ name: 'English bond', foundation_section_id: 's1' }] }),
      ['aptitude', 'building_materials'],
      catalog,
      new Map([['s1', { chapter_id: 'c6', chapter_number: 6, chapter_title: 'Building Materials', section_id: 's1', section_title: 'Brick Cuts and Brick Bonds' }]]),
    )!;
    expect(view.concepts[0].foundation?.section_title).toBe('Brick Cuts and Brick Bonds');
  });

  it('shows nothing for a question with no chapter reading and no row', () => {
    expect(buildQBStudyView(null, ['aptitude', 'analogy'], catalog)).toBeNull();
  });
});
