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
 */

vi.mock('./ImageUploadZone', () => ({
  default: ({ label }: { label?: string }) => <div>{label || 'upload'}</div>,
}));

const writeText = vi.fn((_text: string) => Promise.resolve());
Object.assign(navigator, { clipboard: { writeText } });

const BASE: DrawingFormState = {
  drawing_marks: '50',
  colour_constraint: 'three colours only',
  design_principle_tested: 'balance',
  objects_to_include: [{ name: 'cuboid' }],
  drawing_focus_points: [{ text: 'Keep the horizon steady' }],
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
    expect(prompt).toContain('cuboid');
    expect(prompt).toContain('Keep the horizon steady');
    expect(prompt).toContain('three colours only');
  });

  it('reflects an unsaved focus point, not the saved row', async () => {
    setup({ drawing_focus_points: [{ text: 'A brand new unsaved point' }] });
    fireEvent.click(screen.getByRole('button', { name: /copy prompt/i }));

    const prompt = writeText.mock.calls[0][0];
    expect(prompt).toContain('A brand new unsaved point');
  });
});

describe('focus points', () => {
  it('adds one', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: /add focus point/i }));

    expect(onChange).toHaveBeenCalledWith({
      drawing_focus_points: [{ text: 'Keep the horizon steady' }, { text: '' }],
    });
  });

  it('removes one', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByLabelText('Remove focus point 1'));

    expect(onChange).toHaveBeenCalledWith({ drawing_focus_points: [] });
  });

  it('reorders them', () => {
    const { onChange } = setup({
      drawing_focus_points: [{ text: 'first' }, { text: 'second' }],
    });
    fireEvent.click(screen.getByLabelText('Move focus point 2 up'));

    expect(onChange).toHaveBeenCalledWith({
      drawing_focus_points: [{ text: 'second' }, { text: 'first' }],
    });
  });

  it('stops at eight, because a longer list is not a focus', () => {
    setup({
      drawing_focus_points: Array.from({ length: 8 }, (_, i) => ({ text: `point ${i}` })),
    });
    expect(screen.getByRole('button', { name: /add focus point/i }).hasAttribute('disabled')).toBe(true);
  });

  it('cannot move the first one up or the last one down', () => {
    setup({ drawing_focus_points: [{ text: 'only' }] });
    expect(screen.getByLabelText('Move focus point 1 up').hasAttribute('disabled')).toBe(true);
    expect(screen.getByLabelText('Move focus point 1 down').hasAttribute('disabled')).toBe(true);
  });
});

describe('objects', () => {
  it('adds one and clears the draft', () => {
    const { onChange } = setup();
    const input = screen.getByLabelText('Add an object');
    fireEvent.change(input, { target: { value: 'lamp post' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    expect(onChange).toHaveBeenCalledWith({
      objects_to_include: [{ name: 'cuboid' }, { name: 'lamp post' }],
    });
  });

  it('will not add an empty object', () => {
    setup();
    expect(screen.getByRole('button', { name: /^add$/i }).hasAttribute('disabled')).toBe(true);
  });
});

describe('marks', () => {
  it('keeps only digits, so the column never receives text', () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText('Marks'), { target: { value: '5a0' } });

    expect(onChange).toHaveBeenCalledWith({ drawing_marks: '50' });
  });
});
