import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/drawings/ImageToggleTabs', () => ({ default: () => <div>image tabs</div> }));

import StudentDrawingReview from './StudentDrawingReview';

const entry = (over: Record<string, unknown> = {}) =>
  ({
    id: 'd1', source_type: 'sketchbook', assignment: null, inspiration_item_id: null,
    review: { state: 'none', rating: null, marks: null }, ...over,
  }) as any;

const detail = { original_image_url: 'https://x/o.jpg', tutor_feedback: 'Keep the lines light.', reviewed_image_url: 'https://x/r.jpg', corrected_image_url: null };

describe('StudentDrawingReview', () => {
  it('shows the stars and the words of a released review', () => {
    render(<StudentDrawingReview entry={entry({ review: { state: 'reviewed', rating: 4, marks: null } })} submission={detail} practisedFrom={null} />);
    expect(screen.getByText("Your teacher's review")).toBeTruthy();
    expect(screen.getByText('4 out of 5 stars')).toBeTruthy();
    expect(screen.getByText('Keep the lines light.')).toBeTruthy();
    expect(screen.getByText('image tabs')).toBeTruthy();
  });

  it('says an assignment drawing is waiting, and links to the assignment', () => {
    render(
      <StudentDrawingReview
        entry={entry({ source_type: 'assignment', assignment: { id: 'as1', title: 'Line Practice', evaluation_type: 'stars', max_marks: 5 }, review: { state: 'waiting', rating: null, marks: null } })}
        submission={null}
        practisedFrom={null}
      />,
    );
    expect(screen.getByText('Your teacher has not reviewed this yet.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Line Practice' }).getAttribute('href')).toBe('/student/assignments/as1');
  });

  it('links to the Inspiration drawing it was practised from, or says it is gone', () => {
    const { rerender } = render(
      <StudentDrawingReview entry={entry({ inspiration_item_id: 'i1' })} submission={null} practisedFrom={{ item_id: 'i1', title: 'Street view', image_url: 'https://x/i.jpg' }} />,
    );
    expect(screen.getByRole('link', { name: /Practised from Inspiration/ }).getAttribute('href')).toBe('/student/inspiration/i1');
    rerender(<StudentDrawingReview entry={entry({ inspiration_item_id: 'i1' })} submission={null} practisedFrom={null} />);
    expect(screen.getByText('Practised from an Inspiration drawing that is no longer shown.')).toBeTruthy();
  });
});
