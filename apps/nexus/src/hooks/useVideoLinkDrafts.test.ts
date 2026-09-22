import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { NexusQBQuestion } from '@neram/database';
import { useVideoLinkDrafts } from './useVideoLinkDrafts';
import { JEE_2015_SOLUTION_VIDEO_LINKS } from '../../../../tests/fixtures/qb-solution-video-links';

/**
 * Unsaved video links on a paper, between a paste and Save.
 *
 * Nothing a teacher pastes is written until Save, every row can say what will
 * happen to it, and a failed row stays on screen with its reason instead of
 * vanishing into a count.
 */

const watch = (id: string) => `https://www.youtube.com/watch?v=${id}`;

function q(n: number, over: Partial<NexusQBQuestion> = {}): NexusQBQuestion {
  return {
    id: `q${n}`,
    display_order: n,
    question_text: `Question ${n}`,
    question_format: 'MCQ',
    solution_video_url: null,
    drawing_parts: null,
    ...over,
  } as unknown as NexusQBQuestion;
}

const PAPER = Array.from({ length: 80 }, (_, i) => q(i + 1));

function setup(questions: NexusQBQuestion[] = PAPER) {
  const onSaved = vi.fn();
  const onOptimisticPatch = vi.fn();
  const hook = renderHook(() =>
    useVideoLinkDrafts({
      questions,
      paperId: 'paper-2015',
      getToken: async () => 'token',
      onSaved,
      onOptimisticPatch,
    }),
  );
  return { ...hook, onSaved, onOptimisticPatch };
}

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useVideoLinkDrafts, links found on YouTube', () => {
  it('fills found links in as drafts, reporting new and replaced like a paste', () => {
    const saved = [q(1), q(2, { solution_video_url: watch('xrKukhHIt0A') }), q(3)];
    const { result } = setup(saved);
    act(() => {
      result.current.fillFound([
        { questionId: 'q1', number: 1, url: watch('U1X9MmLh-ZQ') },
        { questionId: 'q2', number: 2, url: watch('T9CB0HymAJo') },
      ]);
    });
    expect(result.current.rowState(saved[0])).toBe('draft-new');
    expect(result.current.rowState(saved[1])).toBe('draft-replace');
    expect(result.current.summary).toMatchObject({ added: 1, replaced: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('can turn down one replacement and keep the saved link', () => {
    const saved = [q(2, { solution_video_url: watch('xrKukhHIt0A') })];
    const { result } = setup(saved);
    act(() => {
      result.current.fillFound([{ questionId: 'q2', number: 2, url: watch('T9CB0HymAJo') }]);
    });
    act(() => {
      result.current.revert('q2');
    });
    expect(result.current.rowState(saved[0])).toBe('saved');
    expect(result.current.valueFor('q2')).toBe(watch('xrKukhHIt0A'));
    expect(result.current.unsavedCount).toBe(0);
  });
});

describe('useVideoLinkDrafts', () => {
  it('fills the teacher list in as drafts, saving nothing', () => {
    const { result } = setup();
    act(() => {
      result.current.pasteText(JEE_2015_SOLUTION_VIDEO_LINKS);
    });

    expect(result.current.unsavedCount).toBe(59);
    expect(result.current.valueFor('q31')).toBe(watch('U1X9MmLh-ZQ'));
    expect(result.current.rowState(PAPER[30])).toBe('draft-new');
    expect(result.current.summary).toMatchObject({ added: 59, replaced: 0, unchanged: 0, unmatched: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('counts the drafts into the progress, so the bar moves as links go in', () => {
    const { result } = setup();
    expect(result.current.withVideoCount).toBe(0);
    act(() => result.current.setDraft('q2', 'https://youtu.be/xrKukhHIt0A'));
    expect(result.current.withVideoCount).toBe(1);
  });

  it('says a pasted link replaces a saved one', () => {
    const { result } = setup([q(2, { solution_video_url: watch('J9rHcdRPslM') })]);
    act(() => result.current.setDraft('q2', 'https://youtu.be/xrKukhHIt0A'));
    expect(result.current.rowState(q(2, { solution_video_url: watch('J9rHcdRPslM') }))).toBe('draft-replace');
  });

  it('forgets a draft typed back to what is saved', () => {
    const saved = q(2, { solution_video_url: watch('xrKukhHIt0A') });
    const { result } = setup([saved]);
    act(() => result.current.setDraft('q2', 'x'));
    act(() => result.current.setDraft('q2', 'https://youtu.be/xrKukhHIt0A?si=abc'));
    expect(result.current.unsavedCount).toBe(0);
    expect(result.current.rowState(saved)).toBe('saved');
  });

  it('marks a cleared field as removing the video', () => {
    const saved = q(2, { solution_video_url: watch('xrKukhHIt0A') });
    const { result } = setup([saved]);
    act(() => result.current.setDraft('q2', ''));
    expect(result.current.rowState(saved)).toBe('draft-clear');
  });

  it('holds back an invalid link and saves the rest', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { updated: 1, results: [{ question_id: 'q4', ok: true, solution_video_url: watch('J9rHcdRPslM') }] },
      }),
    });
    const { result, onSaved, onOptimisticPatch } = setup();
    act(() => {
      result.current.setDraft('q2', 'abc123');
      result.current.setDraft('q4', 'https://youtu.be/J9rHcdRPslM');
    });
    expect(result.current.invalidCount).toBe(1);
    expect(result.current.rowState(PAPER[1])).toBe('invalid');

    await act(async () => {
      await result.current.save();
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/question-bank/papers/paper-2015/video-links');
    expect(body.links).toEqual([{ question_id: 'q4', solution_video_url: watch('J9rHcdRPslM') }]);
    // The saved row leaves the drafts; the invalid one is still there to fix.
    expect(result.current.unsavedCount).toBe(1);
    expect(onOptimisticPatch).toHaveBeenCalledWith('q4', { solution_video_url: watch('J9rHcdRPslM') });
    expect(onSaved).toHaveBeenCalled();
  });

  it('keeps a row the server refused, with its reason', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { updated: 0, results: [{ question_id: 'q4', ok: false, error: 'This question is not on this paper' }] },
      }),
    });
    const { result } = setup();
    act(() => result.current.setDraft('q4', 'https://youtu.be/J9rHcdRPslM'));
    await act(async () => {
      await result.current.save();
    });

    await waitFor(() => expect(result.current.rowState(PAPER[3])).toBe('error'));
    expect(result.current.errorFor('q4')).toBe('This question is not on this paper');
    expect(result.current.unsavedCount).toBe(1);
  });

  it('discards every draft at once', () => {
    const { result } = setup();
    act(() => {
      result.current.pasteText(JEE_2015_SOLUTION_VIDEO_LINKS);
    });
    act(() => result.current.discard());
    expect(result.current.unsavedCount).toBe(0);
    expect(result.current.summary).toBeNull();
  });

  it('treats a split drawing as set per part, never as a draft', () => {
    const split = q(81, {
      question_format: 'DRAWING_PROMPT',
      drawing_parts: {
        mode: 'any_one',
        items: [
          { id: 'a', label: 'A', text: 'Draw a market', solution_video_url: 'https://v/a' },
          { id: 'b', label: 'B', text: 'Draw a harbour' },
        ],
      } as never,
    });
    const { result } = setup([split]);
    expect(result.current.rowState(split)).toBe('split');
    expect(result.current.withVideoCount).toBe(1);
  });
});
