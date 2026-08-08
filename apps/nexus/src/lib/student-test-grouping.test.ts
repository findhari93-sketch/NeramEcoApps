import { describe, expect, it } from 'vitest';
import {
  UNCATEGORIZED_KEY,
  UNFILED_KEY,
  dominantCategory,
  groupByDominantCategory,
  groupByFolder,
  hasAnyFolder,
} from './student-test-grouping';
import type { GroupableTest } from './student-test-grouping';

/**
 * These hold the properties that make the grouped view readable rather than
 * merely present: the pile surfaces first, a tie never splits one pile into two,
 * and a paper with nothing recorded about it is still shown.
 */

function test(
  id: string,
  categories: Array<{ slug: string; n: number }> | null,
  questionCount = 20,
  folder: string | null = null,
): GroupableTest {
  return {
    id,
    folder_name: folder,
    content_summary: categories
      ? ({ v: 1, question_count: questionCount, categories } as never)
      : null,
  };
}

describe('dominantCategory', () => {
  it('picks the tag on the most questions', () => {
    const top = dominantCategory({
      v: 1,
      question_count: 20,
      categories: [
        { slug: 'scale', n: 4 },
        { slug: 'perspective', n: 12 },
      ],
    } as never);
    expect(top?.slug).toBe('perspective');
  });

  it('ignores a tag that covers the whole paper', () => {
    // 'aptitude' is on every question, so it describes the question bank rather
    // than this paper. Grouping by it would file every paper under one heading.
    const top = dominantCategory({
      v: 1,
      question_count: 20,
      categories: [
        { slug: 'aptitude', n: 20 },
        { slug: 'perspective', n: 6 },
      ],
    } as never);
    expect(top?.slug).toBe('perspective');
  });

  it('falls back to the umbrella tag when it is the only one', () => {
    // Dropping it here would leave the paper uncategorised, which is less true
    // than the umbrella.
    const top = dominantCategory({
      v: 1,
      question_count: 20,
      categories: [{ slug: 'aptitude', n: 20 }],
    } as never);
    expect(top?.slug).toBe('aptitude');
  });

  it('returns null for a paper with no summary and for one with no tags', () => {
    expect(dominantCategory(null)).toBeNull();
    expect(dominantCategory(undefined)).toBeNull();
    expect(dominantCategory({ v: 1, question_count: 5, categories: [] } as never)).toBeNull();
  });
});

describe('groupByDominantCategory', () => {
  it('puts the biggest pile first, which is the whole point of the view', () => {
    const groups = groupByDominantCategory([
      test('a', [{ slug: 'scale', n: 5 }]),
      test('b', [{ slug: 'perspective', n: 9 }]),
      test('c', [{ slug: 'perspective', n: 7 }]),
      test('d', [{ slug: 'perspective', n: 3 }]),
    ]);

    expect(groups[0].key).toBe('perspective');
    expect(groups[0].tests).toHaveLength(3);
    expect(groups[1].key).toBe('scale');
  });

  it('sends a tie to the same bucket every time, whatever the array order', () => {
    // The regression: with order-dependent tie-breaking these two papers land in
    // different groups, and a teacher sees two groups of one rather than one
    // group of two.
    const forwards = groupByDominantCategory([
      test('a', [
        { slug: 'perspective', n: 10 },
        { slug: 'scale', n: 10 },
      ]),
      test('b', [
        { slug: 'scale', n: 10 },
        { slug: 'perspective', n: 10 },
      ]),
    ]);

    expect(forwards).toHaveLength(1);
    expect(forwards[0].key).toBe('perspective');
    expect(forwards[0].tests.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('uses the registry label and humanises a slug that has none', () => {
    const groups = groupByDominantCategory(
      [test('a', [{ slug: 'perspective', n: 5 }]), test('b', [{ slug: 'spatial_visualization', n: 5 }])],
      { perspective: 'Perspective drawing' },
    );

    const labels = groups.map((g) => g.label).sort();
    // A slug missing from the registry must never render blank.
    expect(labels).toEqual(['Perspective drawing', 'Spatial visualization']);
  });

  it('keeps papers with no summary in a bucket of their own, pinned last', () => {
    // The 28 papers built before provenance existed carry a null summary. They
    // must still be visible and deletable, which is exactly what a teacher
    // clearing clutter is looking for.
    const groups = groupByDominantCategory([
      test('old1', null),
      test('old2', null),
      test('old3', null),
      test('a', [{ slug: 'perspective', n: 5 }]),
    ]);

    expect(groups[groups.length - 1].key).toBe(UNCATEGORIZED_KEY);
    expect(groups[groups.length - 1].label).toBe('Not categorized');
    // Pinned last despite being the largest group: a catch-all leading the list
    // buries every group that means something.
    expect(groups[groups.length - 1].tests).toHaveLength(3);
    expect(groups[0].key).toBe('perspective');
  });

  it('returns nothing for an empty list rather than an empty bucket', () => {
    expect(groupByDominantCategory([])).toEqual([]);
  });
});

describe('groupByFolder', () => {
  it('groups by the student\'s own folder names and pins Unfiled last', () => {
    const groups = groupByFolder([
      test('a', null, 20, 'Perspective drills'),
      test('b', null, 20, null),
      test('c', null, 20, 'Perspective drills'),
      test('d', null, 20, 'Week 3'),
    ]);

    expect(groups.map((g) => g.key)).toEqual(['Perspective drills', 'Week 3', UNFILED_KEY]);
    expect(groups[2].label).toBe('Unfiled');
  });

  it('treats a whitespace-only folder name as unfiled', () => {
    const groups = groupByFolder([test('a', null, 20, '   ')]);
    expect(groups[0].key).toBe(UNFILED_KEY);
  });
});

describe('hasAnyFolder', () => {
  it('is false when every paper is unfiled, so the Folder view can be hidden', () => {
    expect(hasAnyFolder([test('a', null), test('b', null, 20, '  ')])).toBe(false);
  });

  it('is true as soon as one paper is filed', () => {
    expect(hasAnyFolder([test('a', null), test('b', null, 20, 'Week 1')])).toBe(true);
  });
});
