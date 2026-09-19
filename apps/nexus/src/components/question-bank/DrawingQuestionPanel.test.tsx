import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DrawingQuestionPanel, { type DrawingFormState } from './DrawingQuestionPanel';

/**
 * The authoring panel for a drawing question.
 *
 * The load-bearing behaviour is the Copy prompt button. In-app AI evaluation of
 * drawings is deliberately off, so the whole authoring story is: build a prompt
 * from what the teacher has typed, hand it to them, and let them paste it into
 * Gemini. If the prompt is built from the SAVED row rather than the current
 * form, a teacher who rewords the question and presses Copy silently gets the
 * old wording, which is the kind of bug nobody reports because the output looks
 * plausible.
 *
 * Colour rule, design principle, objects to include and focus points used to
 * be authored here too. Nobody was filling them in, so they were removed;
 * these tests assert they stay gone rather than testing behaviour that no
 * longer exists.
 */

vi.mock('./ImageUploadZone', () => ({
  default: ({ label }: { label?: string }) => <div>{label || 'upload'}</div>,
}));

const writeText = vi.fn((_text: string) => Promise.resolve());
Object.assign(navigator, { clipboard: { writeText } });

const BASE: DrawingFormState = {
  drawing_marks: '50',
  solution_video_url: '',
};

function setup(
  over: Partial<DrawingFormState> = {},
  onChange = vi.fn(),
  parts?: { hasParts?: boolean; derivedMarks?: number | null },
) {
  const value = { ...BASE, ...over };
  render(
    <DrawingQuestionPanel
      value={value}
      onChange={onChange}
      getToken={async () => 'token'}
      questionText="Draw a village railway station at dusk."
      categories={['drawing', '2d_composition']}
      hasParts={parts?.hasParts}
      derivedMarks={parts?.derivedMarks ?? null}
    />,
  );
  return { onChange };
}

beforeEach(() => {
  writeText.mockClear();
});

describe('the copy prompt button', () => {
  it('copies a prompt built from what is on screen right now', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /copy prompt/i }));

    expect(writeText).toHaveBeenCalledTimes(1);
    const prompt = writeText.mock.calls[0][0];
    expect(prompt).toContain('Draw a village railway station at dusk.');
    expect(prompt).toContain('MARKS: 50');
  });

  it('reflects an unsaved marks edit, not the saved row', async () => {
    setup({ drawing_marks: '75' });
    fireEvent.click(screen.getByRole('button', { name: /copy prompt/i }));

    const prompt = writeText.mock.calls[0][0];
    expect(prompt).toContain('MARKS: 75');
  });
});

describe('the removed fields', () => {
  it('no longer offers colour rule, design principle, objects, or focus points', () => {
    setup();
    expect(screen.queryByLabelText(/colour rule/i)).toBeNull();
    expect(screen.queryByLabelText(/design principle/i)).toBeNull();
    expect(screen.queryByLabelText('Add an object')).toBeNull();
    expect(screen.queryByRole('button', { name: /add focus point/i })).toBeNull();
  });
});

describe('marks', () => {
  // Every drawing is 50, so the panel states it. A labelled number input asking
  // for a figure the teacher already knows is a control that only gets skipped,
  // which is how all 129 drawing questions ended up with no marks at all.
  it('states the marks instead of asking for them', () => {
    setup();
    expect(screen.getByText('Worth 50 marks in the exam.')).toBeTruthy();
    expect(screen.queryByLabelText('Marks in the exam')).toBeNull();
  });

  it('opens the field on Change, and keeps only digits', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    const field = screen.getByLabelText('Marks in the exam');
    fireEvent.change(field, { target: { value: '5a0' } });

    expect(onChange).toHaveBeenCalledWith({ drawing_marks: '50' });
  });

  it('reads the parts total, and offers no way to fight it', () => {
    setup({}, vi.fn(), { hasParts: true, derivedMarks: 40 });
    expect(screen.getByText('Worth 40 marks in the exam, the total of the parts.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
  });
});

describe('with parts', () => {
  it('leaves the solution to each part, and keeps only the marks line', () => {
    setup({}, vi.fn(), { hasParts: true });
    expect(screen.queryByRole('button', { name: /copy prompt/i })).toBeNull();
    expect(screen.queryByText('Solution')).toBeNull();
    expect(screen.getByText('Worth 50 marks in the exam.')).toBeTruthy();
  });

  it('heads the single solution with whether there is one yet', () => {
    setup();
    expect(screen.getByText('Solution image needed')).toBeTruthy();
    expect(screen.getByRole('button', { name: /copy prompt/i })).toBeTruthy();
  });

  it('hides the video field until it is asked for', () => {
    setup();
    expect(screen.queryByLabelText(/solution video url/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add a video link' }));
    expect(screen.getByLabelText(/solution video url/i)).toBeTruthy();
  });
});
