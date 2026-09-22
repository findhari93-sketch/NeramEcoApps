'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  NexusQBQuestionDetail,
  NexusQBQuestionListItem,
  NexusQBStudentAttempt,
  QBFilterState,
} from '@neram/database';
import type { QBMatchKind } from '@/components/question-bank/QBSearchStatus';
import {
  displayNumbers,
  practiceScopeOf,
  sortForPaper,
  type PaperContext,
  type PracticeScope,
} from '@/lib/qb-paper-number';
import type { PriorAnswer } from '../useQuestionAnswer';
import { patchAttemptSummary, progressOf, reconcileCurrent, stepFrom } from './practice-logic';

/** A paper arrives whole: 100 is the list endpoint's ceiling per request. */
const PAPER_PAGE = 100;
/** Past this a "paper" is really a filter gone wide, and it pages like the bank. */
const PAPER_MAX = 300;
/** Everything else loads a screenful at a time. */
const BANK_PAGE = 30;

export interface PracticeContext extends PaperContext {
  section: string | null;
  paperSource: string | null;
}

export interface UsePracticeSessionOptions {
  classroomId: string | null;
  /** Auth has answered, so a missing classroom is an answer rather than a wait. */
  authSettled: boolean;
  getToken: () => Promise<string | null>;
  ctx: PracticeContext;
  filters: QBFilterState;
  /** Writes the drawer filters onto a request (parent categories expanded). */
  applyFilterParams: (params: URLSearchParams) => void;
  /** Panes keep a question open at all times; the phone reader can be closed. */
  layout: 'panes' | 'reader';
  /** A question to open once the list lands, from a shared `?qid=` link. */
  initialQid: string | null;
}

export interface PracticeSession {
  scope: PracticeScope;
  questions: NexusQBQuestionListItem[];
  /** The label for each question: its paper number, or its place in the list. */
  numbers: Map<string, number>;
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  reload: () => void;
  search: { matchKind: QBMatchKind | null; didYouMean: string | null; matchedTerms: string[] };
  progress: { total: number; answered: number; right: number };

  currentId: string | null;
  currentIndex: number;
  detail: NexusQBQuestionDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  retryDetail: () => void;
  open: (id: string) => void;
  close: () => void;
  /** The id one step along, without moving. */
  neighbour: (delta: number) => string | null;
  priorAnswer: (id: string) => PriorAnswer | null;

  submit: (id: string, answer: string) => Promise<{ isCorrect: boolean }>;
  toggleStudied: (id: string) => Promise<void>;
  report: (id: string, reportType: string, description: string) => Promise<void>;
}

interface ListPayload {
  questions?: NexusQBQuestionListItem[];
  total?: number;
  search?: { match_kind?: QBMatchKind; did_you_mean?: string | null; matched_terms?: string[] };
}

async function readList(res: Response): Promise<ListPayload> {
  if (!res.ok) throw new Error(`list ${res.status}`);
  const json = await res.json();
  const payload = json.data || json;
  return {
    questions: payload?.questions || (Array.isArray(payload) ? payload : []),
    total: payload?.total ?? json.total_count,
    search: payload?.search,
  };
}

/**
 * Everything the practice screen knows: the list, the open question, the
 * answers given this visit.
 *
 * Lifted out of a 1300-line page, and changed on the way:
 * - a paper loads whole and in paper order, so the grid and "Q18 of 30" are
 *   the paper's, not a page's. The bank loads more on request instead of
 *   paging, so the list never jumps back to the top.
 * - a detail that lands after the student moved on is dropped. It used to
 *   overwrite the question they were reading.
 * - details are kept for the visit and the next one is fetched ahead, so Next
 *   is instant. In memory only: the SWR device cache persists to localStorage,
 *   and these payloads carry the answer key.
 * - an answer patches the list at once, so the grid turns green or red without
 *   a refetch.
 */
export function usePracticeSession({
  classroomId,
  authSettled,
  getToken,
  ctx,
  filters,
  applyFilterParams,
  layout,
  initialQid,
}: UsePracticeSessionOptions): PracticeSession {
  const scope = practiceScopeOf(ctx);

  const [questions, setQuestions] = useState<NexusQBQuestionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState<PracticeSession['search']>({ matchKind: null, didYouMean: null, matchedTerms: [] });
  const [reloadTick, setReloadTick] = useState(0);

  const [currentId, setCurrentId] = useState<string | null>(null);
  const [detail, setDetail] = useState<NexusQBQuestionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const currentIdRef = useRef<string | null>(null);
  currentIdRef.current = currentId;
  const pendingQid = useRef<string | null>(initialQid);
  const details = useRef(new Map<string, NexusQBQuestionDetail>());
  const inflight = useRef(new Map<string, Promise<NexusQBQuestionDetail | null>>());
  const answers = useRef(new Map<string, PriorAnswer>());
  const openedAt = useRef<number>(Date.now());
  const listSeq = useRef(0);
  const listAbort = useRef<AbortController | null>(null);

  // The latest callbacks without making every effect depend on their identity.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const applyRef = useRef(applyFilterParams);
  applyRef.current = applyFilterParams;

  const baseParams = useCallback(
    (pageNum: number, pageSize: number) => {
      const params = new URLSearchParams();
      params.set('classroom_id', classroomId!);
      params.set('page', String(pageNum));
      params.set('page_size', String(pageSize));
      params.set('mode', 'practice');
      if (ctx.exam) params.set('exam_type', ctx.exam);
      if (ctx.year) params.set('year', String(ctx.year));
      if (ctx.session) params.set('session', ctx.session);
      if (ctx.shift) params.set('shift', ctx.shift);
      if (ctx.section) params.set('section', ctx.section);
      // Read by the endpoint, and sent by nobody until now, so the recalled
      // papers link practised every question of that session.
      if (ctx.paperSource) params.set('paper_source', ctx.paperSource);
      applyRef.current(params);
      return params;
    },
    [classroomId, ctx.exam, ctx.year, ctx.session, ctx.shift, ctx.section, ctx.paperSource],
  );

  const filtersKey = JSON.stringify(filters);

  // ─── The list ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!classroomId) {
      if (authSettled) setLoading(false);
      return;
    }
    const seq = ++listSeq.current;
    listAbort.current?.abort();
    const controller = new AbortController();
    listAbort.current = controller;
    // The previous list stays on screen until this one lands; the skeleton
    // over it says work is happening.
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const token = await getTokenRef.current();
        const headers = { Authorization: `Bearer ${token}` };
        const pageSize = scope === 'paper' ? PAPER_PAGE : BANK_PAGE;
        const first = await readList(
          await fetch(`/api/question-bank/questions?${baseParams(1, pageSize).toString()}`, {
            headers,
            signal: controller.signal,
          }),
        );
        let items = first.questions ?? [];
        const count = first.total ?? items.length;

        // The rest of a paper, in parallel.
        if (scope === 'paper' && count > items.length) {
          const pages = Math.min(Math.ceil(count / PAPER_PAGE), Math.ceil(PAPER_MAX / PAPER_PAGE));
          const rest = await Promise.all(
            Array.from({ length: pages - 1 }, (_, i) =>
              fetch(`/api/question-bank/questions?${baseParams(i + 2, PAPER_PAGE).toString()}`, {
                headers,
                signal: controller.signal,
              }).then(readList),
            ),
          );
          for (const r of rest) items = items.concat(r.questions ?? []);
        }

        if (seq !== listSeq.current) return;
        const ordered = scope === 'paper' && !filters.search_text ? sortForPaper(items, ctx) : items;
        setQuestions(ordered);
        setTotal(count);
        setPage(1);
        setSearch({
          matchKind: first.search?.match_kind ?? null,
          didYouMean: first.search?.did_you_mean ?? null,
          matchedTerms: first.search?.matched_terms ?? [],
        });
      } catch (err) {
        if (controller.signal.aborted || seq !== listSeq.current) return;
        console.error('Failed to fetch questions:', err);
        setQuestions([]);
        setTotal(0);
        setError('Could not load questions. Check your connection and try again.');
      } finally {
        if (seq === listSeq.current) setLoading(false);
      }
    })();

    return () => controller.abort();
    // filtersKey stands in for filters, whose identity changes on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomId, authSettled, scope, baseParams, filtersKey, reloadTick]);

  const hasMore = scope !== 'paper' ? questions.length < total : false;

  const loadMore = useCallback(() => {
    if (!classroomId || loadingMore || !hasMore) return;
    const seq = listSeq.current;
    setLoadingMore(true);
    (async () => {
      try {
        const token = await getTokenRef.current();
        const next = await readList(
          await fetch(`/api/question-bank/questions?${baseParams(page + 1, BANK_PAGE).toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        );
        if (seq !== listSeq.current) return;
        setQuestions((prev) => {
          const seen = new Set(prev.map((q) => q.id));
          return prev.concat((next.questions ?? []).filter((q) => !seen.has(q.id)));
        });
        setPage((p) => p + 1);
      } catch (err) {
        console.error('Failed to load more questions:', err);
      } finally {
        setLoadingMore(false);
      }
    })();
  }, [classroomId, loadingMore, hasMore, baseParams, page]);

  // ─── Keeping the open question valid ───────────────────────────────────────
  useEffect(() => {
    if (loading) return;
    const wanted = pendingQid.current;
    if (wanted) {
      pendingQid.current = null;
      if (questions.some((q) => q.id === wanted)) {
        setCurrentId(wanted);
        return;
      }
    }
    setCurrentId((cur) => reconcileCurrent(questions, cur, layout));
    // layout is listed so widening a phone into two panes fills the empty pane.
  }, [questions, loading, layout]);

  // ─── The open question's detail ────────────────────────────────────────────
  const fetchDetail = useCallback(
    (id: string): Promise<NexusQBQuestionDetail | null> => {
      const cached = details.current.get(id);
      if (cached) return Promise.resolve(cached);
      const running = inflight.current.get(id);
      if (running) return running;
      const request = (async () => {
        try {
          const token = await getTokenRef.current();
          const res = await fetch(`/api/question-bank/questions/${id}?classroom_id=${classroomId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error(`detail ${res.status}`);
          const json = await res.json();
          const d = (json.data || json) as NexusQBQuestionDetail;
          details.current.set(id, d);
          return d;
        } finally {
          inflight.current.delete(id);
        }
      })();
      inflight.current.set(id, request);
      return request;
    },
    [classroomId],
  );

  const prefetch = useCallback(
    (id: string | null) => {
      if (!id || details.current.has(id) || inflight.current.has(id)) return;
      fetchDetail(id)
        .then((d) => {
          // Warm the figure too, so the next question paints complete.
          if (d?.question_image_url && typeof window !== 'undefined') new window.Image().src = d.question_image_url;
        })
        .catch(() => {});
    },
    [fetchDetail],
  );

  useEffect(() => {
    if (!currentId || !classroomId) {
      setDetail(null);
      setDetailLoading(false);
      setDetailError(null);
      return;
    }
    openedAt.current = Date.now();
    const cached = details.current.get(currentId);
    if (cached) {
      setDetail(cached);
      setDetailLoading(false);
      setDetailError(null);
      prefetch(stepFrom(questions, currentId, 1));
      return;
    }
    setDetail(null);
    setDetailLoading(true);
    setDetailError(null);
    const id = currentId;
    fetchDetail(id)
      .then((d) => {
        if (currentIdRef.current !== id) return; // the student moved on
        setDetail(d);
        prefetch(stepFrom(questions, id, 1));
      })
      .catch((err) => {
        if (currentIdRef.current !== id) return;
        console.error('Failed to fetch question detail:', err);
        setDetailError('This question did not load. Check your connection and try again.');
      })
      .finally(() => {
        if (currentIdRef.current === id) setDetailLoading(false);
      });
    // questions is read for the prefetch target only; a list patch must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, classroomId, fetchDetail, prefetch]);

  const open = useCallback((id: string) => setCurrentId(id), []);
  const close = useCallback(() => setCurrentId(null), []);
  const neighbour = useCallback((delta: number) => stepFrom(questions, currentIdRef.current, delta), [questions]);
  const priorAnswer = useCallback((id: string) => answers.current.get(id) ?? null, []);

  // ─── Acting on a question ──────────────────────────────────────────────────
  const updateDetail = useCallback((id: string, patch: (d: NexusQBQuestionDetail) => NexusQBQuestionDetail) => {
    const cached = details.current.get(id);
    if (!cached) return;
    const next = patch(cached);
    details.current.set(id, next);
    if (currentIdRef.current === id) setDetail(next);
  }, []);

  const submit = useCallback(
    async (id: string, answer: string) => {
      const token = await getTokenRef.current();
      const res = await fetch(`/api/question-bank/questions/${id}/attempt`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_answer: answer,
          mode: 'practice',
          classroom_id: classroomId,
          time_spent_seconds: Math.max(1, Math.round((Date.now() - openedAt.current) / 1000)),
        }),
      });
      if (!res.ok) throw new Error(`attempt ${res.status}`);
      const json = await res.json();
      const data = (json.data ?? {}) as { isCorrect?: boolean; attempt?: NexusQBStudentAttempt; correct_answer?: string };
      const isCorrect = !!data.isCorrect;
      const at = data.attempt?.created_at ?? new Date().toISOString();

      answers.current.set(id, { selected: answer, isCorrect });
      setQuestions((prev) =>
        prev.map((q) => (q.id === id ? { ...q, attempt_summary: patchAttemptSummary(q.attempt_summary, isCorrect, at) } : q)),
      );
      updateDetail(id, (d) => ({
        ...d,
        correct_answer: data.correct_answer ?? d.correct_answer,
        attempts: data.attempt ? [data.attempt, ...(d.attempts ?? [])] : d.attempts,
      }));
      return { isCorrect };
    },
    [classroomId, updateDetail],
  );

  const toggleStudied = useCallback(
    async (id: string) => {
      const token = await getTokenRef.current();
      const res = await fetch(`/api/question-bank/questions/${id}/study-mark`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ classroom_id: classroomId }),
      });
      if (!res.ok) throw new Error(`study-mark ${res.status}`);
      updateDetail(id, (d) => ({ ...d, is_studied: !d.is_studied }));
    },
    [classroomId, updateDetail],
  );

  const report = useCallback(
    async (id: string, reportType: string, description: string) => {
      const token = await getTokenRef.current();
      const res = await fetch(`/api/question-bank/questions/${id}/report`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_type: reportType, description: description || undefined, classroom_id: classroomId }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to submit report');
      }
    },
    [classroomId],
  );

  const numbers = useMemo(() => displayNumbers(questions, ctx), [questions, ctx]);
  const progress = useMemo(() => progressOf(questions), [questions]);
  const currentIndex = currentId ? questions.findIndex((q) => q.id === currentId) : -1;
  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  // A question already fetched shows in the same render that opens it. Waiting
  // for the effect above to copy it into state painted a skeleton for a frame
  // on every Next, which is exactly the flicker the prefetch exists to remove.
  const cachedCurrent = currentId ? details.current.get(currentId) ?? null : null;
  const detailOut = detail && detail.id === currentId ? detail : cachedCurrent;
  const retryDetail = useCallback(() => {
    const id = currentIdRef.current;
    if (!id) return;
    setDetailError(null);
    setDetailLoading(true);
    fetchDetail(id)
      .then((d) => {
        if (currentIdRef.current === id) setDetail(d);
      })
      .catch(() => {
        if (currentIdRef.current === id) setDetailError('This question did not load. Check your connection and try again.');
      })
      .finally(() => {
        if (currentIdRef.current === id) setDetailLoading(false);
      });
  }, [fetchDetail]);

  return {
    scope,
    questions,
    numbers,
    total,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    reload,
    search,
    progress,
    currentId,
    currentIndex,
    detail: detailOut,
    detailLoading: detailLoading && !cachedCurrent,
    detailError: cachedCurrent ? null : detailError,
    retryDetail,
    open,
    close,
    neighbour,
    priorAnswer,
    submit,
    toggleStudied,
    report,
  };
}
