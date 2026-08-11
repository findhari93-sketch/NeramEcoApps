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

function setup(over: Partial<DrawingFormState> = {}, onChange = vi.fn()) {
  const value = { ...BASE, ...over };
  render(
    <DrawingQuestionPanel
      value={value}
      onChange={onChange}
      getToken={async () => 'token'}
      questionText="Draw a village railway station at dusk."
      categories={['drawing', '2d_composition']}
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
  it('is labelled for the exam, and keeps only digits', () => {
    const { onChange } = setup();
    const field = screen.getByLabelText('Marks in the exam');
    fireEvent.change(field, { target: { value: '5a0' } });

    expect(onChange).toHaveBeenCalledWith({ drawing_marks: '50' });
  });
});
