import { describe, it, expect } from 'vitest';
import { buildTagIndex, resolveTag, resolveSuggestedTags, type RegistryTag } from './tag-resolver';

/**
 * Every case here is a phrasing the old exact-lowercase-label match got wrong,
 * taken from the seeded registry in 20260713180000 and the aliases added in
 * 20260731090000. Each miss used to become a create whose slug collided with the
 * tag it failed to match, so the create 409'd and the class ended up untagged.
 */
const REGISTRY: RegistryTag[] = [
  {
    id: 'tag-perspective',
    slug: 'perspective',
    label: 'Perspective',
    group_type: 'subject',
    aliases: ['one point perspective', 'vanishing point', 'horizon line'],
  },
  { id: 'tag-viz', slug: 'visualization_3d', label: 'Visualization 3d', group_type: 'subject', aliases: [] },
  { id: 'tag-shadow', slug: 'shadow', label: 'Shadow', group_type: 'theme', aliases: ['shading'] },
  {
    id: 'tag-ortho',
    slug: 'orthographic_projection',
    label: 'Orthographic Projection',
    group_type: 'theme',
    aliases: null,
  },
  { id: 'tag-drawing', slug: 'drawing', label: 'Drawing', group_type: 'subject' },
];

const index = buildTagIndex(REGISTRY);

describe('resolveTag', () => {
  it('matches the slug the model was told to use', () => {
    expect(resolveTag(index, 'orthographic_projection')?.id).toBe('tag-ortho');
  });

  it('matches a label written with spaces instead of underscores', () => {
    expect(resolveTag(index, 'Orthographic Projection')?.id).toBe('tag-ortho');
  });

  it('matches through an alias, which is the whole point of that column', () => {
    expect(resolveTag(index, 'Vanishing Point')?.id).toBe('tag-perspective');
    expect(resolveTag(index, 'One Point Perspective')?.id).toBe('tag-perspective');
  });

  it('matches regardless of word order', () => {
    // The seed migration produced the label "Visualization 3d"; no model writes that.
    expect(resolveTag(index, '3D Visualization')?.id).toBe('tag-viz');
  });

  it('matches through punctuation and plurals', () => {
    expect(resolveTag(index, 'Shadows & Shading')?.id).toBe('tag-shadow');
    expect(resolveTag(index, 'Shadows')?.id).toBe('tag-shadow');
  });

  it('leaves a joined phrase naming two different tags as a proposal', () => {
    // Collapsing "Drawing and Shadow" onto whichever half matched first would
    // quietly drop the other half.
    expect(resolveTag(index, 'Drawing and Shadow')).toBeNull();
    expect(resolveTag(index, 'Shadow & Site Planning')).toBeNull();
  });

  it('drops a parenthetical qualifier before giving up', () => {
    expect(resolveTag(index, 'Perspective (1-point)')?.id).toBe('tag-perspective');
  });

  it('returns null for something genuinely absent', () => {
    expect(resolveTag(index, 'Site Planning')).toBeNull();
    expect(resolveTag(index, '')).toBeNull();
    expect(resolveTag(index, '   ')).toBeNull();
  });
});

describe('resolveSuggestedTags', () => {
  it('resolves slugs the model picked from the list', () => {
    const { matched, unmatched } = resolveSuggestedTags({
      registry: REGISTRY,
      tagSlugs: ['drawing', 'shadow'],
    });
    expect(matched.map((t) => t.id)).toEqual(['tag-drawing', 'tag-shadow']);
    expect(unmatched).toEqual([]);
  });

  it('pulls a proposed "new" tag back onto the existing one it describes', () => {
    // A model that ignores the allowed list must not be able to mint duplicates.
    const { matched, unmatched } = resolveSuggestedTags({
      registry: REGISTRY,
      newTags: [{ label: 'Vanishing Point', group_type: 'theme' }],
    });
    expect(matched.map((t) => t.id)).toEqual(['tag-perspective']);
    expect(unmatched).toEqual([]);
  });

  it('keeps a genuinely new idea as a proposal', () => {
    const { matched, unmatched } = resolveSuggestedTags({
      registry: REGISTRY,
      tagSlugs: ['drawing'],
      newTags: [{ label: 'Site Planning', group_type: 'theme' }],
    });
    expect(matched.map((t) => t.id)).toEqual(['tag-drawing']);
    expect(unmatched).toEqual([{ label: 'Site Planning', group_type: 'theme' }]);
  });

  it('treats an unknown slug as a proposal, in words rather than underscores', () => {
    const { unmatched } = resolveSuggestedTags({ registry: REGISTRY, tagSlugs: ['site_planning'] });
    expect(unmatched).toEqual([{ label: 'Site Planning', group_type: 'theme' }]);
  });

  it('never returns the same tag or the same proposal twice', () => {
    const { matched, unmatched } = resolveSuggestedTags({
      registry: REGISTRY,
      tagSlugs: ['perspective', 'perspective'],
      newTags: [
        { label: 'One Point Perspective', group_type: 'theme' },
        { label: 'Site Planning', group_type: 'theme' },
        { label: 'site planning', group_type: 'subject' },
      ],
    });
    expect(matched.map((t) => t.id)).toEqual(['tag-perspective']);
    expect(unmatched).toHaveLength(1);
  });

  it('survives an empty registry without inventing matches', () => {
    const { matched, unmatched } = resolveSuggestedTags({
      registry: [],
      newTags: [{ label: 'Drawing', group_type: 'subject' }],
    });
    expect(matched).toEqual([]);
    expect(unmatched).toEqual([{ label: 'Drawing', group_type: 'subject' }]);
  });
});

describe('buildTagIndex', () => {
  it('lets an exact slug win over another tag that merely shares its shape', () => {
    const registry: RegistryTag[] = [
      { id: 'a', slug: 'shadow_cast', label: 'Shadow Cast', group_type: 'theme' },
      { id: 'b', slug: 'cast_shadow', label: 'Cast Shadow', group_type: 'theme' },
    ];
    const idx = buildTagIndex(registry);
    expect(resolveTag(idx, 'cast_shadow')?.id).toBe('b');
    expect(resolveTag(idx, 'shadow_cast')?.id).toBe('a');
  });
});
