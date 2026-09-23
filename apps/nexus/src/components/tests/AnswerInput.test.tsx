import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AnswerInput from './AnswerInput';

/**
 * Figure options on a class-prep test or a drawing assignment.
 *
 * Both surfaces answer through this component, and it normalised every option
 * down to {key, text}. So a "which figure completes the sequence" question
 * arrived as four rows reading "Figure (1)" to "Figure (4)" with nothing to
 * look at, which cannot be answered. Worse, the same pass dropped any option
 * whose text was empty, so a picture-only option disappeared altogether.
 */

const figureOptions = ['a', 'b', 'c', 'd'].map((key, i) => ({
  key,
  text: `Figure (${i + 1})`,
  image_url: `https://cdn.example/${key}.png`,
}));

function renderInput(options: unknown) {
  render(
    <AnswerInput
      question={{ question_id: 'q1', question_format: 'MCQ', options }}
      value={null}
      onChange={vi.fn()}
    />,
  );
}

describe('AnswerInput with figure options', () => {
  it('draws the picture that is the answer', () => {
    renderInput(figureOptions);

    for (const letter of ['A', 'B', 'C', 'D']) {
      expect(screen.getByRole('img', { name: `Option ${letter}` })).not.toBeNull();
    }
  });

  it('keeps an option that is a picture and nothing else', () => {
    renderInput([
      { key: 'a', text: '', image_url: 'https://cdn.example/a.png' },
      { key: 'b', text: '', image_url: 'https://cdn.example/b.png' },
    ]);

    // The old filter dropped these for having no text, quietly removing half
    // the choices from the question.
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('drops a label that only names the picture beside it', () => {
    renderInput(figureOptions);

    expect(screen.queryByText('Figure (1)')).toBeNull();
  });

  it('keeps words that say something the picture does not', () => {
    renderInput([
      { key: 'a', text: 'A cube on its edge', image_url: 'https://cdn.example/a.png' },
      { key: 'b', text: 'A cone', image_url: 'https://cdn.example/b.png' },
    ]);

    expect(screen.getByText('A cube on its edge')).not.toBeNull();
  });

  it('leaves worded options alone', () => {
    renderInput([
      { key: 'a', text: '12 cm' },
      { key: 'b', text: '14 cm' },
    ]);

    expect(screen.getByText('12 cm')).not.toBeNull();
    expect(screen.getByText('14 cm')).not.toBeNull();
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('still drops an option that is neither words nor picture', () => {
    renderInput([
      { key: 'a', text: '12 cm' },
      { key: 'b', text: '' },
    ]);

    expect(screen.getAllByRole('radio')).toHaveLength(1);
  });
});
