'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Snackbar } from '@neram/ui';
import type { NexusQBQuestion, NexusQBQuestionSource, QBQuestionSection } from '@neram/database';
import PaperQuestionList, {
  type PaperQuestionMode,
  type NeedsFilter,
  type PaperSectionFilter,
  type DeleteRefusal,
} from './PaperQuestionList';
import PaperQuestionDetail from './PaperQuestionDetail';
import type { PaperFallback } from './QuestionEditForm';
import { useBulkImageFlow, type SlotType } from '@/hooks/useBulkImageFlow';
import type { ImageState } from '@/lib/bulk-upload-schema';

export type { PaperQuestionMode, NeedsFilter, PaperSectionFilter };

export interface PaperWorkspaceProps {
  /** Already in paper order. Position is counted from this order, not display_order. */
  questions: NexusQBQuestion[];
  tagCounts?: Record<string, number>;
  /** Tag ids per question id, the same batch tagCounts is derived from. */
  tagsByQuestion?: Record<string, string[]>;
  /** The paper being viewed, for the form's Source panel. */
  paper?: PaperFallback;
  /**
   * Source rows by question id. The source row is more precise than the paper:
   * it carries that question's own session, shift and printed number. Without it
   * the Source panel falls back to the paper for every question, which is a
   * quieter version of the bug the paper fallback was added to fix.
   */
  sources?: Record<string, NexusQBQuestionSource[]>;
  /**
   * Edit/Images mode and both filters are owned by the paper header (page.tsx),
   * not here, so the work-queue chips up there ("28 need a solution") can drive
   * this list directly rather than only describing it.
   */
  mode: PaperQuestionMode;
  onModeChange: (mode: PaperQuestionMode) => void;
  needsFilter: NeedsFilter;
  onNeedsFilterChange: (filter: NeedsFilter) => void;
  sectionFilter: PaperSectionFilter | null;
  onSectionFilterChange: (filter: PaperSectionFilter | null) => void;
  getToken: () => Promise<string | null>;
  onSaved: () => void;
  onChangeSections: (questionIds: string[], section: QBQuestionSection) => Promise<void>;
  /**
   * Patch one question's fields in the parent's own copy of `questions`,
   * ahead of the network round trip. Lets a needs_image toggle look instant
   * instead of waiting on a refetch, and lets a failed write roll itself back.
   */
  onOptimisticPatch: (questionId: string, patch: Partial<NexusQBQuestion>) => void;
}

/** Is the user typing? Then j and k are letters, not navigation. */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

/**
 * The master-detail shell: the list owns scanning, the pane owns editing, and
 * this owns which question is open.
 *
 * One source of truth for selection is the whole point. The two tabs this
 * replaces each kept their own idea of the current question, so correcting an
 * answer key and then editing the same question meant finding it twice.
 */
export default function PaperWorkspace({
  questions, tagCounts = {}, tagsByQuestion, paper, sources,
  mode, onModeChange, needsFilter, onNeedsFilterChange, sectionFilter, onSectionFilterChange,
  getToken, onSaved, onChangeSections, onOptimisticPatch,
}: PaperWorkspaceProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [savingImages, setSavingImages] = useState(false);
  const [saveImageProgress, setSaveImageProgress] = useState({ done: 0, total: 0 });
  const [imageToast, setImageToast] = useState<string | null>(null);

  /**
   * Hoisted here, not local to the images pane, because the paste assembly
   * line's whole point is that unsaved work survives moving between
   * questions. A pane-local instance would lose every pending image the
   * moment the teacher opened the next one.
   */
  const {
    activeSlot,
    setActiveSlot,
    pending,
    setPendingImage,
    clearAllPending,
    pendingCount,
    getPendingEntries,
    advanceToNextEmpty,
    registerSlotRef,
    stats: imageStats,
  } = useBulkImageFlow(questions, {
    // The assembly line ran off the end of one question onto the next; open
    // that question so the teacher can see what they are pasting into.
    onCrossQuestion: setActiveId,
  });

  const activeIndex = useMemo(
    () => (activeId ? questions.findIndex((q) => q.id === activeId) : -1),
    [questions, activeId],
  );
  const activeQuestion = activeIndex >= 0 ? questions[activeIndex] : null;

  // The other member(s) of this question's either/or group, by paper number,
  // for the read-only line in the editor. Derived rather than stored: the
  // group id is the only thing questions in a group agree on.
  const choiceGroupSiblings = useMemo(() => {
    if (!activeQuestion?.choice_group_id) return [];
    return questions
      .filter((q) => q.id !== activeQuestion.id && q.choice_group_id === activeQuestion.choice_group_id)
      .map((q) => q.display_order)
      .filter((n): n is number => n != null);
  }, [questions, activeQuestion]);

  const unlinkChoiceGroup = useCallback(
    async (questionId: string) => {
      const token = await getToken();
      if (!token) return;
      await fetch(`/api/question-bank/questions/${questionId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice_group_id: null, choice_group_pick: null }),
      });
      onSaved();
    },
    [getToken, onSaved],
  );

  // The pane only ever mounts for a question that exists, so it no longer
  // needs an empty state of its own. That invariant depends on this: a
  // refetch that drops the open question (deleted, deactivated out of the
  // filtered set) must close the pane rather than leave it mounted with
  // nothing to show.
  useEffect(() => {
    if (activeId && activeIndex < 0) setActiveId(null);
  }, [activeId, activeIndex]);

  const step = useCallback(
    (delta: number) => {
      setActiveId((current) => {
        const i = questions.findIndex((q) => q.id === current);
        if (i < 0) return current;
        const next = i + delta;
        if (next < 0 || next >= questions.length) return current;
        return questions[next].id;
      });
    },
    [questions],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === 'j') { e.preventDefault(); step(1); }
      if (e.key === 'k') { e.preventDefault(); step(-1); }
      if (e.key === 'Escape') setActiveId(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [step]);

  const changeOne = useCallback(
    (questionId: string, section: QBQuestionSection) => onChangeSections([questionId], section),
    [onChangeSections],
  );

  /** Ported from the deleted BulkImageManager: group pending slots by question, PATCH each. */
  const handleSaveAllImages = useCallback(async () => {
    const entries = getPendingEntries();
    if (entries.length === 0) return;

    setSavingImages(true);
    setSaveImageProgress({ done: 0, total: entries.length });

    const byQuestion = new Map<string, { slot: SlotType; image: ImageState | null }[]>();
    for (const entry of entries) {
      if (!byQuestion.has(entry.questionId)) byQuestion.set(entry.questionId, []);
      byQuestion.get(entry.questionId)!.push({ slot: entry.slot, image: entry.image });
    }

    let savedCount = 0;
    let errorCount = 0;
    try {
      const token = await getToken();
      if (!token) throw new Error('Auth failed');

      for (const [questionId, slots] of byQuestion) {
        const body: Record<string, unknown> = {};
        const optionImages: Record<string, string | null> = {};
        for (const { slot, image } of slots) {
          if (slot === 'question') body.question_image_url = image?.uploaded ? image.url : null;
          else if (slot === 'solution') body.solution_image_url = image?.uploaded ? image.url : null;
          else optionImages[slot] = image?.uploaded ? image.url : null;
        }
        if (Object.keys(optionImages).length > 0) body.option_images = optionImages;

        try {
          const res = await fetch(`/api/question-bank/questions/${questionId}/images`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) errorCount++;
          else savedCount += slots.length;
        } catch {
          errorCount++;
        }
        setSaveImageProgress((prev) => ({ ...prev, done: prev.done + slots.length }));
      }

      setImageToast(
        errorCount === 0
          ? `${savedCount} image${savedCount === 1 ? '' : 's'} saved`
          : `Saved ${savedCount}, ${errorCount} question${errorCount === 1 ? '' : 's'} failed`,
      );
      if (errorCount === 0) clearAllPending();
      onSaved();
    } catch (err) {
      setImageToast(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingImages(false);
      setSaveImageProgress({ done: 0, total: 0 });
    }
  }, [getPendingEntries, getToken, clearAllPending, onSaved]);

  const handlePendingChange = useCallback(
    (questionId: string) => (slot: SlotType, image: ImageState | null) => {
      setPendingImage(questionId, slot, image);
      if (image) advanceToNextEmpty(questionId, slot);
    },
    [setPendingImage, advanceToNextEmpty],
  );

  const handleSlotFocus = useCallback(
    (questionId: string) => (slot: SlotType) => setActiveSlot({ questionId, slot }),
    [setActiveSlot],
  );

  /**
   * One question's needs_image verdict, from the card open in the pane.
   *
   * Patches `questions` optimistically so the toggle (bound straight to
   * `question.needs_image`) flips the instant a teacher clicks it, then rolls
   * that back and surfaces a toast on a failed write. The old version awaited
   * the PATCH and called onSaved() unconditionally without checking res.ok,
   * so a rejected write (auth, validation, a dropped connection) refetched
   * the same unchanged row and looked identical to the click doing nothing.
   */
  const setNeedsImageOne = useCallback(
    async (questionId: string, value: boolean | null) => {
      const token = await getToken();
      if (!token) return;
      const previous = questions.find((q) => q.id === questionId)?.needs_image ?? null;
      onOptimisticPatch(questionId, { needs_image: value });
      try {
        const res = await fetch(`/api/question-bank/questions/${questionId}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ needs_image: value }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          onOptimisticPatch(questionId, { needs_image: previous });
          setImageToast(json.error || 'Could not save that, try again');
          return;
        }
        onSaved();
      } catch {
        onOptimisticPatch(questionId, { needs_image: previous });
        setImageToast('Could not save that, try again');
      }
    },
    [getToken, onSaved, questions, onOptimisticPatch],
  );

  /** A whole section's worth of questions at once, from the selection bar. */
  const bulkSetNeedsImage = useCallback(
    async (questionIds: string[], value: boolean) => {
      const token = await getToken();
      if (!token) return;
      const previousById = new Map(questionIds.map((id) => [id, questions.find((q) => q.id === id)?.needs_image ?? null]));
      questionIds.forEach((id) => onOptimisticPatch(id, { needs_image: value }));
      try {
        const res = await fetch('/api/question-bank/questions/bulk-update', {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'set_needs_image', question_ids: questionIds, needs_image: value }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          questionIds.forEach((id) => onOptimisticPatch(id, { needs_image: previousById.get(id) ?? null }));
          setImageToast(json.error || 'Could not save that, try again');
          return;
        }
        onSaved();
      } catch {
        questionIds.forEach((id) => onOptimisticPatch(id, { needs_image: previousById.get(id) ?? null }));
        setImageToast('Could not save that, try again');
      }
    },
    [getToken, onSaved, questions, onOptimisticPatch],
  );

  /**
   * Permanent delete, guarded server-side. Kept rows come back with a reason
   * rather than being silently skipped, so the list can select just those and
   * report why.
   */
  const deleteQuestions = useCallback(
    async (questionIds: string[]): Promise<{ deleted: number; refused: DeleteRefusal[] }> => {
      const token = await getToken();
      if (!token) return { deleted: 0, refused: [] };
      try {
        const res = await fetch('/api/question-bank/questions/bulk-update', {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ question_ids: questionIds, action: 'delete' }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setImageToast(json.error || 'Delete failed');
          return { deleted: 0, refused: [] };
        }
        onSaved();
        return { deleted: json.data?.deleted ?? 0, refused: json.data?.refused ?? [] };
      } catch {
        setImageToast('Delete failed');
        return { deleted: 0, refused: [] };
      }
    },
    [getToken, onSaved],
  );

  /**
   * Hide or re-show just the ticked questions.
   *
   * The paper header used to carry a permanently armed "Deactivate 90", which
   * is the whole paper and no way back short of Activate-then-recheck. Scoped
   * to a selection the same action needs no confirmation: the teacher ticked
   * the rows, the count is on screen, and Activate on the same bar undoes it.
   */
  const setActiveQuestions = useCallback(
    async (questionIds: string[], active: boolean) => {
      const token = await getToken();
      if (!token) return;
      try {
        const res = await fetch('/api/question-bank/questions/bulk-update', {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: active ? 'activate' : 'deactivate',
            question_ids: questionIds,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setImageToast(json.error || 'Could not change that, try again');
          return;
        }
        const updated = json.data?.updated ?? 0;
        // activate only takes questions that already have an answer key, so
        // "3 selected" and "1 activated" is a normal and important difference.
        setImageToast(
          active
            ? updated === questionIds.length
              ? `${updated} question${updated === 1 ? '' : 's'} activated`
              : `${updated} of ${questionIds.length} activated, the rest have no answer key yet`
            : `${updated} question${updated === 1 ? '' : 's'} hidden from students`,
        );
        onSaved();
      } catch {
        setImageToast('Could not change that, try again');
      }
    },
    [getToken, onSaved],
  );

  /** "Attempt any one of these", from a run selected in the list. */
  const linkChoiceGroup = useCallback(
    async (questionIds: string[]) => {
      const token = await getToken();
      if (!token) return;
      await fetch('/api/question-bank/questions/bulk-update', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'link_choice_group', question_ids: questionIds }),
      });
      onSaved();
    },
    [getToken, onSaved],
  );

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 2,
        // flex-start let both columns size to their content, which is exactly
        // why neither one ever formed its own scroll region: with no resolved
        // height, `overflowY: auto` inside them has nothing to clip against
        // and the whole document scrolls instead. `stretch` is half of what
        // makes the two independent scroll panes real; the other half is the
        // resolved height, which now comes from PaperShell.
        alignItems: 'stretch',
        // This used to measure its own distance from the top of the viewport
        // and subtract it. That put the measurement BELOW the header it was
        // measuring, so the header's height was spent before the calculation
        // began, and the observer watched document.body, which never resizes
        // because <main> is what scrolls. PaperShell takes one measurement
        // above the header instead, and everything under it is plain flex.
        flex: 1,
        minHeight: 0,
      }}
    >
      <Box
        sx={{
          flex: { xs: 1, md: activeId ? '0 0 46%' : '1 1 100%' },
          minWidth: 0,
          minHeight: 0,
          transition: 'flex-basis 220ms cubic-bezier(0.4, 0, 0.2, 1)',
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        }}
      >
        <PaperQuestionList
          questions={questions}
          tagCounts={tagCounts}
          activeQuestionId={activeId}
          onActivate={setActiveId}
          onChangeSections={onChangeSections}
          mode={mode}
          onModeChange={onModeChange}
          needsFilter={needsFilter}
          onNeedsFilterChange={onNeedsFilterChange}
          sectionFilter={sectionFilter}
          onSectionFilterChange={onSectionFilterChange}
          onBulkSetNeedsImage={bulkSetNeedsImage}
          onLinkChoiceGroup={linkChoiceGroup}
          onDeleteQuestions={deleteQuestions}
          onSetActiveQuestions={setActiveQuestions}
          imageStats={imageStats}
          pendingImageCount={pendingCount}
          onSaveAllImages={handleSaveAllImages}
          savingImages={savingImages}
          saveImageProgress={saveImageProgress}
        />
      </Box>
      {activeId && (
        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'block' }}>
          <PaperQuestionDetail
            question={activeQuestion}
            position={activeQuestion ? { index: activeIndex + 1, total: questions.length } : null}
            paper={paper}
            sources={activeQuestion ? sources?.[activeQuestion.id] : undefined}
            tagIds={activeQuestion ? tagsByQuestion?.[activeQuestion.id] : undefined}
            choiceGroupSiblings={choiceGroupSiblings}
            onUnlinkChoiceGroup={activeQuestion ? () => unlinkChoiceGroup(activeQuestion.id) : undefined}
            getToken={getToken}
            onSaved={onSaved}
            onClose={() => setActiveId(null)}
            onPrevious={() => step(-1)}
            onNext={() => step(1)}
            onChangeSection={changeOne}
            mode={mode}
            imagesPane={
              activeQuestion
                ? {
                    activeSlot: activeSlot?.questionId === activeQuestion.id ? activeSlot.slot : null,
                    pending,
                    onSlotFocus: handleSlotFocus(activeQuestion.id),
                    onPendingChange: handlePendingChange(activeQuestion.id),
                    registerSlotRef,
                    onSetNeedsImage: (value) => setNeedsImageOne(activeQuestion.id, value),
                  }
                : undefined
            }
          />
        </Box>
      )}
      {imageToast && (
        <Snackbar
          open
          autoHideDuration={3000}
          onClose={() => setImageToast(null)}
          message={imageToast}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        />
      )}
    </Box>
  );
}
