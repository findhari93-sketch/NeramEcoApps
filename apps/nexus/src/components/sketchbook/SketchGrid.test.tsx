import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SketchGrid from './SketchGrid';

const sketch = (id: string, day: string, over: Record<string, unknown> = {}) => ({
  id, student_id: 's', original_image_url: `https://x/${id}.jpg`, thumbnail_url: null, self_note: null,
  reaction: null, submitted_at: `${day}T10:00:00.000Z`, is_gallery_visible: false, seenBy: null, featured: [],
  source_type: 'sketchbook', status: 'completed', assignment_id: null, question_id: null, reviewed_at: null,
  tutor_rating: null, tutor_marks: null, inspiration_item_id: null, assignment: null,
  kind: 'practice', review: { state: 'none', rating: null, marks: null },
  ...over,
}) as any;

describe('SketchGrid', () => {
  it('renders the thumbnail when present and falls back to the original', () => {
    render(<SketchGrid sketches={[sketch('a', '2026-09-09', { thumbnail_url: 'https://x/a-thumb.jpg' }), sketch('b', '2026-09-08')]} hrefFor={(s) => `/student/sketchbook/${s.id}`} />);
    const imgs = screen.getAllByRole('img');
    expect(imgs[0].getAttribute('src')).toBe('https://x/a-thumb.jpg');
    expect(imgs[1].getAttribute('src')).toBe('https://x/b.jpg');
    expect(imgs[0].getAttribute('loading')).toBe('lazy');
  });

  it('links every tile to its page', () => {
    render(<SketchGrid sketches={[sketch('a', '2026-09-09')]} hrefFor={(s) => `/student/sketchbook/${s.id}`} />);
    expect(screen.getByRole('link').getAttribute('href')).toBe('/student/sketchbook/a');
  });

  it('says where a drawing came from and how it was reviewed, in words', () => {
    const assignment = sketch('a', '2026-09-15', {
      source_type: 'assignment', assignment_id: 'as1', kind: 'assignment',
      assignment: { id: 'as1', title: 'Line Practice', evaluation_type: 'stars', max_marks: 5 },
      review: { state: 'reviewed', rating: 4, marks: null },
    });
    render(<SketchGrid sketches={[assignment]} hrefFor={() => '#'} viewer="teacher" />);
    expect(screen.getByRole('link').getAttribute('aria-label')).toBe('Assignment from 15 Sept, Line Practice, reviewed, 4 stars');
    expect(screen.getByText('Assignment')).toBeTruthy();
  });

  it('shows the empty state copy when there is nothing', () => {
    render(<SketchGrid sketches={[]} hrefFor={() => '#'} />);
    expect(screen.getByText('Your sketchbook is empty')).toBeTruthy();
  });
});
