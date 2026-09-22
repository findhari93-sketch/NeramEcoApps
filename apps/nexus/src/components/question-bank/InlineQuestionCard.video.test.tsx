import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { NexusQBQuestionListItem } from '@neram/database';
import InlineQuestionCard from './InlineQuestionCard';

/**
 * The student's question card says whether a video solution is waiting, before
 * the question is opened. The list payload carries only the flag, never the
 * link, so the chip is all a student can learn from it.
 */

const item = (hasVideo: boolean) =>
  ({
    id: 'q31',
    question_text: 'Which figure completes the series?',
    question_format: 'MCQ',
    categories: [],
    difficulty: 'MEDIUM',
    sources: [],
    attempt_summary: null,
    drawing_parts: null,
    question_image_url: null,
    has_solution_video: hasVideo,
  }) as unknown as NexusQBQuestionListItem;

const props = {
  questionDetail: null,
  expanded: false,
  loading: false,
  questionIndex: 30,
  onToggleExpand: vi.fn(),
  onSubmit: vi.fn(),
  onStudyToggle: vi.fn(),
};

describe('InlineQuestionCard video chip', () => {
  it('marks a question that has a video solution', () => {
    render(<InlineQuestionCard question={item(true)} {...props} />);
    expect(screen.getByLabelText('Has a video solution, unlocks after you answer')).not.toBeNull();
    expect(screen.getByText('Video')).not.toBeNull();
  });

  it('shows nothing for a question without one', () => {
    render(<InlineQuestionCard question={item(false)} {...props} />);
    expect(screen.queryByText('Video')).toBeNull();
  });
});
