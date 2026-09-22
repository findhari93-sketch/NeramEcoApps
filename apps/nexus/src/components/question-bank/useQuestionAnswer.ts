'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** What the save call may say back. The server's verdict wins over the client's guess. */
export interface AnswerSubmitResult {
  isCorrect?: boolean;
}

export type AnswerSubmitFn = (answer: string) => Promise<void | AnswerSubmitResult>;

/** An answer given earlier in this visit, so coming back to a question shows it. */
export interface PriorAnswer {
  selected: string;
  isCorrect: boolean;
}

export interface QuestionAnswerState {
  selected: string | null;
  submitted: boolean;
  isCorrect: boolean | null;
  submitting: boolean;
  /** Set when the save failed. The answer is still selectable and can be sent again. */
  error: string | null;
  /** True for a moment after a submit, for the tick or cross over the screen. */
  showFeedback: boolean;
  select: (id: string) => void;
  submit: () => Promise<void>;
  /** Clear the answer, e.g. to try the question again. */
  reset: () => void;
}

interface UseQuestionAnswerOptions {
  questionId: string;
  correctAnswer: string | null | undefined;
  onSubmit: AnswerSubmitFn;
  prior?: PriorAnswer | null;
}

const SAVE_FAILED = 'Your answer was not saved. Check your connection and try again.';

/**
 * One question's answer, from choosing an option to the verdict.
 *
 * Lifted out of QuestionDetail so a screen can put the Submit button somewhere
 * other than under the options (the practice reader pins it to the bottom of
 * the pane) while the options above still show the same state.
 *
 * Two things changed on the way out:
 * - the verdict comes from the server when it gives one. The client compared
 *   the option id with correct_answer, which is wrong for a numerical answer
 *   within tolerance and for a key stored as an NTA id.
 * - a failed save stays unsubmitted with an error. It used to be swallowed, so
 *   the student saw "Correct!" for an answer that was never recorded.
 */
export function useQuestionAnswer({
  questionId,
  correctAnswer,
  onSubmit,
  prior = null,
}: UseQuestionAnswerOptions): QuestionAnswerState {
  const [selected, setSelected] = useState<string | null>(prior?.selected ?? null);
  const [submitted, setSubmitted] = useState(!!prior);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(prior?.isCorrect ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A different question starts clean, or from what was answered on it earlier.
  // prior is read here rather than listed as a dependency: an answer recorded
  // on THIS question a moment ago must not reset the screen showing it.
  const priorRef = useRef(prior);
  priorRef.current = prior;
  const lastQuestionId = useRef(questionId);
  useEffect(() => {
    if (lastQuestionId.current === questionId) return;
    lastQuestionId.current = questionId;
    const p = priorRef.current;
    setSelected(p?.selected ?? null);
    setSubmitted(!!p);
    setIsCorrect(p?.isCorrect ?? null);
    setSubmitting(false);
    setError(null);
    setShowFeedback(false);
  }, [questionId]);

  useEffect(
    () => () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    },
    [],
  );

  const select = useCallback(
    (id: string) => {
      if (submitted) return;
      setSelected(id);
      setError(null);
    },
    [submitted],
  );

  const submit = useCallback(async () => {
    if (!selected || submitting || submitted) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await onSubmit(selected);
      const verdict =
        result && typeof result.isCorrect === 'boolean' ? result.isCorrect : selected === correctAnswer;
      setIsCorrect(verdict);
      setSubmitted(true);
      setShowFeedback(true);
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
      feedbackTimer.current = setTimeout(() => setShowFeedback(false), 1500);
    } catch {
      setError(SAVE_FAILED);
    } finally {
      setSubmitting(false);
    }
  }, [selected, submitting, submitted, onSubmit, correctAnswer]);

  const reset = useCallback(() => {
    setSelected(null);
    setSubmitted(false);
    setIsCorrect(null);
    setError(null);
    setShowFeedback(false);
  }, []);

  return { selected, submitted, isCorrect, submitting, error, showFeedback, select, submit, reset };
}
