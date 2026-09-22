'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NexusQBQuestion } from '@neram/database';
import { solutionVideosOf } from '@neram/database';
import { classifySolutionVideo, sameSolutionVideo } from '@/lib/solution-video';
import {
  matchVideoLinks,
  type VideoLinkDuplicate,
  type VideoLinkMatchResult,
  type VideoLinkUnmatched,
  type VideoMatchRow,
} from '@/lib/video-link-matcher';
import { readDrawingParts } from '@/lib/drawing-parts';

/**
 * What a row in Videos mode will do on Save.
 *
 * - saved / empty: nothing pending, with or without a stored video
 * - draft-new / draft-replace / draft-clear: a valid pending change
 * - invalid: a pending value that is not a video link, held back from Save
 * - error: the server refused this row on the last Save
 * - split: a drawing whose videos are set per part, in the question editor
 */
export type VideoRowState =
  | 'saved'
  | 'empty'
  | 'draft-new'
  | 'draft-replace'
  | 'draft-clear'
  | 'invalid'
  | 'error'
  | 'split';

export interface VideoPasteSummary {
  mode: VideoLinkMatchResult['mode'];
  linkCount: number;
  added: number;
  replaced: number;
  unchanged: number;
  unmatched: VideoLinkUnmatched[];
  duplicates: VideoLinkDuplicate[];
}

export interface UseVideoLinkDraftsOptions {
  /** In paper order: a question with no display_order is numbered by position. */
  questions: NexusQBQuestion[];
  paperId: string;
  getToken: () => Promise<string | null>;
  onSaved: () => void;
  onOptimisticPatch: (questionId: string, patch: Partial<NexusQBQuestion>) => void;
}

export function isSplitDrawing(q: Pick<NexusQBQuestion, 'question_format' | 'drawing_parts'>): boolean {
  return q.question_format === 'DRAWING_PROMPT' && readDrawingParts(q.drawing_parts) !== null;
}

function savedOf(q: NexusQBQuestion): string {
  return q.solution_video_url ?? '';
}

/**
 * Unsaved solution-video links for one paper, between a paste and Save.
 *
 * Lives in PaperWorkspace, like the images assembly line, so drafts survive
 * switching modes and opening a question in the pane to check it.
 */
export function useVideoLinkDrafts({
  questions,
  paperId,
  getToken,
  onSaved,
  onOptimisticPatch,
}: UseVideoLinkDraftsOptions) {
  const [drafts, setDrafts] = useState<Map<string, string>>(() => new Map());
  const [errors, setErrors] = useState<Map<string, string>>(() => new Map());
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<VideoPasteSummary | null>(null);

  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);

  /** The rows the matcher reads, numbered exactly as the list shows them. */
  const matchRows = useMemo<VideoMatchRow[]>(
    () =>
      questions.map((q, i) => ({
        id: q.id,
        number: q.display_order ?? i + 1,
        savedUrl: q.solution_video_url,
        splitDrawing: isSplitDrawing(q),
      })),
    [questions],
  );

  const valueFor = useCallback(
    (id: string) => {
      if (drafts.has(id)) return drafts.get(id)!;
      const q = byId.get(id);
      return q ? savedOf(q) : '';
    },
    [drafts, byId],
  );

  const rowState = useCallback(
    (q: NexusQBQuestion): VideoRowState => {
      if (isSplitDrawing(q)) return 'split';
      if (errors.has(q.id)) return 'error';
      if (drafts.has(q.id)) {
        const link = classifySolutionVideo(drafts.get(q.id));
        if (link.kind === 'invalid') return 'invalid';
        if (link.kind === 'empty') return 'draft-clear';
        return savedOf(q).trim() ? 'draft-replace' : 'draft-new';
      }
      return savedOf(q).trim() ? 'saved' : 'empty';
    },
    [drafts, errors],
  );

  const errorFor = useCallback((id: string) => errors.get(id) ?? null, [errors]);

  const setDraft = useCallback(
    (id: string, text: string) => {
      const q = byId.get(id);
      setDrafts((prev) => {
        const next = new Map(prev);
        if (q && sameSolutionVideo(text, q.solution_video_url)) next.delete(id);
        else next.set(id, text);
        return next;
      });
      setErrors((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    },
    [byId],
  );

  /**
   * Put matched links in as drafts, the one path both a paste and "Find on
   * YouTube" use: a link equal to what is saved leaves its row alone, and the
   * rest become new or replacing drafts, with any earlier save error cleared.
   */
  const applyMatches = useCallback(
    (matches: { questionId: string; url: string; unchanged: boolean }[]) => {
      let added = 0;
      let replaced = 0;
      let unchanged = 0;
      const next = new Map(drafts);
      for (const match of matches) {
        const q = byId.get(match.questionId);
        if (match.unchanged) {
          unchanged += 1;
          next.delete(match.questionId);
          continue;
        }
        if (q && savedOf(q).trim()) replaced += 1;
        else added += 1;
        next.set(match.questionId, match.url);
      }
      setDrafts(next);
      setErrors((prev) => {
        if (prev.size === 0) return prev;
        const cleared = new Map(prev);
        matches.forEach((m) => cleared.delete(m.questionId));
        return cleared;
      });
      return { added, replaced, unchanged };
    },
    [drafts, byId],
  );

  /** Run the matcher over a paste and fill the matched rows in as drafts. */
  const pasteText = useCallback(
    (text: string, startAt?: number): VideoPasteSummary => {
      const result = matchVideoLinks(text, matchRows, { startAt });
      const { added, replaced, unchanged } = applyMatches(result.matches);
      const pasted: VideoPasteSummary = {
        mode: result.mode,
        linkCount: result.linkCount,
        added,
        replaced,
        unchanged,
        unmatched: result.unmatched,
        duplicates: result.duplicates,
      };
      setSummary(pasted);
      return pasted;
    },
    [matchRows, applyMatches],
  );

  /**
   * Links found on YouTube for this paper (lib/youtube-solution-titles). The
   * dialog has already shown what was skipped and why, so the summary here
   * only counts what went in.
   */
  const fillFound = useCallback(
    (fills: { questionId: string; number: number; url: string }[]): VideoPasteSummary => {
      const { added, replaced, unchanged } = applyMatches(
        fills.map((f) => {
          const q = byId.get(f.questionId);
          return { questionId: f.questionId, url: f.url, unchanged: !!q && sameSolutionVideo(savedOf(q), f.url) };
        }),
      );
      const found: VideoPasteSummary = {
        mode: 'labelled',
        linkCount: fills.length,
        added,
        replaced,
        unchanged,
        unmatched: [],
        duplicates: [],
      };
      setSummary(found);
      return found;
    },
    [applyMatches, byId],
  );

  /** Drop one row's draft and keep what is saved: turning down one replacement. */
  const revert = useCallback((questionId: string) => {
    setDrafts((prev) => {
      if (!prev.has(questionId)) return prev;
      const next = new Map(prev);
      next.delete(questionId);
      return next;
    });
    setErrors((prev) => {
      if (!prev.has(questionId)) return prev;
      const next = new Map(prev);
      next.delete(questionId);
      return next;
    });
  }, []);

  const discard = useCallback(() => {
    setDrafts(new Map());
    setErrors(new Map());
    setSummary(null);
  }, []);

  const dismissSummary = useCallback(() => setSummary(null), []);

  const { unsavedCount, invalidCount } = useMemo(() => {
    let invalid = 0;
    drafts.forEach((value) => {
      if (classifySolutionVideo(value).kind === 'invalid') invalid += 1;
    });
    return { unsavedCount: drafts.size, invalidCount: invalid };
  }, [drafts]);

  /** Whether this question will have a video once the drafts are saved. */
  const hasVideoNow = useCallback(
    (q: NexusQBQuestion): boolean => {
      if (isSplitDrawing(q)) return solutionVideosOf(q).length > 0;
      if (drafts.has(q.id)) {
        const kind = classifySolutionVideo(drafts.get(q.id)).kind;
        return kind === 'youtube' || kind === 'sharepoint';
      }
      return savedOf(q).trim() !== '';
    },
    [drafts],
  );

  const withVideoCount = useMemo(() => questions.filter(hasVideoNow).length, [questions, hasVideoNow]);

  const save = useCallback(async (): Promise<{ saved: number; failed: number; message?: string }> => {
    const links: { question_id: string; solution_video_url: string | null }[] = [];
    drafts.forEach((value, id) => {
      const link = classifySolutionVideo(value);
      if (link.kind === 'invalid') return;
      links.push({ question_id: id, solution_video_url: link.kind === 'empty' ? null : link.url });
    });
    if (links.length === 0) return { saved: 0, failed: 0 };

    setSaving(true);
    try {
      const token = await getToken();
      if (!token) return { saved: 0, failed: links.length, message: 'Sign in again to save' };

      const res = await fetch(`/api/question-bank/papers/${paperId}/video-links`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ links }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { saved: 0, failed: links.length, message: json.error || 'Could not save, try again' };
      }

      const results: { question_id: string; ok: boolean; solution_video_url?: string | null; error?: string }[] =
        json.data?.results ?? [];
      const okIds = new Set<string>();
      const failed = new Map<string, string>();
      for (const r of results) {
        if (r.ok) {
          okIds.add(r.question_id);
          onOptimisticPatch(r.question_id, { solution_video_url: r.solution_video_url ?? null });
        } else {
          failed.set(r.question_id, r.error || 'Could not save this one');
        }
      }

      setDrafts((prev) => {
        const next = new Map(prev);
        okIds.forEach((id) => next.delete(id));
        return next;
      });
      setErrors((prev) => {
        const next = new Map(prev);
        okIds.forEach((id) => next.delete(id));
        failed.forEach((message, id) => next.set(id, message));
        return next;
      });
      if (okIds.size > 0) {
        setSummary(null);
        onSaved();
      }
      return { saved: okIds.size, failed: failed.size };
    } catch {
      return { saved: 0, failed: links.length, message: 'Could not save, check the connection and try again' };
    } finally {
      setSaving(false);
    }
  }, [drafts, getToken, paperId, onOptimisticPatch, onSaved]);

  // Leaving the page with unsaved links asks first: a 59-link paste is real work.
  useEffect(() => {
    if (unsavedCount === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [unsavedCount]);

  return {
    matchRows,
    valueFor,
    rowState,
    errorFor,
    setDraft,
    pasteText,
    fillFound,
    revert,
    discard,
    dismissSummary,
    save,
    saving,
    summary,
    unsavedCount,
    invalidCount,
    hasVideoNow,
    withVideoCount,
  };
}

export type VideoLinkDrafts = ReturnType<typeof useVideoLinkDrafts>;
