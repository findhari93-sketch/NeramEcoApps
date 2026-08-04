import { describe, expect, it } from 'vitest';
import {
  canNestUnder,
  flattenTestFolders,
  searchTestFolders,
  MAX_TEST_FOLDER_DEPTH,
  type TestFolderLike,
} from './test-folder-path';

const tree: TestFolderLike[] = [
  {
    id: 'foundation',
    name: 'Foundation',
    children: [
      {
        id: 'history',
        name: 'History of Architecture',
        children: [{ id: 'ancient', name: 'Ancient', children: [] }],
      },
      { id: 'drawing', name: 'Drawing', children: [] },
    ],
  },
  { id: 'mock', name: 'Mock Tests', children: [] },
];

describe('flattenTestFolders', () => {
  it('reads depth first, the same order the tree is drawn in', () => {
    expect(flattenTestFolders(tree).map((f) => f.id)).toEqual([
      'foundation',
      'history',
      'ancient',
      'drawing',
      'mock',
    ]);
  });

  it('builds the breadcrumb a teacher recognises', () => {
    const byId = new Map(flattenTestFolders(tree).map((f) => [f.id, f]));
    expect(byId.get('ancient')!.label).toBe('Foundation > History of Architecture > Ancient');
    expect(byId.get('ancient')!.path).toEqual(['Foundation', 'History of Architecture', 'Ancient']);
    expect(byId.get('mock')!.label).toBe('Mock Tests');
  });

  it('carries the ancestor ids, which is how the picker opens the tree to a new folder', () => {
    const byId = new Map(flattenTestFolders(tree).map((f) => [f.id, f]));
    // Without these, a folder created inside a collapsed parent is selected but
    // nowhere on screen.
    expect(byId.get('ancient')!.ancestorIds).toEqual(['foundation', 'history']);
    expect(byId.get('foundation')!.ancestorIds).toEqual([]);
  });

  it('counts a top level folder as depth 1, so depth compares with the cap', () => {
    const byId = new Map(flattenTestFolders(tree).map((f) => [f.id, f]));
    expect(byId.get('foundation')!.depth).toBe(1);
    expect(byId.get('ancient')!.depth).toBe(3);
  });

  it('does not spin on a row that lists itself as its own child', () => {
    const cyclic: TestFolderLike[] = [{ id: 'a', name: 'A', children: [] }];
    cyclic[0].children.push(cyclic[0]);
    expect(flattenTestFolders(cyclic).map((f) => f.id)).toEqual(['a']);
  });

  it('handles an empty tree and a folder with no children array', () => {
    expect(flattenTestFolders([])).toEqual([]);
    expect(flattenTestFolders([{ id: 'x', name: 'X' } as TestFolderLike])).toHaveLength(1);
  });
});

describe('canNestUnder', () => {
  it('allows a new folder at the top level and inside a shallow one', () => {
    expect(canNestUnder(null)).toBe(true);
    expect(canNestUnder({ depth: 1 })).toBe(true);
    expect(canNestUnder({ depth: MAX_TEST_FOLDER_DEPTH - 1 })).toBe(true);
  });

  it('refuses once the parent is already at the cap', () => {
    // The server throws FOLDER_TOO_DEEP here. Greying the button out first means
    // the teacher never types a name into a box that cannot accept it.
    expect(canNestUnder({ depth: MAX_TEST_FOLDER_DEPTH })).toBe(false);
    expect(canNestUnder({ depth: MAX_TEST_FOLDER_DEPTH + 1 })).toBe(false);
  });
});

describe('searchTestFolders', () => {
  const flat = flattenTestFolders(tree);

  it('matches on any part of the full path, not just the folder name', () => {
    expect(searchTestFolders(flat, 'foundation').map((f) => f.id)).toEqual([
      'foundation',
      'history',
      'ancient',
      'drawing',
    ]);
  });

  it('matches words in any order, so "ancient foundation" still finds it', () => {
    expect(searchTestFolders(flat, 'ancient foundation').map((f) => f.id)).toEqual(['ancient']);
  });

  it('ignores case', () => {
    expect(searchTestFolders(flat, 'MOCK').map((f) => f.id)).toEqual(['mock']);
  });

  it('returns nothing for an empty query rather than everything', () => {
    // The picker shows the tree when the box is empty. Returning every folder
    // here would render the flat list instead, silently losing the hierarchy.
    expect(searchTestFolders(flat, '   ')).toEqual([]);
  });

  it('caps the result list', () => {
    expect(searchTestFolders(flat, 'a', 2)).toHaveLength(2);
  });
});
