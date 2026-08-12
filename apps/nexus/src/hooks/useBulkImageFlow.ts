import { useState, useCallback, useEffect, useRef } from 'react';
import type { NexusQBQuestion, NexusQBQuestionOption } from '@neram/database';
import type { ImageState } from '@/lib/bulk-upload-schema';
import {
  questionImageSlots,
  questionImagesComplete,
  questionMissingSolutionImage,
  questionNeedsSolutionImage,
  type SlotType,
} from '@/lib/qb-image-needs';

// SlotType now belongs with the rest of the image-need vocabulary. Re-exported
// so the components that import it from here keep working.
export type { SlotType };

export interface ActiveSlot {
  questionId: string;
  slot: SlotType;
}

/** Pending image changes per question: questionId -> slot -> ImageState */
export type PendingImages = Record<string, Partial<Record<SlotType, ImageState | null>>>;

/**
 * Is this slot filled, counting unsaved work?
 *
 * Bound per question so it can be handed straight to questionImageSlots, which
 * is what keeps the progress bar and the card border reading from one rule
 * instead of three.
 */
function filledWithPending(question: NexusQBQuestion, pending: PendingImages) {
  return (slot: SlotType): boolean => {
    const pendingImg = pending[question.id]?.[slot];
    if (pendingImg !== undefined) return pendingImg !== null; // null means explicitly removed
    if (slot === 'question') return !!question.question_image_url;
    if (slot === 'solution') return !!question.solution_image_url;
    const options = question.options as NexusQBQuestionOption[] | null;
    return !!options?.find((o) => o.id === slot)?.image_url;
  };
}

/** Every slot on the question, in paste order. */
function allSlotsOf(question: NexusQBQuestion): SlotType[] {
  return questionImageSlots(question).map((s) => s.slot);
}

/**
 * The slots the assembly line should visit.
 *
 * Only the ones a picture is expected in. Tabbing through the four option slots
 * of "how many rectangles are in the figure below?" is four keystrokes spent
 * confirming that 16, 14, 13 and 12 are still numbers.
 */
function expectedSlotsOf(question: NexusQBQuestion): SlotType[] {
  return questionImageSlots(question)
    .filter((s) => s.expected)
    .map((s) => s.slot);
}

/** Get the effective image for a slot (pending overrides server) */
export function getEffectiveImage(
  question: NexusQBQuestion,
  slot: SlotType,
  pending: PendingImages
): ImageState | undefined {
  const pendingImg = pending[question.id]?.[slot];
  if (pendingImg !== undefined) {
    return pendingImg === null ? undefined : pendingImg;
  }
  if (slot === 'question') {
    return question.question_image_url
      ? { url: question.question_image_url, uploaded: true }
      : undefined;
  }
  if (slot === 'solution') {
    return question.solution_image_url
      ? { url: question.solution_image_url, uploaded: true }
      : undefined;
  }
  const options = question.options as NexusQBQuestionOption[] | null;
  if (!options) return undefined;
  const opt = options.find((o) => o.id === slot);
  return opt?.image_url ? { url: opt.image_url, uploaded: true } : undefined;
}

export interface BulkImageFlowOptions {
  /**
   * Called when the assembly line runs off the end of one question onto the
   * next. The list pane uses it to open that question and scroll its row into
   * view, so pasting never silently continues on a question nobody can see.
   */
  onCrossQuestion?: (questionId: string) => void;
}

export function useBulkImageFlow(
  questions: NexusQBQuestion[],
  { onCrossQuestion }: BulkImageFlowOptions = {},
) {
  const [activeSlot, setActiveSlot] = useState<ActiveSlot | null>(null);
  const [filter, setFilter] = useState<'all' | 'figures' | 'missing'>('missing');
  const [pending, setPending] = useState<PendingImages>({});
  const slotRefs = useRef<Map<string, HTMLElement>>(new Map());

  const registerSlotRef = useCallback((questionId: string, slot: SlotType, el: HTMLElement | null) => {
    const key = `${questionId}:${slot}`;
    if (el) {
      slotRefs.current.set(key, el);
    } else {
      slotRefs.current.delete(key);
    }
  }, []);

  const scrollSlotIntoView = useCallback((questionId: string, slot: SlotType) => {
    const key = `${questionId}:${slot}`;
    const el = slotRefs.current.get(key);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  /** Set a pending image for a slot */
  const setPendingImage = useCallback(
    (questionId: string, slot: SlotType, image: ImageState | null) => {
      setPending((prev) => ({
        ...prev,
        [questionId]: {
          ...prev[questionId],
          [slot]: image,
        },
      }));
    },
    []
  );

  /** Clear all pending images (after save) */
  const clearAllPending = useCallback(() => {
    setPending({});
  }, []);

  /** Count of unsaved image changes */
  const pendingCount = Object.values(pending).reduce(
    (acc, slots) => acc + Object.keys(slots).length,
    0
  );

  /** Get all pending entries as flat list for saving */
  const getPendingEntries = useCallback(() => {
    const entries: { questionId: string; slot: SlotType; image: ImageState | null }[] = [];
    for (const [questionId, slots] of Object.entries(pending)) {
      for (const [slot, image] of Object.entries(slots)) {
        entries.push({ questionId, slot: slot as SlotType, image: image ?? null });
      }
    }
    return entries;
  }, [pending]);

  const advanceToNextEmpty = useCallback(
    (currentQuestionId: string, currentSlot: SlotType) => {
      const qIndex = questions.findIndex((q) => q.id === currentQuestionId);
      if (qIndex === -1) return;

      for (let qi = qIndex; qi < questions.length; qi++) {
        const q = questions[qi];
        const slots = expectedSlotsOf(q);
        // indexOf can be -1 when the teacher pasted into a slot nothing was
        // expected in; +1 then starts at 0, which is the right answer anyway.
        const startSlotIdx = qi === qIndex ? slots.indexOf(currentSlot) + 1 : 0;
        const isFilled = filledWithPending(q, pending);

        for (let si = startSlotIdx; si < slots.length; si++) {
          if (!isFilled(slots[si])) {
            const next = { questionId: q.id, slot: slots[si] };
            setActiveSlot(next);
            if (q.id !== currentQuestionId) onCrossQuestion?.(q.id);
            setTimeout(() => scrollSlotIntoView(q.id, slots[si]), 100);
            return;
          }
        }
      }

      setActiveSlot(null);
    },
    [questions, pending, scrollSlotIntoView, onCrossQuestion]
  );

  const moveSlot = useCallback(
    (direction: 1 | -1) => {
      if (!activeSlot) return;

      // Tab walks every slot, not just the expected ones: the guess is a
      // default, and a teacher must always be able to reach a slot it skipped.
      const allSlots: ActiveSlot[] = [];
      for (const q of questions) {
        for (const s of allSlotsOf(q)) {
          allSlots.push({ questionId: q.id, slot: s });
        }
      }

      const currentIdx = allSlots.findIndex(
        (s) => s.questionId === activeSlot.questionId && s.slot === activeSlot.slot
      );
      const nextIdx = currentIdx + direction;
      if (nextIdx >= 0 && nextIdx < allSlots.length) {
        const next = allSlots[nextIdx];
        setActiveSlot(next);
        setTimeout(() => scrollSlotIntoView(next.questionId, next.slot), 100);
      }
    },
    [activeSlot, questions, scrollSlotIntoView]
  );

  // Global keyboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveSlot(null);
        return;
      }
      if (e.key === 'Tab' && activeSlot) {
        e.preventDefault();
        moveSlot(e.shiftKey ? -1 : 1);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeSlot, moveSlot]);

  /**
   * Progress over the questions that actually want a picture, counting unsaved
   * work.
   *
   * The denominator used to be every question in the paper, so a 47-question
   * aptitude paper with 20 figures could never read better than 20/47 and the
   * bar looked stalled at exactly the moment the job was finished.
   *
   * Two tracks, never summed. Figures and solutions are different jobs done at
   * different times, and one bar averaging "40/40 figures, 0/40 solutions" into
   * a half-full bar would describe neither.
   */
  const stats = (() => {
    const wanting = questions.filter((q) =>
      questionImageSlots(q).some((s) => s.kind === 'figure' && s.expected),
    );
    const done = wanting.filter((q) => questionImagesComplete(q, filledWithPending(q, pending)));
    const solutionWanting = questions.filter(questionNeedsSolutionImage);
    const solutionDone = solutionWanting.filter(
      (q) => !questionMissingSolutionImage(q, filledWithPending(q, pending)),
    );
    return {
      total: wanting.length,
      withImages: done.length,
      solutionTotal: solutionWanting.length,
      solutionWithImages: solutionDone.length,
    };
  })();

  return {
    activeSlot,
    setActiveSlot,
    filter,
    setFilter,
    pending,
    setPendingImage,
    clearAllPending,
    pendingCount,
    getPendingEntries,
    advanceToNextEmpty,
    moveSlot,
    registerSlotRef,
    stats,
  };
}
