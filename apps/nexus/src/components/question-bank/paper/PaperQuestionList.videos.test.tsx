import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { NexusQBQuestion, QBQuestionSection } from '@neram/database';
import PaperQuestionList, { type NeedsFilter, type PaperQuestionMode } from './PaperQuestionList';
import { useVideoLinkDrafts } from '@/hooks/useVideoLinkDrafts';
import { useState } from 'react';

/**
 * Videos mode on the paper, and the video marker in Edit mode.
 *
 * The whole point is that a teacher can see every question beside its link
 * and which ones still have no video, without opening questions one by one.
 */

const watch = (id: string) => `https://www.youtube.com/watch?v=${id}`;

function q(n: number, section: QBQuestionSection, video: string | null = null): NexusQBQuestion {
  return {
    id: `q${n}`,
    question_text: `Question ${n}`,
    question_format: 'MCQ',
    options: [{ id: 'a', text: 'A' }],
    correct_answer: 'a',
    display_order: n,
    section,
    status: 'active',
    is_active: true,
    categories: [],
    needs_image: null,
    solution_video_url: video,
    drawing_parts: null,
  } as unknown as NexusQBQuestion;
}

const QUESTIONS = [
  q(1, 'math_mcq', watch('xrKukhHIt0A')),
  q(2, 'math_mcq'),
  q(3, 'aptitude'),
];

function Harness({ initialMode = 'videos' as PaperQuestionMode, onOpenPaste = vi.fn() }) {
  const [mode, setMode] = useState<PaperQuestionMode>(initialMode);
  const [needsFilter, setNeedsFilter] = useState<NeedsFilter>('all');
  const drafts = useVideoLinkDrafts({
    questions: QUESTIONS,
    paperId: 'paper-1',
    getToken: async () => 't',
    onSaved: vi.fn(),
    onOptimisticPatch: vi.fn(),
  });
  return (
    <PaperQuestionList
      questions={QUESTIONS}
      tagCounts={{}}
      activeQuestionId={null}
      onActivate={vi.fn()}
      onChangeSections={vi.fn()}
      mode={mode}
      onModeChange={setMode}
      needsFilter={needsFilter}
      onNeedsFilterChange={setNeedsFilter}
      sectionFilter={null}
      onSectionFilterChange={vi.fn()}
      onBulkSetNeedsImage={vi.fn()}
      onDeleteQuestions={vi.fn()}
      onSetActiveQuestions={vi.fn()}
      imageStats={{ total: 0, withImages: 0, solutionTotal: 0, solutionWithImages: 0 }}
      pendingImageCount={0}
      onSaveAllImages={vi.fn()}
      savingImages={false}
      saveImageProgress={{ done: 0, total: 0 }}
      videos={{ drafts, onOpenPaste, onSave: vi.fn() }}
    />
  );
}

describe('Videos mode', () => {
  it('gives every question its own link field, labelled with its number', () => {
    render(<Harness />);
    expect((screen.getByLabelText('Video for question 1') as HTMLInputElement).value).toBe(watch('xrKukhHIt0A'));
    expect((screen.getByLabelText('Video for question 2') as HTMLInputElement).value).toBe('');
    expect(screen.getByLabelText('Video for question 3')).not.toBeNull();
  });

  it('shows progress across the paper', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Videos: 1 of 3 done')).not.toBeNull();
  });

  it('counts the questions still without a video, and narrows to them', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'No video 2' }));
    expect(screen.queryByLabelText('Video for question 1')).toBeNull();
    expect(screen.getByLabelText('Video for question 2')).not.toBeNull();
  });

  it('holds a typed link as unsaved until Save, with a bar to save or discard it', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Video for question 2'), {
      target: { value: 'https://youtu.be/J9rHcdRPslM' },
    });
    expect(screen.getByText('1 unsaved change')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Save 1' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Unsaved 1' })).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByText('1 unsaved change')).toBeNull();
  });

  it('fills the rows from a list pasted into any field, and says what it did', () => {
    render(<Harness />);
    fireEvent.paste(screen.getByLabelText('Video for question 3'), {
      clipboardData: {
        getData: () => 'Q no 2\nhttps://youtu.be/J9rHcdRPslM\nQ no 3\nhttps://youtu.be/ED6CdZFXk5A\nQ no 9\nhttps://youtu.be/9yKX3bljYN0',
      },
    });
    expect((screen.getByLabelText('Video for question 2') as HTMLInputElement).value).toBe(watch('J9rHcdRPslM'));
    expect((screen.getByLabelText('Video for question 3') as HTMLInputElement).value).toBe(watch('ED6CdZFXk5A'));

    const summary = screen.getByRole('status', { name: '' });
    expect(within(summary).getByText(/2 links filled in \(2 new\)/)).not.toBeNull();
    fireEvent.click(within(summary).getByRole('button', { name: /Show the 1 line that were skipped/ }));
    expect(within(summary).getByText('Line 6: Q9 is not on this paper')).not.toBeNull();
  });

  it('opens the paste box from the header', () => {
    const onOpenPaste = vi.fn();
    render(<Harness onOpenPaste={onOpenPaste} />);
    fireEvent.click(screen.getByRole('button', { name: 'Paste a list' }));
    expect(onOpenPaste).toHaveBeenCalled();
  });

  it('has no tick boxes, since bulk actions do not apply here', () => {
    render(<Harness />);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});

describe('Edit mode', () => {
  it('marks a question that has a solution video, and leaves the others quiet', () => {
    render(<Harness initialMode="edit" />);
    const row = (n: number) => screen.getByRole('button', { name: `Open question ${n}` });
    expect(within(row(1)).queryAllByLabelText('Has a solution video').length).toBeGreaterThan(0);
    expect(within(row(2)).queryAllByLabelText('Has a solution video')).toHaveLength(0);
    expect(within(row(3)).queryAllByLabelText('Has a solution video')).toHaveLength(0);
  });
});
