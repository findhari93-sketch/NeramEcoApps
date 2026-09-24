import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { NexusQBQuestion } from '@neram/database';
import PaperQuestionRow from './PaperQuestionRow';

function q(overrides: Partial<NexusQBQuestion> = {}): NexusQBQuestion {
  return {
    id: 'q1',
    question_text: 'If the centroid of the triangle with vertices $(3c + 2, 2, 0)$ coincides',
    question_format: 'MCQ',
    options: [{ id: 'a', text: '$c = 1$' }, { id: 'b', text: '$c = 2$' }],
    correct_answer: 'a',
    display_order: 1,
    section: 'math_mcq',
    status: 'active',
    is_active: true,
    categories: [],
    ...overrides,
  } as unknown as NexusQBQuestion;
}

describe('PaperQuestionRow', () => {
  it('typesets the stem instead of printing dollar signs', () => {
    const { container } = render(
      <PaperQuestionRow question={q()} selected={false} active={false} tagCount={3}
        onToggleSelect={() => {}} onActivate={() => {}} />,
    );
    expect(container.querySelector('.katex')).not.toBeNull();
    expect(container.textContent).not.toContain('$(3c');
  });

  it('shows the answer letter and the tag count', () => {
    render(
      <PaperQuestionRow question={q()} selected={false} active={false} tagCount={3}
        onToggleSelect={() => {}} onActivate={() => {}} />,
    );
    expect(screen.getByText('A')).not.toBeNull();
    expect(screen.getByLabelText('3 tags')).not.toBeNull();
  });

  it('opens the solution video in a new tab without opening the question', () => {
    const onActivate = vi.fn();
    render(
      <PaperQuestionRow question={q({ solution_video_url: 'https://www.youtube.com/watch?v=abcdefghijk' })}
        selected={false} active={false} tagCount={1} onToggleSelect={() => {}} onActivate={onActivate} />,
    );
    const link = screen.getByRole('link', { name: 'Open the solution video in a new tab' });
    expect(link.getAttribute('href')).toBe('https://www.youtube.com/watch?v=abcdefghijk');
    expect(link.getAttribute('target')).toBe('_blank');
    fireEvent.click(link);
    fireEvent.keyDown(link, { key: 'Enter' });
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('flags a missing key only on a format that needs one', () => {
    const { rerender } = render(
      <PaperQuestionRow question={q({ correct_answer: '  ' })} selected={false} active={false} tagCount={1}
        onToggleSelect={() => {}} onActivate={() => {}} />,
    );
    expect(screen.getByLabelText('No answer key yet')).not.toBeNull();
    rerender(
      <PaperQuestionRow question={q({ correct_answer: null, question_format: 'IMAGE_BASED' })} selected={false}
        active={false} tagCount={1} onToggleSelect={() => {}} onActivate={() => {}} />,
    );
    expect(screen.queryByLabelText('No answer key yet')).toBeNull();
    expect(screen.getByLabelText('No answer key needed')).not.toBeNull();
  });

  it('marks an untagged question so the gap is visible', () => {
    render(
      <PaperQuestionRow question={q()} selected={false} active={false} tagCount={0}
        onToggleSelect={() => {}} onActivate={() => {}} />,
    );
    expect(screen.getByLabelText('No tags')).not.toBeNull();
  });

  it('separates activating the row from ticking its box', () => {
    const onActivate = vi.fn();
    const onToggleSelect = vi.fn();
    render(
      <PaperQuestionRow question={q()} selected={false} active={false} tagCount={1}
        onToggleSelect={onToggleSelect} onActivate={onActivate} />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 1' }));
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onActivate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Open question 1/ }));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('passes the shift key through, so a run can be selected', () => {
    const onToggleSelect = vi.fn();
    render(
      <PaperQuestionRow question={q()} selected={false} active={false} tagCount={1}
        onToggleSelect={onToggleSelect} onActivate={() => {}} />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 1' }), { shiftKey: true });
    expect(onToggleSelect).toHaveBeenCalledWith(true, false);
  });

  it('passes the ctrl key through too, for a toggle that does not open the question', () => {
    const onToggleSelect = vi.fn();
    render(
      <PaperQuestionRow question={q()} selected={false} active={false} tagCount={1}
        onToggleSelect={onToggleSelect} onActivate={() => {}} />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 1' }), { ctrlKey: true });
    expect(onToggleSelect).toHaveBeenCalledWith(false, true);
  });

  it('shift-clicking the row body extends the selection instead of opening the question', () => {
    const onActivate = vi.fn();
    const onToggleSelect = vi.fn();
    render(
      <PaperQuestionRow question={q()} selected={false} active={false} tagCount={1}
        onToggleSelect={onToggleSelect} onActivate={onActivate} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Open question 1/ }), { shiftKey: true });
    expect(onToggleSelect).toHaveBeenCalledWith(true, false);
    expect(onActivate).not.toHaveBeenCalled();
  });

  /**
   * Its own glyph, not folded into the figure warning: they are two different
   * jobs, and one amber triangle meaning either is a triangle you stop reading.
   */
  it('flags a maths question with no worked solution', () => {
    render(
      <PaperQuestionRow question={q()} selected={false} active={false} tagCount={1}
        onToggleSelect={() => {}} onActivate={() => {}} />,
    );
    expect(screen.getByLabelText('Solution image missing')).not.toBeNull();
  });

  it('drops the flag once the solution image is there', () => {
    render(
      <PaperQuestionRow question={q({ solution_image_url: 'https://x/sol.png' })} selected={false}
        active={false} tagCount={1} onToggleSelect={() => {}} onActivate={() => {}} />,
    );
    expect(screen.queryByLabelText('Solution image missing')).toBeNull();
  });

  it('never flags an aptitude question', () => {
    render(
      <PaperQuestionRow question={q({ section: 'aptitude' })} selected={false} active={false}
        tagCount={1} onToggleSelect={() => {}} onActivate={() => {}} />,
    );
    expect(screen.queryByLabelText('Solution image missing')).toBeNull();
  });

  /**
   * A drawing used to be exempt, so JEE Paper 2 2014 showed no flag on either
   * of its two unanswered drawings. Each part owes its own worked answer: in an
   * "attempt any one" the student may answer either option.
   */
  it('flags a drawing whose parts are only half answered, and says how far it got', async () => {
    const half = q({
      question_format: 'DRAWING_PROMPT',
      section: 'drawing',
      correct_answer: null,
      options: null,
      // The question column is set, mirrored from part A, which is exactly the
      // state that used to read as solved.
      solution_image_url: 'https://x/a.png',
      drawing_parts: {
        mode: 'any_one',
        items: [
          { id: 'a', label: 'A', text: 'Draw a balloon seller.', solution_image_url: 'https://x/a.png' },
          { id: 'b', label: 'B', text: 'Draw women at a handpump.', solution_image_url: null },
        ],
      },
    });

    render(
      <PaperQuestionRow question={half} selected={false} active={false} tagCount={1}
        onToggleSelect={() => {}} onActivate={() => {}} />,
    );
    const glyph = screen.getByLabelText('Solution image missing');
    expect(glyph).not.toBeNull();

    // The sentence has to reach the teacher, not just the predicate. It used to
    // read "maths questions need one" on every row, drawings included.
    fireEvent.mouseOver(glyph);
    expect(
      await screen.findByText('Solution images: 1 of 2 parts. Each part needs its own.'),
    ).not.toBeNull();
  });

  it('drops the flag once every part has its own solution', () => {
    const done = q({
      question_format: 'DRAWING_PROMPT',
      section: 'drawing',
      correct_answer: null,
      options: null,
      solution_image_url: 'https://x/a.png',
      drawing_parts: {
        mode: 'any_one',
        items: [
          { id: 'a', label: 'A', text: 'Draw a balloon seller.', solution_image_url: 'https://x/a.png' },
          { id: 'b', label: 'B', text: 'Draw women at a handpump.', solution_image_url: 'https://x/b.png' },
        ],
      },
    });

    render(
      <PaperQuestionRow question={done} selected={false} active={false} tagCount={1}
        onToggleSelect={() => {}} onActivate={() => {}} />,
    );
    expect(screen.queryByLabelText('Solution image missing')).toBeNull();
  });

  it('the status is a colour, not a chip, but still has a name a screen reader can announce', () => {
    render(
      <PaperQuestionRow question={q({ status: 'active' })} selected={false} active={false} tagCount={1}
        onToggleSelect={() => {}} onActivate={() => {}} />,
    );
    expect(screen.getByLabelText('Active')).not.toBeNull();
  });

  it('says a drawing prompt is self-assessed rather than showing a blank answer', () => {
    render(
      <PaperQuestionRow question={q({ question_format: 'DRAWING_PROMPT', correct_answer: null })}
        selected={false} active={false} tagCount={0}
        onToggleSelect={() => {}} onActivate={() => {}} />,
    );
    expect(screen.getByLabelText('Self-assessed')).not.toBeNull();
  });

  /**
   * There was previously nothing on the row itself distinguishing an
   * inactive question from an active one, so a teacher browsing "All" could
   * not tell which questions students could actually see.
   */
  it('flags a deactivated question as hidden from students', () => {
    render(
      <PaperQuestionRow question={q({ is_active: false })} selected={false} active={false} tagCount={1}
        onToggleSelect={() => {}} onActivate={() => {}} />,
    );
    expect(screen.getByLabelText('Hidden from students')).not.toBeNull();
  });

  it('does not flag an active question', () => {
    render(
      <PaperQuestionRow question={q({ is_active: true })} selected={false} active={false} tagCount={1}
        onToggleSelect={() => {}} onActivate={() => {}} />,
    );
    expect(screen.queryByLabelText('Hidden from students')).toBeNull();
  });
});
