import { describe, expect, it } from 'vitest';
import { displayTitle, presentRow } from './inspiration-present';
import { makeRow } from './inspiration-test-rows';

describe('displayTitle', () => {
  it('prefers a teacher title, then the most specific type', () => {
    expect(displayTitle(makeRow({ title_override: ' Bag, hat and stick ' }))).toBe('Bag, hat and stick');
    expect(displayTitle(makeRow({ type_slugs: ['3d_composition', 'still_life'] }))).toBe('Still Life');
    expect(displayTitle(makeRow({ type_slugs: ['3d_composition'] }))).toBe('3D Composition');
    expect(displayTitle(makeRow({ type_slugs: [], category: null }))).toBe('Drawing');
  });
});

describe('presentRow', () => {
  it('gives a student the card and nothing a teacher sees', () => {
    const card = presentRow(makeRow({ score_pct: 0.6 }), { staff: false });
    expect(card.staff).toBeUndefined();
    expect(card.credit).toBe('Harshitaa T. · 2026 batch');
    expect(card.badge).toBeNull();
    expect(card.alt).toBe('Student drawing: 3D Composition');
    const json = JSON.stringify(card);
    expect(json).not.toMatch(/score|curation|author_id|authorId|tutor/i);
  });

  it('badges references and alumni work', () => {
    expect(presentRow(makeRow({ source_kind: 'submission_reference' }), { staff: false })).toMatchObject({
      badge: 'reference',
      credit: "Neram reference · from Harshitaa T.'s drawing",
      alt: 'Reference drawing: 3D Composition',
    });
    expect(presentRow(makeRow({ author_is_alumni: true }), { staff: false })).toMatchObject({
      badge: 'alumni',
      credit: 'Harshitaa T. · Alumni 2026',
    });
  });

  it('tells a teacher why a drawing is not on the shelf', () => {
    const card = presentRow(makeRow({ is_visible: false, auto_eligible: false, score_pct: 0.6 }), { staff: true });
    expect(card.staff).toMatchObject({ visible: false, curation: 'auto', hiddenReason: 'Below 4 stars or 80%' });
  });
});
