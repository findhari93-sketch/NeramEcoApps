import { describe, it, expect } from 'vitest';
import { buildQBTagTree, buildQBDescendantMap, type QBTagCount } from './qb-tags';
import type { NexusQBTag } from '../../types';

function tag(slug: string, id: string, parent_id: string | null = null, sort_order = 0): NexusQBTag {
  return {
    id,
    group_type: 'subject',
    slug,
    label: slug,
    parent_id,
    color: null,
    icon: null,
    sort_order,
    is_system: true,
    is_active: true,
    created_by: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  };
}

/** The real coordinate-geometry shape shipped by 20260801090000. */
function coordinateGeometryRows(): NexusQBTag[] {
  return [
    tag('coordinate_geometry', 'cg', null, 51),
    tag('straight_lines', 'sl', 'cg', 511),
    tag('circles', 'ci', 'cg', 512),
    tag('parabola', 'pa', 'cg', 513),
    tag('ellipse', 'el', 'cg', 514),
    tag('hyperbola', 'hy', 'cg', 515),
    tag('locus', 'lo', 'cg', 516),
    tag('areas_of_triangles', 'ao', 'cg', 517),
    tag('conic_sections', 'cs', 'cg', 518),
  ];
}

describe('buildQBTagTree', () => {
  it('nests children under their parent and keeps input order', () => {
    const tree = buildQBTagTree(coordinateGeometryRows());

    expect(tree).toHaveLength(1);
    expect(tree[0].slug).toBe('coordinate_geometry');
    expect(tree[0].children.map((c) => c.slug)).toEqual([
      'straight_lines',
      'circles',
      'parabola',
      'ellipse',
      'hyperbola',
      'locus',
      'areas_of_triangles',
      'conic_sections',
    ]);
  });

  it('builds all six math parents with the expected child counts', () => {
    const rows: NexusQBTag[] = [
      tag('algebra', 'alg', null, 50),
      ...Array.from({ length: 10 }, (_, i) => tag(`alg_child_${i}`, `ac${i}`, 'alg', 501 + i)),
      ...coordinateGeometryRows(),
      tag('calculus', 'cal', null, 52),
      ...Array.from({ length: 7 }, (_, i) => tag(`cal_child_${i}`, `cc${i}`, 'cal', 521 + i)),
      tag('trigonometry', 'tri', null, 53),
      tag('vectors_and_3d_geometry', 'v3d', null, 54),
      tag('vectors', 've', 'v3d', 541),
      tag('3d_geometry', 'g3', 'v3d', 542),
      tag('probability_and_statistics', 'ps', null, 55),
      tag('probability', 'pr', 'ps', 551),
      tag('statistics', 'st', 'ps', 552),
    ];

    const tree = buildQBTagTree(rows);
    expect(tree.map((n) => [n.slug, n.children.length])).toEqual([
      ['algebra', 10],
      ['coordinate_geometry', 8],
      ['calculus', 7],
      ['trigonometry', 0],
      ['vectors_and_3d_geometry', 2],
      ['probability_and_statistics', 2],
    ]);
  });

  it('surfaces a row whose parent is missing as a root instead of dropping it', () => {
    const tree = buildQBTagTree([tag('orphan', 'o', 'does-not-exist', 1)]);
    expect(tree.map((n) => n.slug)).toEqual(['orphan']);
  });

  it('does not loop on a self-referential parent_id', () => {
    const tree = buildQBTagTree([tag('self', 's', 's', 1)]);
    expect(tree.map((n) => n.slug)).toEqual(['self']);
    expect(tree[0].children).toEqual([]);
  });

  it('does not loop on a two-node cycle', () => {
    const tree = buildQBTagTree([tag('a', 'a', 'b', 1), tag('b', 'b', 'a', 2)]);
    // One of them breaks the cycle and becomes a root; neither is lost.
    const slugs = new Set<string>();
    const walk = (nodes: typeof tree) => {
      for (const n of nodes) {
        slugs.add(n.slug);
        walk(n.children);
      }
    };
    walk(tree);
    expect(slugs).toEqual(new Set(['a', 'b']));
  });

  it('reads rollup_count from the counts map rather than summing children', () => {
    // 15 + 15 + 20 = 50 by arithmetic, but the RPC reports 48 DISTINCT because
    // two questions carry two coordinate-geometry slugs each. The tree must
    // trust the RPC, never re-derive.
    const counts = new Map<string, QBTagCount>([
      ['coordinate_geometry', { self: 0, rollup: 48 }],
      ['straight_lines', { self: 15, rollup: 15 }],
      ['circles', { self: 15, rollup: 15 }],
      ['conic_sections', { self: 20, rollup: 20 }],
    ]);

    const tree = buildQBTagTree(coordinateGeometryRows(), counts);
    const parent = tree[0];

    expect(parent.self_count).toBe(0);
    expect(parent.rollup_count).toBe(48);

    const childSum = parent.children.reduce((n, c) => n + c.self_count, 0);
    expect(childSum).toBe(50);
    expect(parent.rollup_count).toBeLessThan(childSum);
  });

  it('defaults a node with no count entry to zero', () => {
    const tree = buildQBTagTree(coordinateGeometryRows(), new Map());
    expect(tree[0].self_count).toBe(0);
    expect(tree[0].rollup_count).toBe(0);
    expect(tree[0].children.every((c) => c.rollup_count === 0)).toBe(true);
  });
});

describe('buildQBDescendantMap', () => {
  it('maps a parent to all of its descendants, exclusive of itself', () => {
    const map = buildQBDescendantMap(coordinateGeometryRows());
    expect(map.get('coordinate_geometry')).toEqual([
      'straight_lines',
      'circles',
      'parabola',
      'ellipse',
      'hyperbola',
      'locus',
      'areas_of_triangles',
      'conic_sections',
    ]);
  });

  it('maps a leaf to an empty list', () => {
    const map = buildQBDescendantMap(coordinateGeometryRows());
    expect(map.get('circles')).toEqual([]);
  });

  it('flattens a multi-level hierarchy', () => {
    const rows = [
      tag('root', 'r', null, 1),
      tag('mid', 'm', 'r', 2),
      tag('leaf', 'l', 'm', 3),
    ];
    const map = buildQBDescendantMap(rows);
    expect(map.get('root')).toEqual(['mid', 'leaf']);
    expect(map.get('mid')).toEqual(['leaf']);
  });
});
