import { describe, it, expect } from 'vitest';
import type { NexusQBTagNode } from '@neram/database';
import {
  flattenTagTree,
  buildSlugChildMap,
  expandCategories,
  categoryLabelMap,
  nodeSelectionState,
  toggleCategoryNode,
  collapseCategories,
  ancestorsOf,
} from './qb-category-tree';

function node(
  slug: string,
  label: string,
  children: NexusQBTagNode[] = [],
  self = 0,
  rollup = 0,
): NexusQBTagNode {
  return {
    id: slug,
    group_type: 'subject',
    slug,
    label,
    parent_id: null,
    color: null,
    icon: null,
    sort_order: 0,
    is_system: true,
    is_active: true,
    created_by: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    self_count: self,
    rollup_count: rollup,
    children,
  };
}

const CG_CHILDREN = [
  node('straight_lines', 'Straight Lines', [], 15, 15),
  node('circles', 'Circles', [], 15, 15),
  node('parabola', 'Parabola', [], 8, 8),
  node('ellipse', 'Ellipse', [], 6, 6),
  node('hyperbola', 'Hyperbola', [], 6, 6),
  node('locus', 'Locus', [], 3, 3),
  node('areas_of_triangles', 'Areas of Triangles', [], 2, 2),
  node('conic_sections', 'Conic Sections (General)', [], 0, 0),
];

const TREE: NexusQBTagNode[] = [
  node(
    'algebra',
    'Algebra',
    [
      node('functions', 'Functions', [], 22, 22),
      node('permutations_combinations', 'Permutations & Combinations', [], 19, 19),
    ],
    0,
    41,
  ),
  node('coordinate_geometry', 'Coordinate Geometry', CG_CHILDREN, 0, 50),
  node('trigonometry', 'Trigonometry', [], 29, 29),
];

const ALL_CG = CG_CHILDREN.map((c) => c.slug);
const CG = TREE[1];

describe('flattenTagTree', () => {
  it('returns parents before their children, depth first', () => {
    expect(flattenTagTree(TREE).map((n) => n.slug).slice(0, 4)).toEqual([
      'algebra',
      'functions',
      'permutations_combinations',
      'coordinate_geometry',
    ]);
  });

  it('includes every node exactly once', () => {
    const slugs = flattenTagTree(TREE).map((n) => n.slug);
    expect(slugs).toHaveLength(new Set(slugs).size);
    expect(slugs).toHaveLength(13); // 3 roots + 2 algebra + 8 coordinate geometry
  });
});

describe('buildSlugChildMap', () => {
  it('maps a parent to its descendants and a leaf to nothing', () => {
    const map = buildSlugChildMap(TREE);
    expect(map.get('coordinate_geometry')).toEqual(ALL_CG);
    expect(map.get('circles')).toEqual([]);
    expect(map.get('trigonometry')).toEqual([]);
  });
});

describe('expandCategories', () => {
  it('expands a parent into itself plus all children', () => {
    const out = expandCategories(['coordinate_geometry'], TREE);
    expect(out).toContain('coordinate_geometry');
    for (const slug of ALL_CG) expect(out).toContain(slug);
    expect(out).toHaveLength(9);
  });

  it('is idempotent, which is what the server-side safety net relies on', () => {
    const once = expandCategories(['coordinate_geometry'], TREE);
    const twice = expandCategories(once, TREE);
    expect([...twice].sort()).toEqual([...once].sort());
  });

  it('does not duplicate a child that is also listed explicitly', () => {
    const out = expandCategories(['coordinate_geometry', 'circles'], TREE);
    expect(out.filter((s) => s === 'circles')).toHaveLength(1);
    expect(out).toHaveLength(9);
  });

  it('passes unknown slugs through untouched', () => {
    // 2d_composition is a real off-vocabulary slug on ~33 active questions.
    expect(expandCategories(['2d_composition'], TREE)).toEqual(['2d_composition']);
  });

  it('leaves a leaf selection alone', () => {
    expect(expandCategories(['circles'], TREE)).toEqual(['circles']);
  });

  it('returns an empty array for an empty selection', () => {
    expect(expandCategories([], TREE)).toEqual([]);
  });
});

describe('categoryLabelMap', () => {
  it('resolves parent slugs, which QB_CATEGORY_LABELS cannot', () => {
    const map = categoryLabelMap(TREE);
    expect(map.coordinate_geometry).toBe('Coordinate Geometry');
    expect(map.circles).toBe('Circles');
    expect(map.permutations_combinations).toBe('Permutations & Combinations');
  });
});

describe('nodeSelectionState', () => {
  it('is checked when the parent slug itself is selected', () => {
    expect(nodeSelectionState(CG, ['coordinate_geometry'])).toBe('checked');
  });

  it('is checked when every child is individually selected', () => {
    expect(nodeSelectionState(CG, ALL_CG)).toBe('checked');
  });

  it('is indeterminate at 3 of 8 children', () => {
    expect(nodeSelectionState(CG, ['circles', 'parabola', 'locus'])).toBe('indeterminate');
  });

  it('is unchecked when nothing in the branch is selected', () => {
    expect(nodeSelectionState(CG, ['trigonometry'])).toBe('unchecked');
  });

  it('treats a childless node as a plain leaf', () => {
    const tri = TREE[2];
    expect(nodeSelectionState(tri, ['trigonometry'])).toBe('checked');
    expect(nodeSelectionState(tri, [])).toBe('unchecked');
  });

  // Regression: caught by E2E. Selecting the parent collapses state to the
  // single parent slug, so a child has no entry of its own. Without the
  // ancestor check, expanding the parent showed every child unticked, which
  // reads as though ticking the parent did nothing.
  it('marks a child checked when a collapsed ancestor is selected', () => {
    const circles = CG.children.find((c) => c.slug === 'circles')!;
    expect(nodeSelectionState(circles, ['coordinate_geometry'], TREE)).toBe('checked');
    for (const child of CG.children) {
      expect(nodeSelectionState(child, ['coordinate_geometry'], TREE)).toBe('checked');
    }
  });

  it('does not inherit checked across unrelated branches', () => {
    const functions = TREE[0].children.find((c) => c.slug === 'functions')!;
    expect(nodeSelectionState(functions, ['coordinate_geometry'], TREE)).toBe('unchecked');
  });

  it('still resolves correctly when no tree is supplied', () => {
    const circles = CG.children.find((c) => c.slug === 'circles')!;
    expect(nodeSelectionState(circles, ['circles'])).toBe('checked');
    expect(nodeSelectionState(circles, ['coordinate_geometry'])).toBe('unchecked');
  });
});

describe('toggleCategoryNode', () => {
  it('parent ON collapses to the single parent slug', () => {
    const out = toggleCategoryNode(CG, ['circles', 'parabola'], true, TREE);
    expect(out).toEqual(['coordinate_geometry']);
  });

  it('parent OFF removes the parent and every child', () => {
    const out = toggleCategoryNode(CG, ['coordinate_geometry', 'trigonometry'], false, TREE);
    expect(out).toEqual(['trigonometry']);
  });

  it('unticking one child while the parent is selected expands to the other seven', () => {
    const parabola = CG.children.find((c) => c.slug === 'parabola')!;
    const out = toggleCategoryNode(parabola, ['coordinate_geometry'], false, TREE);

    expect(out).not.toContain('coordinate_geometry');
    expect(out).not.toContain('parabola');
    expect(out.sort()).toEqual(ALL_CG.filter((s) => s !== 'parabola').sort());
    expect(out).toHaveLength(7);
  });

  it('ticking the last missing child collapses back to the parent slug', () => {
    const parabola = CG.children.find((c) => c.slug === 'parabola')!;
    const sevenOthers = ALL_CG.filter((s) => s !== 'parabola');
    const out = toggleCategoryNode(parabola, sevenOthers, true, TREE);
    expect(out).toEqual(['coordinate_geometry']);
  });

  it('ticking a single child from empty selects just that child', () => {
    const circles = CG.children.find((c) => c.slug === 'circles')!;
    expect(toggleCategoryNode(circles, [], true, TREE)).toEqual(['circles']);
  });

  it('leaves an unrelated branch untouched', () => {
    const circles = CG.children.find((c) => c.slug === 'circles')!;
    const out = toggleCategoryNode(circles, ['trigonometry'], true, TREE);
    expect(out.sort()).toEqual(['circles', 'trigonometry']);
  });
});

describe('collapseCategories', () => {
  it('collapses a fully selected parent', () => {
    expect(collapseCategories(ALL_CG, TREE)).toEqual(['coordinate_geometry']);
  });

  it('leaves a partial selection expanded', () => {
    const partial = ['circles', 'parabola'];
    expect(collapseCategories(partial, TREE).sort()).toEqual(partial.sort());
  });

  it('is idempotent', () => {
    const once = collapseCategories(ALL_CG, TREE);
    expect(collapseCategories(once, TREE)).toEqual(once);
  });
});

describe('ancestorsOf', () => {
  it('returns the nearest ancestor first', () => {
    expect(ancestorsOf('circles', TREE).map((n) => n.slug)).toEqual(['coordinate_geometry']);
  });

  it('returns nothing for a root', () => {
    expect(ancestorsOf('coordinate_geometry', TREE)).toEqual([]);
  });

  it('returns nothing for an unknown slug', () => {
    expect(ancestorsOf('nope', TREE)).toEqual([]);
  });
});
