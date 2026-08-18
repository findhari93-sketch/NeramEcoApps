import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import CollisionReviewGroup, { type CollisionCandidate } from './CollisionReviewGroup';

const CANDIDATES: CollisionCandidate[] = [
  {
    id: 'q1',
    question_text: 'Solution of the differential equation',
    question_format: 'MCQ',
    current_section: 'math_mcq',
    suggested_section: 'math_mcq',
  },
  {
    id: 'q2',
    question_text: 'Match List - I with List - II. (I) Agra fort',
    question_format: 'MCQ',
    current_section: 'math_mcq',
    suggested_section: 'aptitude',
  },
];

describe('CollisionReviewGroup', () => {
  it('shows the colliding number and every candidate\'s question text', () => {
    render(
      <CollisionReviewGroup
        section="math_mcq"
        display_order={12}
        candidates={CANDIDATES}
        selections={{}}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText(/Mathematics \(MCQ\)/)).not.toBeNull();
    expect(screen.getByText(/Q12/)).not.toBeNull();
    expect(screen.getByText(/Solution of the differential equation/)).not.toBeNull();
    expect(screen.getByText(/Agra fort/)).not.toBeNull();
  });

  it('defaults each candidate\'s selection to its suggestion', () => {
    render(
      <CollisionReviewGroup
        section="math_mcq"
        display_order={12}
        candidates={CANDIDATES}
        selections={{ q1: 'math_mcq', q2: 'aptitude' }}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByLabelText('Section for question q2').textContent).toContain('Aptitude');
  });

  it('calls onSelect with the candidate id and the newly chosen section', () => {
    const onSelect = vi.fn();
    render(
      <CollisionReviewGroup
        section="math_mcq"
        display_order={12}
        candidates={CANDIDATES}
        selections={{ q1: 'math_mcq', q2: 'aptitude' }}
        onSelect={onSelect}
      />,
    );
    fireEvent.mouseDown(screen.getByLabelText('Section for question q1'));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Drawing'));
    expect(onSelect).toHaveBeenCalledWith('q1', 'drawing');
  });

  it('leaves a candidate with no suggestion unselected', () => {
    render(
      <CollisionReviewGroup
        section="math_mcq"
        display_order={12}
        candidates={[{ ...CANDIDATES[0], suggested_section: null }]}
        selections={{}}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByLabelText('Section for question q1').textContent).toBe('');
  });
});
