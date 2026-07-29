import { describe, it, expect } from 'vitest';
import {
  QB_CATEGORIES,
  QB_CATEGORY_LABELS,
  QB_CATEGORY_GROUP_LABELS,
  QB_CATEGORY_GROUP_ORDER,
  groupQBCategories,
  type QBCategory,
} from './index';

/**
 * QB_CATEGORY_GROUP_LABELS is the authoring-time mirror of
 * nexus_qb_tags.parent_id. The database is authoritative at runtime, but if
 * this map drifts, the teacher editors silently file topics under the wrong
 * heading (or dump them in "Other"). These tests make drift loud.
 */
describe('QB category grouping', () => {
  it('assigns every category to a section, none falling through to Other', () => {
    const ungrouped = QB_CATEGORIES.filter((c) => !QB_CATEGORY_GROUP_LABELS[c]);
    expect(ungrouped).toEqual([]);
  });

  it('only uses section names that exist in the render order', () => {
    const unknown = [...new Set(Object.values(QB_CATEGORY_GROUP_LABELS))].filter(
      (g) => g && !QB_CATEGORY_GROUP_ORDER.includes(g),
    );
    expect(unknown).toEqual([]);
  });

  it('keeps the label map and the category list in step', () => {
    const missingLabel = QB_CATEGORIES.filter((c) => !QB_CATEGORY_LABELS[c]);
    expect(missingLabel).toEqual([]);
  });

  it('groups every category exactly once', () => {
    const flat = groupQBCategories().flatMap((g) => g.categories);
    expect(flat).toHaveLength(QB_CATEGORIES.length);
    expect(new Set(flat).size).toBe(QB_CATEGORIES.length);
  });

  it('emits sections in the declared order', () => {
    const labels = groupQBCategories().map((g) => g.label);
    const expected = QB_CATEGORY_GROUP_ORDER.filter((g) => labels.includes(g));
    expect(labels).toEqual(expected);
  });

  it('puts the eight coordinate geometry topics under one heading', () => {
    const cg = groupQBCategories().find((g) => g.label === 'Coordinate Geometry');
    expect(cg?.categories.sort()).toEqual(
      [
        'areas_of_triangles',
        'circles',
        'conic_sections',
        'ellipse',
        'hyperbola',
        'locus',
        'parabola',
        'straight_lines',
      ].sort(),
    );
  });

  it('never lists a parent slug as a selectable category', () => {
    // Parents live in nexus_qb_tags only. A question tagged with one would be
    // an orphan, because filtering expands parents into their leaves.
    const parents = [
      'algebra',
      'coordinate_geometry',
      'calculus',
      'vectors_and_3d_geometry',
      'probability_and_statistics',
    ];
    for (const p of parents) {
      expect(QB_CATEGORIES).not.toContain(p as QBCategory);
    }
    // trigonometry is the exception: it is a root that is also a real leaf.
    expect(QB_CATEGORIES).toContain('trigonometry');
  });

  it('subsets correctly when given a partial list', () => {
    const groups = groupQBCategories(['circles', 'parabola', 'probability'] as QBCategory[]);
    expect(groups.map((g) => g.label)).toEqual(['Coordinate Geometry', 'Probability & Statistics']);
  });
});
