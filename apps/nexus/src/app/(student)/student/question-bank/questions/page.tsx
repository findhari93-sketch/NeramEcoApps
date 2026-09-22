'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Box, EmptyState, Snackbar, useMediaQuery, useTheme } from '@neram/ui';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import { QB_EXAM_TYPE_LABELS, qbSectionLabel } from '@neram/database';
import type { QBExamTree, QBExamType, QBFilterState, NexusQBTopic, NexusQBTagNode } from '@neram/database';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthSWR } from '@/lib/nexus-swr';
import FilterDrawer from '@/components/question-bank/FilterDrawer';
import { countActiveFilters } from '@/components/question-bank/FilterChips';
import { expandCategories, categoryLabelMap } from '@/lib/qb-category-tree';
import { deserializeQBFilters } from '@/lib/qb-filter-url';
import { buildPracticeQuery, QID_PARAM } from '@/lib/qb-practice-url';
import { isQBExamType, qbExamPath, rememberQBExam } from '@/lib/qb-exam-routes';
import { usePracticeSession, type PracticeContext } from '@/components/question-bank/practice/usePracticeSession';
import { useTestSelection } from '@/components/question-bank/practice/useTestSelection';
import { usePracticeKeyboard } from '@/components/question-bank/practice/usePracticeKeyboard';
import { firstUnanswered } from '@/components/question-bank/practice/practice-logic';
import { usePracticeView } from '@/components/question-bank/practice/ViewToggle';
import PracticeWorkspace from '@/components/question-bank/practice/PracticeWorkspace';
import PracticeHeader from '@/components/question-bank/practice/PracticeHeader';
import PracticeBrowser from '@/components/question-bank/practice/PracticeBrowser';
import PracticeReader, { type ReaderAnswerHandle } from '@/components/question-bank/practice/PracticeReader';
import MobileReaderDialog from '@/components/question-bank/practice/MobileReaderDialog';
import JumpToQuestion from '@/components/question-bank/practice/JumpToQuestion';
import SelectionBar from '@/components/question-bank/practice/SelectionBar';
import ShortcutsDialog from '@/components/question-bank/practice/ShortcutsDialog';
import CreateTestDialog, { type CreateTestSettings } from '@/components/question-bank/practice/CreateTestDialog';

/** Stable identity, so a render with no counts does not re-trigger consumers. */
const EMPTY_COUNTS: Record<string, number> = {};

/**
 * Where Back goes when the link says, e.g. a paper's Practice button. Only a
 * path inside the student app: anything else would make this an open redirect.
 */
function safeBackPath(value: string | null): string | null {
  if (!value || !value.startsWith('/student/') || value.startsWith('//') || value.includes(':')) return null;
  return value;
}

/**
 * The student question bank's practice screen.
 *
 * Laptop: a header, then the paper as a grid or a list beside the question
 * being read, each scrolling on its own. Phone: the list, and a full-screen
 * reader over it with swipe, Prev / Next and a number grid to jump with.
 *
 * The open question lives in the address bar as `?qid=`, so a reload or a
 * shared link lands on it, and on a phone the Back button closes the reader.
 */
export default function QuestionListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const theme = useTheme();
  // noSsr: RoleGuard renders only a loader on the server, so there is no server
  // markup to mismatch, and this avoids a phone layout flashing on a laptop.
  const isTwoPane = useMediaQuery(theme.breakpoints.up('md'), { noSsr: true });
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });

  const { activeClassroom, getToken, loading: authLoading } = useNexusAuthContext();

  // ─── What is being practised, from the link ───────────────────────────────
  const exam = searchParams.get('exam') || null;
  const yearParam = searchParams.get('year');
  const year = yearParam ? Number(yearParam) : null;
  const sessionName = searchParams.get('session') || null;
  const shift = searchParams.get('shift') || null;
  const section = searchParams.get('section') || null;
  const paperSource = searchParams.get('paper_source') || null;
  const backParam = safeBackPath(searchParams.get('back'));

  const ctx: PracticeContext = useMemo(
    () => ({ exam, year, session: sessionName, shift, section, paperSource }),
    [exam, year, sessionName, shift, section, paperSource],
  );

  // Read once. A preset and a shared question are both one-time instructions.
  const initialParams = useRef(new URLSearchParams(searchParams.toString()));
  const presetId = useRef(initialParams.current.get('preset'));
  const deepLinkQid = useRef(initialParams.current.get(QID_PARAM));

  // ─── The three catalogue reads, on the shared SWR cache ───────────────────
  const scoped = (path: string, extra?: Record<string, string>) => {
    if (!activeClassroom) return null;
    const qs = new URLSearchParams({ classroom_id: activeClassroom.id, ...(extra || {}) });
    return `${path}?${qs.toString()}`;
  };
  const { data: examTreeRes } = useAuthSWR<{ data: QBExamTree }>(scoped('/api/question-bank/exam-tree'));
  const examTree = examTreeRes?.data ?? null;
  const { data: topicsRes } = useAuthSWR<{ data: NexusQBTopic[]; counts?: Record<string, number> }>(
    scoped('/api/question-bank/topics'),
  );
  const topics = useMemo(() => topicsRes?.data ?? [], [topicsRes]);
  const topicCounts = useMemo(() => new Map(Object.entries(topicsRes?.counts ?? {})), [topicsRes]);
  const { data: catCountsRes } = useAuthSWR<{ data: Record<string, number>; tree?: NexusQBTagNode[] }>(
    scoped('/api/question-bank/category-counts', {
      ...(exam ? { exam_type: exam } : {}),
      ...(year ? { year: String(year) } : {}),
      ...(sessionName ? { session: sessionName } : {}),
    }),
  );
  const categoryCounts = catCountsRes?.data ?? EMPTY_COUNTS;
  const categoryTree = useMemo(() => catCountsRes?.tree ?? [], [catCountsRes]);
  const categoryLabels = useMemo(() => categoryLabelMap(categoryTree), [categoryTree]);

  // ─── Filters and search ───────────────────────────────────────────────────
  const [filters, setFilters] = useState<QBFilterState>(() => deserializeQBFilters(searchParams));
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const [searchInput, setSearchInput] = useState(filters.search_text ?? '');
  const [filterOpen, setFilterOpen] = useState(false);

  // Typing -> filters, debounced to match the teacher page's 300ms.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => {
        const next = searchInput.trim() || undefined;
        // No-op guard, or this and the sync-back below feed each other forever.
        if (prev.search_text === next) return prev;
        return { ...prev, search_text: next };
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Filters -> input, for the drawer, a chip, or the reset button.
  useEffect(() => {
    setSearchInput((prev) => ((prev.trim() || undefined) === filters.search_text ? prev : (filters.search_text ?? '')));
  }, [filters.search_text]);

  /**
   * Write the drawer filters onto an outgoing request, parent categories
   * expanded. Shared by the list and "Select all", so the two cannot select
   * different sets. State stays COLLAPSED for the chips, the URL and presets.
   */
  const applyFilterParams = useCallback(
    (params: URLSearchParams, f: QBFilterState = filtersRef.current) => {
      if (f.categories?.length) params.set('categories', expandCategories(f.categories, categoryTree).join(','));
      if (f.difficulty?.length) params.set('difficulty', f.difficulty.join(','));
      if (f.question_format?.length) params.set('question_format', f.question_format.join(','));
      if (f.attempt_status && f.attempt_status !== 'all') params.set('attempt_status', f.attempt_status);
      if (f.search_text) params.set('search_text', f.search_text);
      if (f.topic_ids?.length) params.set('topic_ids', f.topic_ids.join(','));
      if (f.confidence_tier?.length) params.set('confidence_tier', f.confidence_tier.join(','));
      if (f.solution_filter === 'has_video') params.set('solution_filter', 'has_video');
      // The link's exam wins; the drawer only fills it in when the page is not scoped.
      if (f.exam_type && !params.has('exam_type')) params.set('exam_type', f.exam_type);
      if (f.exam_years?.length) params.set('years', f.exam_years.join(','));
    },
    [categoryTree],
  );

  // ─── The session ──────────────────────────────────────────────────────────
  const session = usePracticeSession({
    classroomId: activeClassroom?.id ?? null,
    authSettled: !authLoading,
    getToken,
    ctx,
    filters,
    applyFilterParams,
    layout: isTwoPane ? 'panes' : 'reader',
    initialQid: deepLinkQid.current,
  });
  const currentIdRef = useRef(session.currentId);
  currentIdRef.current = session.currentId;
  // Stable across renders (the session object is not), so memoised rows stay put.
  const { open: sessionOpen, close: sessionClose, neighbour } = session;

  // Load a saved preset once the classroom is known, then forget it: leaving it
  // in the link would reapply it over the student's edits on every reload.
  const presetDone = useRef(false);
  useEffect(() => {
    const id = presetId.current;
    if (!id || !activeClassroom || presetDone.current) return;
    presetDone.current = true;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`/api/question-bank/presets/${id}?classroom_id=${activeClassroom.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          const preset = json.data || json;
          if (preset?.filters) setFilters(preset.filters);
        }
      } catch (err) {
        console.error('Failed to load preset:', err);
      }
    })();
  }, [activeClassroom, getToken]);

  // A search scoped to one exam belongs to that exam's page: the sidebar
  // highlights it, and the QB tab returns to it.
  useEffect(() => {
    if (isQBExamType(exam)) rememberQBExam(exam);
  }, [exam]);

  // ─── The address bar ──────────────────────────────────────────────────────
  /**
   * Straight through the History API, patched by Next so useSearchParams
   * follows, without the server round trip router.replace costs. `null` state
   * on purpose: passing history.state (which carries Next's __NA marker) makes
   * Next skip the sync.
   */
  const writeUrl = useCallback(
    (mode: 'push' | 'replace', qid: string | null) => {
      const current = window.location.search.slice(1);
      const next = buildPracticeQuery(
        current,
        { filters: filtersRef.current, exam, year, session: sessionName, qid },
        presetDone.current ? ['preset'] : [],
      );
      if (mode === 'replace' && next === current) return;
      const url = `${window.location.pathname}${next ? `?${next}` : ''}`;
      if (mode === 'push') window.history.pushState(null, '', url);
      else window.history.replaceState(null, '', url);
    },
    [exam, year, sessionName],
  );

  // Every change of filters or question, as a replace. Opening the phone
  // reader pushes first (below), so this then finds nothing to change.
  useEffect(() => {
    writeUrl('replace', session.currentId);
  }, [filters, session.currentId, writeUrl]);

  /** True while the phone reader has a history entry of its own. */
  const readerPushed = useRef(false);

  // A shared link on a phone: put the list underneath it in history, so Back
  // from the question lands on the list and not on whatever came before.
  useEffect(() => {
    if (isTwoPane || !deepLinkQid.current || session.currentId !== deepLinkQid.current) return;
    deepLinkQid.current = null;
    writeUrl('replace', null);
    writeUrl('push', session.currentId);
    readerPushed.current = true;
  }, [isTwoPane, session.currentId, writeUrl]);

  // Back and Forward.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  useEffect(() => {
    const onPop = () => {
      const qid = new URLSearchParams(window.location.search).get(QID_PARAM);
      if (!qid) {
        readerPushed.current = false;
        sessionRef.current.close();
      } else if (qid !== currentIdRef.current) {
        sessionRef.current.open(qid);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // ─── Test selection ───────────────────────────────────────────────────────
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false,
    message: '',
    severity: 'success',
  });
  const notify = useCallback(
    (message: string, severity: 'success' | 'error' | 'info' = 'info') => setSnackbar({ open: true, message, severity }),
    [],
  );

  const fetchAllIds = useCallback(async () => {
    const token = await getToken();
    const params = new URLSearchParams();
    params.set('classroom_id', activeClassroom!.id);
    params.set('page', '1');
    // fields=id runs the same filters and returns only the ids, instead of
    // about 6.5MB of whole questions over a phone connection.
    params.set('page_size', '1000');
    params.set('fields', 'id');
    if (exam) params.set('exam_type', exam);
    if (year) params.set('year', String(year));
    if (sessionName) params.set('session', sessionName);
    if (shift) params.set('shift', shift);
    if (section) params.set('section', section);
    if (paperSource) params.set('paper_source', paperSource);
    applyFilterParams(params);
    const res = await fetch(`/api/question-bank/questions?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('select all failed');
    const json = await res.json();
    return ((json.data || json)?.question_ids ?? []) as string[];
  }, [getToken, activeClassroom, exam, year, sessionName, shift, section, paperSource, applyFilterParams]);

  const visibleIds = useCallback(() => sessionRef.current.questions.map((q) => q.id), []);
  const selection = useTestSelection({ fetchAllIds, visibleIds, onNotice: notify });
  const [createTestOpen, setCreateTestOpen] = useState(false);

  // ─── Language, view, labels ───────────────────────────────────────────────
  const [lang, setLang] = useState<'en' | 'hi'>('en');
  const showLang = useMemo(() => session.questions.some((q) => !!q.question_text_hi), [session.questions]);
  const gridAvailable = session.scope === 'paper' && !filters.search_text;
  const [view, setView] = usePracticeView('grid');

  const examLabel = isQBExamType(exam) ? QB_EXAM_TYPE_LABELS[exam as QBExamType] : exam;
  const paperLabel = [examLabel, year, sessionName].filter(Boolean).join(' ') || null;
  const title = (() => {
    if (session.scope === 'paper') return section ? `${paperLabel}, ${qbSectionLabel(section)}` : paperLabel!;
    if (session.scope === 'exam') {
      const base = sessionName ? `${examLabel} ${sessionName}` : `${examLabel}, all years`;
      return paperSource === 'recalled' ? `${base} (recalled)` : base;
    }
    return 'Question bank';
  })();
  const backHref = backParam ?? (isQBExamType(exam) ? qbExamPath('student', exam) : '/student/question-bank');
  const backLabel = backParam?.includes('/papers/')
    ? 'Back to the paper'
    : isQBExamType(exam)
      ? `Back to ${QB_EXAM_TYPE_LABELS[exam]}`
      : 'Back to the question bank';

  const currentNumber = session.currentId ? session.numbers.get(session.currentId) ?? null : null;
  const positionLabel =
    session.currentIndex < 0
      ? session.scope === 'paper'
        ? `${session.questions.length} questions`
        : `${session.total} questions`
      : session.scope === 'paper'
        ? `Q${currentNumber} of ${session.questions.length}`
        : `${session.currentIndex + 1} of ${session.total}`;

  const continueId = firstUnanswered(session.questions);
  const continueLabel =
    continueId && session.progress.answered > 0
      ? `Continue at Q${session.numbers.get(continueId)}`
      : continueId && session.scope === 'paper'
        ? 'Start the paper'
        : null;

  // ─── Moving around ────────────────────────────────────────────────────────
  /** Open a question from the list, the grid, Continue or a jump. */
  const openQuestion = useCallback(
    (id: string) => {
      if (isTwoPane) {
        sessionOpen(id);
        return;
      }
      // Phone: the reader gets its own history entry, once.
      if (!readerPushed.current) {
        writeUrl('push', id);
        readerPushed.current = true;
      }
      sessionOpen(id);
    },
    [isTwoPane, sessionOpen, writeUrl],
  );

  const step = useCallback(
    (delta: number) => {
      const id = neighbour(delta);
      if (id) sessionOpen(id);
    },
    [neighbour, sessionOpen],
  );
  const next = useCallback(() => step(1), [step]);
  const prev = useCallback(() => step(-1), [step]);

  const lastRead = useRef<string | null>(null);
  if (session.currentId) lastRead.current = session.currentId;

  const closeReader = useCallback(() => {
    if (readerPushed.current) {
      // The popstate handler closes the session, so Back and this button agree.
      window.history.back();
    } else {
      sessionClose();
    }
  }, [sessionClose]);

  /** After the reader slides away: show the list where the student stopped. */
  const revealLastRead = useCallback(() => {
    const id = lastRead.current;
    if (!id) return;
    const el = document.querySelector<HTMLElement>(`[data-qid="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.focus({ preventScroll: true });
  }, []);

  const goToNumber = useCallback(
    (n: number) => {
      const hit = session.questions.find((q) => session.numbers.get(q.id) === n);
      if (hit) openQuestion(hit.id);
    },
    [session.questions, session.numbers, openQuestion],
  );

  // ─── Jump grid, shortcuts ─────────────────────────────────────────────────
  const [jumpAnchor, setJumpAnchor] = useState<HTMLElement | null>(null);
  const [jumpOpen, setJumpOpen] = useState(false);
  const openJump = useCallback((anchor: HTMLElement) => {
    setJumpAnchor(anchor);
    setJumpOpen(true);
  }, []);
  const [helpOpen, setHelpOpen] = useState(false);
  const answerHandle = useRef<ReaderAnswerHandle | null>(null);

  usePracticeKeyboard(
    {
      next,
      prev,
      selectOption: (i) => answerHandle.current?.selectOption(i),
      primary: () => answerHandle.current?.primary(),
      goTo: goToNumber,
      help: () => setHelpOpen(true),
    },
    isTwoPane,
  );

  // ─── The filter drawer's live "Apply (N Qs)" count ────────────────────────
  const [draftFilters, setDraftFilters] = useState<QBFilterState | null>(null);
  const [matchCount, setMatchCount] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!filterOpen || !draftFilters || !activeClassroom) {
      setMatchCount(undefined);
      return;
    }
    let cancelled = false;
    // Debounced, one row per request: one cheap call per pause, not per tap.
    const timer = setTimeout(async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const params = new URLSearchParams();
        params.set('classroom_id', activeClassroom.id);
        params.set('page', '1');
        params.set('page_size', '1');
        params.set('mode', 'practice');
        if (exam) params.set('exam_type', exam);
        if (year) params.set('year', String(year));
        if (sessionName) params.set('session', sessionName);
        if (shift) params.set('shift', shift);
        if (section) params.set('section', section);
        if (paperSource) params.set('paper_source', paperSource);
        applyFilterParams(params, draftFilters);
        const res = await fetch(`/api/question-bank/questions?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (!cancelled) setMatchCount((json.data || json)?.total ?? undefined);
      } catch {
        if (!cancelled) setMatchCount(undefined);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filterOpen, draftFilters, activeClassroom, getToken, exam, year, sessionName, shift, section, paperSource, applyFilterParams]);

  // ─── Creating a test ──────────────────────────────────────────────────────
  const handleCreateTest = useCallback(
    async (settings: CreateTestSettings) => {
      if (!activeClassroom || selection.ids.size === 0) return;
      try {
        const token = await getToken();
        const res = await fetch('/api/question-bank/custom-tests', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: settings.title,
            question_ids: Array.from(selection.ids),
            timer_type: settings.timerType,
            duration_minutes: settings.timerType === 'full' ? settings.durationMinutes : undefined,
            per_question_seconds: settings.timerType === 'per_question' ? settings.perQuestionSeconds : undefined,
            classroom_id: activeClassroom.id,
            // What this paper was built from, so a teacher can later see how a
            // student went looking. Categories stay COLLAPSED, as the chips,
            // the URL and presets store them.
            source_filters: {
              exam_type: exam,
              year,
              session: sessionName,
              categories: filters.categories,
              difficulty: filters.difficulty,
              question_format: filters.question_format,
              topic_ids: filters.topic_ids,
              attempt_status: filters.attempt_status,
              search_text: filters.search_text,
              selection: selection.viaSelectAll ? 'select_all' : 'manual',
              matched_count: session.total,
            },
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to create test');
        }
        notify('Practice test created', 'success');
        setCreateTestOpen(false);
        selection.exit();
        router.push('/student/tests');
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Failed to create test', 'error');
        throw err;
      }
    },
    [activeClassroom, selection, getToken, exam, year, sessionName, filters, session.total, notify, router],
  );

  const startSelection = useCallback(() => {
    selection.start();
    notify('Tap questions to add them to your test', 'info');
  }, [selection, notify]);

  const activeFilterCount = countActiveFilters(filters);

  // ─── Render ───────────────────────────────────────────────────────────────
  if (!authLoading && !activeClassroom) {
    return (
      <Box sx={{ px: { xs: 2, sm: 3 }, pt: { xs: 2, md: 3 } }}>
        <EmptyState
          icon={<QuizOutlinedIcon sx={{ fontSize: 48, color: 'text.secondary' }} />}
          title="No classroom yet"
          description="The Question Bank opens once you are enrolled in a classroom."
        />
      </Box>
    );
  }

  const readerProps = {
    questionId: session.currentId,
    detail: session.detail,
    detailLoading: session.detailLoading,
    detailError: session.detailError,
    positionLabel,
    hasPrev: !!neighbour(-1),
    hasNext: !!neighbour(1),
    onPrev: prev,
    onNext: next,
    onJump: openJump,
    lang,
    onLangChange: setLang,
    showLang,
    showSourceBadges: session.scope !== 'paper',
    priorAnswer: session.priorAnswer,
    onSubmit: session.submit,
    onStudyToggle: (id: string) => {
      session.toggleStudied(id).catch(() => notify('Could not update the studied mark', 'error'));
    },
    onReport: session.report,
    onRetryLoad: session.retryDetail,
  };

  const header = (
    <PracticeHeader
      variant={isTwoPane ? 'desktop' : 'mobile'}
      title={title}
      backHref={backHref}
      backLabel={backLabel}
      scope={session.scope}
      progress={session.progress}
      shown={session.questions.length}
      total={session.total}
      loading={session.loading}
      continueLabel={continueLabel}
      onContinue={() => continueId && openQuestion(continueId)}
      lang={lang}
      onLangChange={setLang}
      // On a laptop the reader carries the language switch, beside the text it changes.
      showLang={showLang && !isTwoPane}
      selecting={selection.active}
      onCreateTest={startSelection}
      onHelp={isTwoPane ? () => setHelpOpen(true) : undefined}
    />
  );

  const browser = (
    <PracticeBrowser
      variant={isTwoPane ? 'rail' : 'page'}
      session={session}
      view={view}
      onViewChange={setView}
      gridAvailable={gridAvailable}
      searchInput={searchInput}
      onSearchInput={setSearchInput}
      filters={filters}
      onFiltersChange={setFilters}
      onOpenDrawer={() => setFilterOpen(true)}
      activeFilterCount={activeFilterCount}
      categoryLabels={categoryLabels}
      lang={lang}
      onOpen={openQuestion}
      selection={selection}
      activeId={isTwoPane ? session.currentId : null}
      footer={
        isTwoPane && selection.active ? (
          <SelectionBar
            variant="rail"
            count={selection.ids.size}
            onSelectAll={selection.selectAll}
            onCancel={selection.exit}
            onCreate={() => setCreateTestOpen(true)}
          />
        ) : undefined
      }
    />
  );

  const overlays = (
    <>
      <JumpToQuestion
        variant={isTwoPane ? 'popover' : 'sheet'}
        anchor={jumpAnchor}
        open={jumpOpen}
        onClose={() => setJumpOpen(false)}
        questions={session.questions}
        numbers={session.numbers}
        currentId={session.currentId}
        onPick={sessionOpen}
      />
      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <CreateTestDialog
        open={createTestOpen}
        onClose={() => setCreateTestOpen(false)}
        selectedCount={selection.ids.size}
        paperLabel={paperLabel}
        fullScreen={isPhone}
        onCreate={handleCreateTest}
      />
      <FilterDrawer
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onApply={setFilters}
        topics={topics}
        topicCounts={topicCounts}
        categoryCounts={categoryCounts}
        categoryTree={categoryTree}
        examTree={examTree}
        matchCount={matchCount}
        onDraftChange={setDraftFilters}
        contextLabel={paperLabel ?? undefined}
      />
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: 140, md: 24 } }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );

  if (isTwoPane) {
    return (
      <>
        <PracticeWorkspace
          header={header}
          rail={browser}
          reader={<PracticeReader variant="pane" {...readerProps} answerHandle={answerHandle} />}
        />
        {overlays}
      </>
    );
  }

  return (
    // Full bleed dropped the layout's padding for the laptop panes; a phone
    // page puts it back, plus room for the selection bar when it is up.
    <Box sx={{ px: { xs: 2, sm: 3 }, pt: 2, pb: selection.active ? 12 : 2 }}>
      {header}
      {browser}
      <MobileReaderDialog
        {...readerProps}
        open={!!session.currentId && !selection.active}
        onClose={closeReader}
        onExited={revealLastRead}
      />
      {selection.active && (
        <SelectionBar
          variant="fixed"
          count={selection.ids.size}
          onSelectAll={selection.selectAll}
          onCancel={selection.exit}
          onCreate={() => setCreateTestOpen(true)}
        />
      )}
      {overlays}
    </Box>
  );
}
