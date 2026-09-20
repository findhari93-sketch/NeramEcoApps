import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/drawings/ImageToggleTabs', () => ({ default: () => <div>image tabs</div> }));

import StudentDrawingReview from './StudentDrawingReview';

const entry = (over: Record<string, unknown> = {}) =>
  ({
    id: 'd1', source_type: 'sketchbook', assignment: null, inspiration_item_id: null,
    review: { state: 'none', rating: null, marks: null }, ...over,
  }) as any;

const detail = { original_image_url: 'https://x/o.jpg', tutor_feedback: 'Keep the lines light.', reviewed_image_url: 'https://x/r.jpg', corrected_image_url: null };

const voice = {
  id: 'v1', submission_id: 'd1', audio_mime: 'audio/webm', duration_ms: 42000,
  base_image_url: null, sketch: null, sent_at: '2026-09-18T10:00:00Z', first_played_at: null,
  heard_fully_at: null, max_position_ms: 0, play_count: 0, created_at: '2026-09-18T09:00:00Z',
  url: 'https://x/v1.webm',
} as any;

const reviewed = { review: { state: 'reviewed', rating: 4, marks: null } };
const getToken = async () => 'tok';

describe('StudentDrawingReview', () => {
  beforeAll(() => {
    // jsdom answers '' to canPlayType for every format, which is the player's
    // "this browser cannot play it" branch. A student's phone can, so say so.
    (window.HTMLMediaElement.prototype as unknown as { canPlayType: () => string }).canPlayType = () => 'probably';
  });

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

  it('plays the voice note the teacher left on the drawing', () => {
    // The sketch page already fetches this, release-gated and signed, and then
    // dropped it: a teacher could talk over a drawing and the student had nowhere
    // to hear it.
    render(<StudentDrawingReview entry={entry(reviewed)} submission={detail} practisedFrom={null} voice={voice} getToken={getToken} />);
    expect(screen.getByRole('button', { name: 'Play voice note' })).toBeTruthy();
    expect(screen.getByText('Voice note from your teacher')).toBeTruthy();
  });

  it('shows no player when the teacher left no note', () => {
    render(<StudentDrawingReview entry={entry(reviewed)} submission={detail} practisedFrom={null} voice={null} getToken={getToken} />);
    expect(screen.queryByRole('button', { name: 'Play voice note' })).toBeNull();
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
