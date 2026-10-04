import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./review/RubricScorePanel', () => ({ default: () => <div>Rubric panel</div> }));
vi.mock('./ResourceLinkSearch', () => ({ default: () => null }));
vi.mock('./SketchOverCanvas', () => ({ default: () => null }));
vi.mock('@/components/assignments/ReactionPicker', () => ({ default: () => null }));

import AIFeedbackWorkspace from './AIFeedbackWorkspace';

const base = {
  id: 'd1',
  reviewed_image_url: null,
  original_image_url: 'https://x/d1.jpg',
  tutor_feedback: null,
  tutor_resources: [],
  tutor_rating: null,
} as any;

const renderWith = (submission: any, readOnly = false) =>
  render(
    <AIFeedbackWorkspace
      submission={submission}
      getToken={async () => 't'}
      onChange={vi.fn()}
      readOnly={readOnly}
      voiceSlot={<div>Voice note slot</div>}
    />,
  );

describe('AIFeedbackWorkspace scoring', () => {
  // A sketch is never graded, and the rubric's stars on one made every save fail.
  it('shows no rubric on a sketch, editing or not', () => {
    renderWith({ ...base, source_type: 'sketchbook' });
    expect(screen.queryByText('Rubric panel')).toBeFalsy();
    renderWith({ ...base, source_type: 'sketchbook' }, true);
    expect(screen.queryByText('Rubric panel')).toBeFalsy();
  });

  // Rubrics are rarely used, so on graded drawings they wait behind a button.
  it('folds the rubric on an unscored drawing until Add scores is tapped', () => {
    renderWith({ ...base, source_type: 'assignment', assignment_id: 'a1' });
    expect(screen.queryByText('Rubric panel')).toBeFalsy();
    fireEvent.click(screen.getByRole('button', { name: 'Add scores (optional)' }));
    expect(screen.getByText('Rubric panel')).toBeTruthy();
  });

  it('opens the rubric on a drawing that already has scores', () => {
    renderWith({ ...base, source_type: 'assignment', assignment_id: 'a1', tutor_rating: 4 });
    expect(screen.getByText('Rubric panel')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add scores (optional)' })).toBeFalsy();
  });

  it('shows no empty rubric on a finished review with no scores', () => {
    renderWith({ ...base, source_type: 'assignment', assignment_id: 'a1' }, true);
    expect(screen.queryByText('Rubric panel')).toBeFalsy();
  });
});

describe('AIFeedbackWorkspace written feedback', () => {
  // Teachers review mostly by voice note or Sketch and talk, so the text box is
  // optional and stays out of the way until asked for.
  it('starts folded when there are no words yet, and opens on tap', () => {
    renderWith(base);
    expect(screen.queryByLabelText('Written feedback to student')).toBeFalsy();
    const toggle = screen.getByRole('button', { name: 'Add written feedback (optional)' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(screen.getByLabelText('Written feedback to student')).toBeTruthy();
  });

  it('opens on its own when feedback was already written', () => {
    renderWith({ ...base, tutor_feedback: 'Keep the strokes loose' });
    expect((screen.getByLabelText('Written feedback to student') as HTMLTextAreaElement).value).toBe('Keep the strokes loose');
    expect(screen.queryByRole('button', { name: 'Add written feedback (optional)' })).toBeFalsy();
  });

  it('puts the voice note before the written feedback', () => {
    renderWith(base);
    const voice = screen.getByText('Voice note slot');
    const toggle = screen.getByRole('button', { name: 'Add written feedback (optional)' });
    expect(voice.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
