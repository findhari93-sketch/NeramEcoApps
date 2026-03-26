import { useState, useCallback, useEffect, useRef } from 'react';
import type { NexusQBQuestion, NexusQBQuestionOption } from '@neram/database';
import type { ImageState } from '@/lib/bulk-upload-schema';

export type SlotType = 'question' | 'a' | 'b' | 'c' | 'd';

export interface ActiveSlot {
  questionId: string;
  slot: SlotType;
}

/** Pending image changes per question: questionId -> slot -> ImageState */
export type PendingImages = Record<string, Partial<Record<SlotType, ImageState | null>>>;

const OPTION_SLOTS: SlotType[] = ['a', 'b', 'c', 'd'];

function getSlotOrder(question: NexusQBQuestion): SlotType[] {
  const slots: SlotType[] = ['question'];
  if (question.question_format === 'MCQ') {
    slots.push(...OPTION_SLOTS);
  }
  return slots;
}

/** Check if a slot is empty (no server image AND no pending image) */
function isSlotEmpty(
  question: NexusQBQuestion,
  slot: SlotType,
  pending: PendingImages
): boolean {
  // Check pending first
  const pendingImg = pending[question.id]?.[slot];
  if (pendingImg !== undefined) {
    return pendingImg === null; // null means explicitly removed
  }
  // Fall back to server data
  if (slot === 'question') {
    return !question.question_image_url;
  }
  const options = question.options as NexusQBQuestionOption[] | null;
  if (!options) return true;
  const opt = options.find((o) => o.id === slot);
  return !opt?.image_url;
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
  const options = question.options as NexusQBQuestionOption[] | null;
  if (!options) return undefined;
  const opt = options.find((o) => o.id === slot);
  return opt?.image_url ? { url: opt.image_url, uploaded: true } : undefined;
}

export function useBulkImageFlow(questions: NexusQBQuestion[]) {
  const [activeSlot, setActiveSlot] = useState<ActiveSlot | null>(null);
  const [filter, setFilter] = useState<'all' | 'needs-images' | 'missing'>('needs-images');
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
        const slots = getSlotOrder(q);
        const startSlotIdx = qi === qIndex ? slots.indexOf(currentSlot) + 1 : 0;

        for (let si = startSlotIdx; si < slots.length; si++) {
          if (isSlotEmpty(q, slots[si], pending)) {
            const next = { questionId: q.id, slot: slots[si] };
            setActiveSlot(next);
            setTimeout(() => scrollSlotIntoView(q.id, slots[si]), 100);
            return;
          }
        }
      }

      setActiveSlot(null);
    },
    [questions, pending, scrollSlotIntoView]
  );

  const moveSlot = useCallback(
    (direction: 1 | -1) => {
      if (!activeSlot) return;

      const allSlots: ActiveSlot[] = [];
      for (const q of questions) {
        for (const s of getSlotOrder(q)) {
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

  // Progress stats (server + pending)
  const stats = {
    total: questions.length,
    withImages: questions.filter((q) => {
      const qImgDone = !isSlotEmpty(q, 'question', pending);
      if (!qImgDone) return false;
      if (q.question_format === 'MCQ' && q.options) {
        const opts = q.options as NexusQBQuestionOption[];
        return opts.every((o) => !isSlotEmpty(q, o.id as SlotType, pending));
      }
      return true;
    }).length,
  };

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
