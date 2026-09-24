import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { NexusQBQuestion, QBQuestionSection, QBReportGroup } from '@neram/database';
import PaperQuestionList, {
  type NeedsFilter,
  type PaperQuestionMode,
  type PaperSectionFilter,
} from './PaperQuestionList';
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

function Harness({
  initialMode = 'videos' as PaperQuestionMode,
  onOpenPaste = vi.fn(),
  questions = QUESTIONS,
  reports = undefined as Record<string, QBReportGroup[]> | undefined,
  onTellVideoFixed = vi.fn(),
  onOpenYouTube = vi.fn(),
}) {
  const [mode, setMode] = useState<PaperQuestionMode>(initialMode);
  const [needsFilter, setNeedsFilter] = useState<NeedsFilter>('all');
  const [sectionFilter, setSectionFilter] = useState<PaperSectionFilter | null>(null);
  const drafts = useVideoLinkDrafts({
    questions,
    paperId: 'paper-1',
    getToken: async () => 't',
    onSaved: vi.fn(),
    onOptimisticPatch: vi.fn(),
  });
  return (
    <PaperQuestionList
      questions={questions}
      tagCounts={{}}
      activeQuestionId={null}
      onActivate={vi.fn()}
      onChangeSections={vi.fn()}
      mode={mode}
      onModeChange={setMode}
      needsFilter={needsFilter}
      onNeedsFilterChange={setNeedsFilter}
      sectionFilter={sectionFilter}
      onSectionFilterChange={setSectionFilter}
      onBulkSetNeedsImage={vi.fn()}
      onDeleteQuestions={vi.fn()}
      onSetActiveQuestions={vi.fn()}
      imageStats={{ total: 0, withImages: 0, solutionTotal: 0, solutionWithImages: 0 }}
      pendingImageCount={0}
      onSaveAllImages={vi.fn()}
      savingImages={false}
      saveImageProgress={{ done: 0, total: 0 }}
      videos={{ drafts, onOpenPaste, onOpenYouTube, onSave: vi.fn() }}
      reports={reports}
      onTellVideoFixed={onTellVideoFixed}
    />
  );
}

function videoReport(over: Partial<QBReportGroup> = {}): QBReportGroup {
  return {
    question_id: 'q1',
    target: 'video',
    part_label: null,
    status: 'open',
    students: 2,
    reasons: [{ reason: 'wrong_working', count: 2 }],
    notes: [],
    first_reported_at: '2026-09-22T10:00:00Z',
    last_reported_at: '2026-09-22T11:00:00Z',
    changed_since_reported: false,
    resolution_note: null,
    resolved_at: null,
    ...over,
  };
}

describe('Videos mode', () => {
  it('gives every question its own link field, labelled with its number', () => {
    render(<Harness />);
    expect((screen.getByLabelText('Video for question 1') as HTMLInputElement).value).toBe(watch('xrKukhHIt0A'));
    expect((screen.getByLabelText('Video for question 2') as HTMLInputElement).value).toBe('');
    expect(screen.getByLabelText('Video for question 3')).not.toBeNull();
  });

  it('shows one bar for a paper with a single section', () => {
    render(<Harness questions={[q(1, 'aptitude', watch('xrKukhHIt0A')), q(2, 'aptitude')]} />);
    expect(screen.getByLabelText('Videos: 1 of 2 done')).not.toBeNull();
  });

  it('shows each section on its own, with the paper total beside them', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Mathematics (MCQ): 1 of 2 done')).not.toBeNull();
    expect(screen.getByLabelText('Aptitude: 0 of 1 done')).not.toBeNull();
    expect(screen.getByText('1 of 3 in all')).not.toBeNull();
  });

  it('says a finished section is finished, in words and not only colour', () => {
    render(
      <Harness
        questions={[
          q(1, 'math_mcq'),
          q(31, 'aptitude', watch('U1X9MmLh-ZQ')),
          q(32, 'aptitude', watch('T9CB0HymAJo')),
        ]}
      />,
    );
    expect(screen.getByText('All have a video')).not.toBeNull();
    // Nothing is missing there, so there is nothing to show.
    expect(screen.queryByRole('button', { name: /Aptitude questions without a video/ })).toBeNull();
  });

  it('jumps to the gaps of one section', () => {
    render(<Harness />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Show 1 Mathematics (MCQ) question without a video' }),
    );
    expect(screen.queryByLabelText('Video for question 1')).toBeNull();
    expect(screen.getByLabelText('Video for question 2')).not.toBeNull();
    expect(screen.queryByLabelText('Video for question 3')).toBeNull();
  });

  it('counts the whole section in its heading, even while the list is filtered', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'No video 2' }));
    // The heading's own range reads Q2 alone now, but its count is the section's.
    const heading = screen.getByText('Mathematics (MCQ) (Q2)').parentElement!;
    expect(within(heading).getByText('1/2')).not.toBeNull();
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

  it('offers to find the videos on YouTube from the header', () => {
    const onOpenYouTube = vi.fn();
    render(<Harness onOpenYouTube={onOpenYouTube} />);
    fireEvent.click(screen.getByRole('button', { name: 'Find on YouTube' }));
    expect(onOpenYouTube).toHaveBeenCalled();
  });

  it('lets a replaced link go back to the saved one, without retyping it', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Video for question 1'), {
      target: { value: 'https://youtu.be/J9rHcdRPslM' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Keep the saved link for question 1' }));
    expect((screen.getByLabelText('Video for question 1') as HTMLInputElement).value).toBe(watch('xrKukhHIt0A'));
    expect(screen.queryByText('1 unsaved change')).toBeNull();
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

describe('Student reports', () => {
  it('queues the questions students reported, and only when there are some', () => {
    const { unmount } = render(<Harness initialMode="edit" />);
    expect(screen.queryByRole('button', { name: /^Reported/ })).toBeNull();
    unmount();

    render(<Harness initialMode="edit" reports={{ q2: [videoReport({ question_id: 'q2' })] }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reported 1' }));
    expect(screen.queryByRole('button', { name: 'Open question 1' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open question 2' })).not.toBeNull();
  });

  it('flags a reported question in its row, saying what was reported', () => {
    render(<Harness initialMode="edit" reports={{ q1: [videoReport()] }} />);
    const row = (n: number) => screen.getByRole('button', { name: `Open question ${n}` });
    expect(within(row(1)).queryAllByLabelText('Students reported a problem: Video solution (2)').length).toBeGreaterThan(0);
    expect(within(row(2)).queryAllByLabelText(/Students reported a problem/)).toHaveLength(0);
  });

  it('shows a video report on its row in Videos mode, where the link is fixed', () => {
    render(<Harness reports={{ q1: [videoReport()] }} />);
    expect(screen.getByText('Reported: Mistake in the working (2)')).not.toBeNull();
    // Nothing has changed yet, so there is nothing to tell them.
    expect(screen.queryByRole('button', { name: /Tell the 2 students/ })).toBeNull();
  });

  it('offers to tell the students once the reported video has been replaced', () => {
    const onTellVideoFixed = vi.fn();
    render(
      <Harness
        reports={{ q1: [videoReport({ changed_since_reported: true })] }}
        onTellVideoFixed={onTellVideoFixed}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tell the 2 students it is fixed' }));
    expect(onTellVideoFixed).toHaveBeenCalledWith('q1', expect.objectContaining({ target: 'video' }));
  });
});

describe('Edit mode', () => {
  it('marks a question that has a solution video, and leaves the others quiet', () => {
    render(<Harness initialMode="edit" />);
    const row = (n: number) => screen.getByRole('button', { name: `Open question ${n}` });
    const link = within(row(1)).getByRole('link', { name: 'Open the solution video in a new tab' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(within(row(2)).queryAllByRole('link')).toHaveLength(0);
    expect(within(row(3)).queryAllByRole('link')).toHaveLength(0);
  });
});
