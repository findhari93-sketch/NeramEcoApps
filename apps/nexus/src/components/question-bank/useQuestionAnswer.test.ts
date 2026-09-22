import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useQuestionAnswer, type AnswerSubmitFn } from './useQuestionAnswer';

function setup(onSubmit: AnswerSubmitFn, over: { correctAnswer?: string | null; prior?: { selected: string; isCorrect: boolean } | null } = {}) {
  return renderHook(
    ({ questionId }: { questionId: string }) =>
      useQuestionAnswer({ questionId, correctAnswer: over.correctAnswer ?? 'a', onSubmit, prior: over.prior }),
    { initialProps: { questionId: 'q1' } },
  );
}

describe('useQuestionAnswer', () => {
  it('takes the verdict from the server when it gives one', async () => {
    // The key says 'a', but a numerical answer within tolerance is right.
    const { result } = setup(async () => ({ isCorrect: true }));
    act(() => result.current.select('b'));
    await act(() => result.current.submit());
    expect(result.current.submitted).toBe(true);
    expect(result.current.isCorrect).toBe(true);
  });

  it('falls back to comparing with the key when the server says nothing', async () => {
    const { result } = setup(async () => {});
    act(() => result.current.select('b'));
    await act(() => result.current.submit());
    expect(result.current.isCorrect).toBe(false);
  });

  it('stays unsubmitted with an error when the save fails', async () => {
    const { result } = setup(async () => {
      throw new Error('offline');
    });
    act(() => result.current.select('a'));
    await act(() => result.current.submit());
    expect(result.current.submitted).toBe(false);
    expect(result.current.error).not.toBeNull();
    expect(result.current.selected).toBe('a');
  });

  it('does nothing without a selection', async () => {
    const onSubmit = vi.fn(async () => {});
    const { result } = setup(onSubmit);
    await act(() => result.current.submit());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('starts from an earlier answer on the same question', () => {
    const { result } = setup(async () => {}, { prior: { selected: 'c', isCorrect: false } });
    expect(result.current.submitted).toBe(true);
    expect(result.current.selected).toBe('c');
    expect(result.current.isCorrect).toBe(false);
  });

  it('starts clean on a different question', async () => {
    const { result, rerender } = setup(async () => ({ isCorrect: true }));
    act(() => result.current.select('a'));
    await act(() => result.current.submit());
    rerender({ questionId: 'q2' });
    expect(result.current.submitted).toBe(false);
    expect(result.current.selected).toBeNull();
  });

  it('can be cleared to try again', async () => {
    const { result } = setup(async () => ({ isCorrect: false }));
    act(() => result.current.select('b'));
    await act(() => result.current.submit());
    act(() => result.current.reset());
    expect(result.current.submitted).toBe(false);
    expect(result.current.selected).toBeNull();
  });
});
