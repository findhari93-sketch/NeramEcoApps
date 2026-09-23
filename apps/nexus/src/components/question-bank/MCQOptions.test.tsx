import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { NexusQBQuestionOption } from '@neram/database';
import MCQOptions from './MCQOptions';

/**
 * Figure questions: the ones where the answer is a picture.
 *
 * The founder's report was about JEE Paper 2 2005 Aptitude Q7, "which answer
 * figure completes the sequence". Four picture options were stacked one per
 * row at every width, about 680px of them, so reaching the answers pushed the
 * problem figure off the top of the screen and there was no way to compare
 * the two. They go in a grid now, and the "Figure (1)" labels that named
 * pictures already on screen are gone from the page but not from the alt text.
 */

const figureOptions: NexusQBQuestionOption[] = ['a', 'b', 'c', 'd'].map((id, i) => ({
  id,
  text: `Figure (${i + 1})`,
  image_url: `https://cdn.example/opt-${id}.png`,
}));

const textOptions: NexusQBQuestionOption[] = [
  { id: 'a', text: 'max{b, c}' },
  { id: 'b', text: 'min{b, c}' },
];

function renderOptions(options: NexusQBQuestionOption[], onSelect = vi.fn()) {
  render(
    <MCQOptions options={options} selectedId={null} submitted={false} onSelect={onSelect} />,
  );
  return onSelect;
}

describe('MCQOptions with figure answers', () => {
  it('drops a label that only names the picture beside it', () => {
    renderOptions(figureOptions);

    expect(screen.queryByText('Figure (1)')).toBeNull();
    expect(screen.queryByText('Figure (4)')).toBeNull();
  });

  it('still names every figure for a screen reader', () => {
    renderOptions(figureOptions);

    for (const letter of ['A', 'B', 'C', 'D']) {
      expect(screen.getByRole('img', { name: `Option ${letter}` })).not.toBeNull();
    }
    expect(screen.getAllByRole('radio')).toHaveLength(4);
  });

  it('keeps words that say something the picture does not', () => {
    renderOptions([
      { id: 'a', text: 'A cube resting on its edge', image_url: 'https://cdn.example/a.png' },
      { id: 'b', text: 'A cone', image_url: 'https://cdn.example/b.png' },
    ]);

    expect(screen.getByText('A cube resting on its edge')).not.toBeNull();
    expect(screen.getByText('A cone')).not.toBeNull();
  });

  it('offers a way to look closer at each figure', () => {
    renderOptions(figureOptions);

    expect(screen.getByRole('button', { name: 'Look closer at option A' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Look closer at option D' })).not.toBeNull();
  });

  it('looking closer does not answer the question', () => {
    const onSelect = renderOptions(figureOptions);

    fireEvent.click(screen.getByRole('button', { name: 'Look closer at option B' }));

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Option B, full size' })).not.toBeNull();
  });

  it('tapping the card is still how you answer', () => {
    const onSelect = renderOptions(figureOptions);

    fireEvent.click(screen.getAllByRole('radio')[2]);

    expect(onSelect).toHaveBeenCalledWith('c');
  });

  it('leaves a question with worded answers alone', () => {
    renderOptions(textOptions);

    expect(screen.getByText('max{b, c}')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Look closer/ })).toBeNull();
  });

  it('treats one lone picture as an ordinary option, not a figure question', () => {
    renderOptions([
      { id: 'a', text: 'Figure (1)', image_url: 'https://cdn.example/a.png' },
      { id: 'b', text: 'None of these' },
    ]);

    // Only one picture, so there is nothing to compare and nothing to hide.
    expect(screen.getByText('Figure (1)')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Look closer/ })).toBeNull();
  });
});
