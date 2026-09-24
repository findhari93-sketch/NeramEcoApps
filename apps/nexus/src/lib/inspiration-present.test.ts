import { describe, expect, it } from 'vitest';
import { displayTitle, presentClassFeatured, presentRow } from './inspiration-present';
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

  it("gives the badge slot to a teacher's pick, and keeps the batch in the credit", () => {
    // One badge slot: at 375px a tile is about 164px wide and two pills wrap.
    // Featured outranks alumni because a teacher chose it, and nothing is lost,
    // the credit line underneath still says Alumni.
    // A featured drawing names its author in full: being singled out is the point.
    expect(presentRow(makeRow({ is_featured: true }), { staff: false })).toMatchObject({
      badge: 'featured',
      featured: true,
      credit: 'Harshitaa Thiyagu · 2026 batch',
    });
    expect(presentRow(makeRow({ is_featured: true, author_is_alumni: true }), { staff: false })).toMatchObject({
      badge: 'featured',
      credit: 'Harshitaa Thiyagu · Alumni 2026',
    });
    // A reference is a different kind of thing, so it keeps its own badge.
    expect(presentRow(makeRow({ is_featured: true, source_kind: 'submission_reference' }), { staff: false }).badge).toBe('reference');
  });

  it('never puts an opted-out student on the grid by name', () => {
    // The tile now shows card.credit, which the detail page already showed. That
    // is only safe because nexus_inspiration_base nulls the author columns for a
    // student who keeps their drawings out of the library, and the credit
    // collapses to a name nobody can be found by. If this ever fails, the grid
    // is printing a child's name they asked to withhold.
    const card = presentRow(
      makeRow({ author_opted_out: true, author_name: null, author_first_name: null, author_last_name: null }),
      { staff: false },
    );
    expect(card.credit).toBe('Neram student');
    expect(JSON.stringify(card)).not.toMatch(/Harshitaa/i);
  });

  it('titles a featured sketch so the grid is not a wall of the word Drawing', () => {
    // A sketch reaches the shelf with no question and no tags, so the title
    // written at feature time is the only thing standing between it and the
    // fallback. See showFeaturedSubmission.
    expect(displayTitle(makeRow({ title_override: 'Sketchbook drawing', type_slugs: [], category: null })))
      .toBe('Sketchbook drawing');
  });

  it('tells a teacher why a drawing is not on the shelf', () => {
    const card = presentRow(makeRow({ is_visible: false, auto_eligible: false, score_pct: 0.6 }), { staff: true });
    expect(card.staff).toMatchObject({ visible: false, curation: 'auto', hiddenReason: 'Below 4 stars or 80%' });
  });
});

describe('featured authors', () => {
  it('carries a face and a full name for a featured drawing, and the user id only to staff', () => {
    const student = presentRow(makeRow({ is_featured: true }), { staff: false });
    expect(student.author).toEqual({ id: null, name: 'Harshitaa Thiyagu', avatarUrl: null });
    expect(JSON.stringify(student)).not.toContain('33333333-3333-4333-8333-333333333333');
    const staff = presentRow(makeRow({ is_featured: true }), { staff: true });
    expect(staff.author?.id).toBe('33333333-3333-4333-8333-333333333333');
  });

  it('has no author block for ordinary or opted-out drawings', () => {
    expect(presentRow(makeRow(), { staff: false }).author).toBeUndefined();
    const optedOut = presentRow(
      makeRow({ is_featured: true, author_opted_out: true, author_id: null, author_name: null, author_first_name: null, author_last_name: null }),
      { staff: false },
    );
    expect(optedOut.author).toBeUndefined();
    expect(optedOut.credit).toBe('Neram student');
  });

  it('puts the classroom, the date and the photo on a class wall card', () => {
    const card = presentClassFeatured(
      {
        row: makeRow({ is_featured: true }),
        classroom_id: 'c1',
        classroom_name: 'JEE B.Arch Session 1',
        featured_at: '2026-09-23T10:00:00Z',
        author_avatar_url: 'https://example.com/a.jpg',
      },
      { staff: false },
    );
    expect(card.featuredIn).toEqual({ classroomId: 'c1', classroomName: 'JEE B.Arch Session 1', featuredAt: '2026-09-23T10:00:00Z' });
    expect(card.author).toEqual({ id: null, name: 'Harshitaa Thiyagu', avatarUrl: 'https://example.com/a.jpg' });
    expect(card.credit).toBe('Harshitaa Thiyagu · 2026 batch');
  });
});
