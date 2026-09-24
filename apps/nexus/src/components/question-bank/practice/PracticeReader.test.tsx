import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { NexusQBQuestionDetail } from '@neram/database';
import PracticeReader from './PracticeReader';
import { atomIdOf } from '@/lib/practice-atoms';

// The gate under test is which of skeleton / question the reader picks, so the
// question body is a stub: QuestionDetail has its own tests.
vi.mock('../QuestionDetail', () => ({
  default: ({ question, partKey }: { question: NexusQBQuestionDetail; partKey?: string | null }) => (
    <div data-testid="question-detail">
      {question.id}
      {partKey ? ` part ${partKey}` : ''}
    </div>
  ),
}));

const QUESTION_ID = '0e221b22-b203-4717-bf6d-b9c9ac6cb52d';

function detail(over: Partial<NexusQBQuestionDetail> = {}): NexusQBQuestionDetail {
  return {
    id: QUESTION_ID,
    question_text: 'Draw a rectangular frame of size 140 mm x 210 mm',
    question_format: 'DRAWING_PROMPT',
    options: [],
    attempts: [],
    correct_answer: null,
    ...over,
  } as unknown as NexusQBQuestionDetail;
}

const base = {
  variant: 'pane' as const,
  detailLoading: false,
  detailError: null,
  positionLabel: '1 of 4',
  hasPrev: false,
  hasNext: true,
  onPrev: vi.fn(),
  onNext: vi.fn(),
  onJump: vi.fn(),
  lang: 'en' as const,
  onLangChange: vi.fn(),
  showLang: false,
  showSourceBadges: true,
  priorAnswer: () => null,
  onSubmit: vi.fn(async () => ({ isCorrect: false })),
  onStudyToggle: vi.fn(),
  onReport: vi.fn(async () => {}),
  onRetryLoad: vi.fn(),
};

describe('PracticeReader', () => {
  it('shows the question once its detail lands', () => {
    render(<PracticeReader {...base} questionId={QUESTION_ID} partKey={null} detail={detail()} />);
    expect(screen.getByTestId('question-detail').textContent).toBe(QUESTION_ID);
  });

  it('shows one option of an either-or drawing, whose id carries the part', () => {
    // The page opens an atom ("<question>~a"); the API answers with the
    // question row, whose id has no part on it. Comparing the two as-is left
    // the reader on its skeleton for ever.
    render(
      <PracticeReader
        {...base}
        questionId={atomIdOf(QUESTION_ID, 'a')}
        partKey="a"
        detail={detail()}
      />,
    );
    expect(screen.getByTestId('question-detail').textContent).toBe(`${QUESTION_ID} part a`);
  });

  it('keeps the skeleton when the detail belongs to another question', () => {
    render(
      <PracticeReader
        {...base}
        questionId={atomIdOf('c555a50c-11bd-4042-8a4b-695805b6e0d9', 'a')}
        partKey="a"
        detail={detail()}
      />,
    );
    expect(screen.queryByTestId('question-detail')).toBeNull();
  });
});
