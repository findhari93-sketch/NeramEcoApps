'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  Typography,
  Skeleton,
  Paper,
  IconButton,
  Button,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  RadioGroup,
  FormControlLabel,
  Radio,
  Snackbar,
  Alert,
  useMediaQuery,
  useTheme,
  EmptyState,
} from '@neram/ui';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthSWR } from '@/lib/nexus-swr';
import TopFilterBar from '@/components/question-bank/TopFilterBar';
import QBSearchStatus, { type QBMatchKind } from '@/components/question-bank/QBSearchStatus';
import InlineQuestionCard from '@/components/question-bank/InlineQuestionCard';
import FilterDrawer from '@/components/question-bank/FilterDrawer';
import { countActiveFilters } from '@/components/question-bank/FilterChips';
import SwipeableQuestionCard from '@/components/question-bank/SwipeableQuestionCard';
import QuestionDetail from '@/components/question-bank/QuestionDetail';
import { SHELL_CHROME } from '@/lib/shell-chrome';
import { expandCategories, categoryLabelMap } from '@/lib/qb-category-tree';
import type {
  QBExamTree,
  QBFilterState,
  NexusQBQuestionListItem,
  NexusQBQuestionDetail,
  NexusQBTopic,
  NexusQBTagNode,
  QBDifficulty,
  QBQuestionFormat,
} from '@neram/database';
import { MAX_STUDENT_TEST_QUESTIONS } from '@/lib/test-limits';

/** Stable identity, so a render with no counts does not re-trigger consumers. */
const EMPTY_COUNTS: Record<string, number> = {};

/** Where the detail pane pins, clearing the sticky filter bar beside it. */
const DETAIL_PANE_TOP = 8;

const PAGE_SIZE = 20;

function serializeFilters(filters: QBFilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.categories?.length) params.set('cat', filters.categories.join(','));
  if (filters.difficulty?.length) params.set('diff', filters.difficulty.join(','));
  if (filters.question_format?.length) params.set('fmt', filters.question_format.join(','));
  if (filters.attempt_status && filters.attempt_status !== 'all') params.set('status', filters.attempt_status);
  if (filters.search_text) params.set('q', filters.search_text);
  if (filters.topic_ids?.length) params.set('topics', filters.topic_ids.join(','));
  return params;
}

function deserializeFilters(params: URLSearchParams): QBFilterState {
  const filters: QBFilterState = {};
  const cat = params.get('cat');
  if (cat) filters.categories = cat.split(',');
  const diff = params.get('diff');
  if (diff) filters.difficulty = diff.split(',') as QBDifficulty[];
  const fmt = params.get('fmt');
  if (fmt) filters.question_format = fmt.split(',') as QBQuestionFormat[];
  const status = params.get('status');
  if (status) filters.attempt_status = status as QBFilterState['attempt_status'];
  const q = params.get('q');
  if (q) filters.search_text = q;
  const topics = params.get('topics');
  if (topics) filters.topic_ids = topics.split(',');
  return filters;
}

export default function QuestionListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  /**
   * Two panes, or one.
   *
   * At `md` and up a single column of 90px cards was being stretched across
   * 1116px, so the stem clamped to two lines with most of the row empty. Above
   * that width the list becomes a column and the question opens beside it. Below
   * it nothing changes: one column, swipe actions, expansion in place. That is
   * the majority of these students and the layout already suits them.
   */
  const isTwoPane = useMediaQuery(theme.breakpoints.up('md'));

  const { activeClassroom, getToken, loading: authLoading } = useNexusAuthContext();

  // Exam context from URL params
  const [selectedExam, setSelectedExam] = useState<string | null>(
    searchParams.get('exam') || null,
  );
  const [selectedYear, setSelectedYear] = useState<number | null>(
    searchParams.get('year') ? Number(searchParams.get('year')) : null,
  );
  const [selectedSession, setSelectedSession] = useState<string | null>(
    searchParams.get('session') || null,
  );
  /**
   * The paper detail screen has always written these two into the practice link.
   * shift was read by nobody, so a paper split into a forenoon and an afternoon
   * sitting practised both at once; section is what the new paper breakdown uses
   * to open one part of a paper.
   */
  const [selectedShift] = useState<string | null>(searchParams.get('shift') || null);
  const [selectedSection] = useState<string | null>(searchParams.get('section') || null);

  /**
   * The three catalogue reads, on the shared SWR cache.
   *
   * These were hand-rolled fetch-in-useEffect, each awaiting its own token
   * first, so nothing they loaded was deduped or cached and coming back to this
   * page always refetched all of it from cold. The exam tree is the expensive
   * one: it reads the whole sources table and the whole active-question id list.
   * A null key holds the request until the classroom resolves, which is the
   * pattern documented on the QB landing page.
   */
  const scoped = (path: string, extra?: Record<string, string>) => {
    if (!activeClassroom) return null;
    const qs = new URLSearchParams({ classroom_id: activeClassroom.id, ...(extra || {}) });
    return `${path}?${qs.toString()}`;
  };

  const { data: examTreeRes, isLoading: examTreeLoading } =
    useAuthSWR<{ data: QBExamTree }>(scoped('/api/question-bank/exam-tree'));
  const examTree = examTreeRes?.data ?? null;

  const { data: topicsRes } = useAuthSWR<{
    data: NexusQBTopic[];
    counts?: Record<string, number>;
  }>(scoped('/api/question-bank/topics'));
  const topics = useMemo(() => topicsRes?.data ?? [], [topicsRes]);
  const topicCounts = useMemo(
    () => new Map(Object.entries(topicsRes?.counts ?? {})),
    [topicsRes],
  );

  const { data: catCountsRes } = useAuthSWR<{
    data: Record<string, number>;
    tree?: NexusQBTagNode[];
  }>(
    scoped('/api/question-bank/category-counts', {
      ...(selectedExam ? { exam_type: selectedExam } : {}),
      ...(selectedYear ? { year: String(selectedYear) } : {}),
      ...(selectedSession ? { session: selectedSession } : {}),
    }),
  );
  const categoryCounts = catCountsRes?.data ?? EMPTY_COUNTS;
  const categoryTree = useMemo(() => catCountsRes?.tree ?? [], [catCountsRes]);

  // Filters (categories, difficulty, format, status, search, topics)
  const [filters, setFilters] = useState<QBFilterState>(() =>
    deserializeFilters(searchParams),
  );

  // Question list state
  const [questions, setQuestions] = useState<NexusQBQuestionListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  // Students had no visible search box at all: search lived inside the filter
  // drawer and only ran on Apply. This is the always-on bar; filters.search_text
  // stays the single source of truth so the drawer and the ?q= URL still work.
  const [searchInput, setSearchInput] = useState(filters.search_text ?? '');
  const [matchKind, setMatchKind] = useState<QBMatchKind | null>(null);
  const [didYouMean, setDidYouMean] = useState<string | null>(null);
  const [matchedTerms, setMatchedTerms] = useState<string[]>([]);

  // Typing -> filters, debounced to match the teacher page's 300ms.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => {
        const next = searchInput.trim() || undefined;
        // No-op guard. Without it this effect and the sync-back below feed
        // each other and the page re-fetches forever.
        if (prev.search_text === next) return prev;
        return { ...prev, search_text: next };
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Filters -> input, for the drawer, a category chip, or the back button.
  useEffect(() => {
    setSearchInput((prev) =>
      (prev.trim() || undefined) === filters.search_text ? prev : (filters.search_text ?? ''),
    );
  }, [filters.search_text]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  // Inline expansion state
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<NexusQBQuestionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Selection mode state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  /**
   * Whether this selection came from "select all matching" rather than taps.
   * Stored on the test as part of source_filters, because it changes what the
   * paper means: a sweep of the filters is a student exploring, the same size
   * assembled by hand is a student working through something specific.
   */
  const [selectedViaSelectAll, setSelectedViaSelectAll] = useState(false);
  const [createTestOpen, setCreateTestOpen] = useState(false);

  // Create test dialog state
  const [testTitle, setTestTitle] = useState('');
  /** Set once the student edits the name, which stops the suggestion overwriting it. */
  const [titleTouched, setTitleTouched] = useState(false);
  const [timerType, setTimerType] = useState<'none' | 'full' | 'per_question'>('none');
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [perQuestionSeconds, setPerQuestionSeconds] = useState<number>(120);
  const [creatingTest, setCreatingTest] = useState(false);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // Language toggle
  const [lang, setLang] = useState<'en' | 'hi'>('en');


  // Context detection: Year Paper view vs Full Bank view
  const isYearPaperView = !!(selectedExam || selectedYear || selectedSession);

  // Build context label
  const contextLabelParts: string[] = [];
  if (selectedExam) contextLabelParts.push(selectedExam === 'JEE_PAPER_2' ? 'JEE Paper 2' : selectedExam);
  if (selectedYear) contextLabelParts.push(String(selectedYear));
  if (selectedSession) contextLabelParts.push(selectedSession);
  const contextLabel = contextLabelParts.length > 0 ? contextLabelParts.join(' ') : undefined;

  const activeFilterCount = countActiveFilters(filters);

  // ─── Effects ──────────────────────────────────────────────────────────────

  // Load preset if specified
  useEffect(() => {
    const presetId = searchParams.get('preset');
    if (presetId && activeClassroom) {
      loadPreset(presetId);
    }
  }, [searchParams, activeClassroom]);

  // Fetch questions when filters or exam context change
  useEffect(() => {
    if (!activeClassroom) {
      // Every fetch effect on this page returns early without a classroom, and
      // `loading` starts true, so a student who has none sat on skeletons for
      // ever. Once auth has settled and there is still no classroom, that is an
      // answer, not a wait.
      if (!authLoading) setLoading(false);
      return;
    }
    fetchQuestions(1);
  }, [activeClassroom, authLoading, filters, selectedExam, selectedYear, selectedSession]);

  // Sync filters + exam context to URL
  useEffect(() => {
    const params = serializeFilters(filters);
    if (selectedExam) params.set('exam', selectedExam);
    if (selectedYear) params.set('year', String(selectedYear));
    if (selectedSession) params.set('session', selectedSession);
    const qs = params.toString();
    const current = searchParams.toString();
    if (qs !== current) {
      router.replace(`/student/question-bank/questions${qs ? '?' + qs : ''}`, {
        scroll: false,
      });
    }
  }, [filters, selectedExam, selectedYear, selectedSession]);

  // Total pages for pagination
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Auto-suggest the test title.
  //
  // Recomputed from the live selection every time the dialog opens, and left
  // alone the moment the student types. The old version ran once per mount with
  // a `!testTitle` guard and no selection in its deps, so a title minted while
  // nothing was selected stuck: that is where "Practice - 0 questions" on a
  // 544-question paper came from.
  useEffect(() => {
    if (!createTestOpen || titleTouched) return;
    const parts: string[] = [];
    if (selectedExam) parts.push(selectedExam === 'JEE_PAPER_2' ? 'JEE Paper 2' : selectedExam);
    if (selectedYear) parts.push(String(selectedYear));
    parts.push('Practice');
    const n = selectedQuestionIds.size;
    parts.push(`- ${n} question${n === 1 ? '' : 's'}`);
    setTestTitle(parts.join(' '));
  }, [createTestOpen, titleTouched, selectedExam, selectedYear, selectedQuestionIds]);

  // ─── Fetch functions ──────────────────────────────────────────────────────




  async function loadPreset(presetId: string) {
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/question-bank/presets/${presetId}?classroom_id=${activeClassroom!.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const json = await res.json();
        const preset = json.data || json;
        if (preset?.filters) {
          setFilters(preset.filters);
        }
      }
    } catch (err) {
      console.error('Failed to load preset:', err);
    }
  }

  /**
   * Write the drawer filters onto an outgoing request.
   *
   * Shared by fetchQuestions and selectAllFiltered: if only one of them expanded
   * parent categories, "Select all" would silently select a different set than
   * the list on screen.
   *
   * Filter state is kept COLLAPSED (a parent slug stands in for all its
   * children) so the chip row, the URL and saved presets stay compact. The leaf
   * expansion happens here, at the network boundary. The server repeats it
   * defensively for hand-typed URLs.
   */
  const applyFilterParams = useCallback(
    (params: URLSearchParams, f: QBFilterState = filters) => {
      if (f.categories?.length) {
        params.set('categories', expandCategories(f.categories, categoryTree).join(','));
      }
      if (f.difficulty?.length) params.set('difficulty', f.difficulty.join(','));
      if (f.question_format?.length) params.set('question_format', f.question_format.join(','));
      if (f.attempt_status && f.attempt_status !== 'all') params.set('attempt_status', f.attempt_status);
      if (f.search_text) params.set('search_text', f.search_text);
      if (f.topic_ids?.length) params.set('topic_ids', f.topic_ids.join(','));
      if (f.confidence_tier?.length) params.set('confidence_tier', f.confidence_tier.join(','));
      // Exam context from the URL wins; the drawer only fills these in when the
      // page is not already scoped to a specific paper.
      if (f.exam_type && !params.has('exam_type')) params.set('exam_type', f.exam_type);
      if (f.exam_years?.length) params.set('years', f.exam_years.join(','));
    },
    [filters, categoryTree],
  );

  /** Resolves parent slugs, which QB_CATEGORY_LABELS cannot. */
  const categoryLabels = useMemo(() => categoryLabelMap(categoryTree), [categoryTree]);

  /**
   * Live "Apply (N Qs)" count for the drawer.
   *
   * Debounced and fetched with page_size=1, so it costs one cheap invocation per
   * pause in editing rather than one per tap, and only while the drawer is open.
   */
  const [draftFilters, setDraftFilters] = useState<QBFilterState | null>(null);
  const [matchCount, setMatchCount] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!filterOpen || !draftFilters || !activeClassroom) {
      setMatchCount(undefined);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const params = new URLSearchParams();
        params.set('classroom_id', activeClassroom.id);
        params.set('page', '1');
        params.set('page_size', '1');
        params.set('mode', 'practice');
        if (selectedExam) params.set('exam_type', selectedExam);
        if (selectedYear) params.set('year', String(selectedYear));
        if (selectedSession) params.set('session', selectedSession);
        applyFilterParams(params, draftFilters);

        const res = await fetch(`/api/question-bank/questions?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const json = await res.json();
        const payload = json.data || json;
        if (!cancelled) setMatchCount(payload?.total ?? undefined);
      } catch {
        if (!cancelled) setMatchCount(undefined);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    filterOpen,
    draftFilters,
    activeClassroom,
    getToken,
    selectedExam,
    selectedYear,
    selectedSession,
    applyFilterParams,
  ]);

  async function fetchQuestions(pageNum: number) {
    setLoading(true);
    // The list used to be emptied here, before the request went out. That is why
    // the bar above it read "Showing 0 of 0 questions" over a skeleton on every
    // load and every filter tweak: it was reporting the list it had just been
    // handed, and the list had just been thrown away. Keep the previous page
    // until the next one lands; the skeleton already says work is happening.
    setFetchError(null);

    try {
      const token = await getToken();
      const params = new URLSearchParams();
      params.set('classroom_id', activeClassroom!.id);
      params.set('page', String(pageNum));
      params.set('page_size', String(PAGE_SIZE));
      params.set('mode', 'practice');

      // Exam context filters
      if (selectedExam) params.set('exam_type', selectedExam);
      if (selectedYear) params.set('year', String(selectedYear));
      if (selectedSession) params.set('session', selectedSession);
      if (selectedShift) params.set('shift', selectedShift);
      if (selectedSection) params.set('section', selectedSection);

      // Filter drawer filters
      applyFilterParams(params);

      const res = await fetch(`/api/question-bank/questions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to fetch questions');


      const json = await res.json();
      const payload = json.data || json;
      const items: NexusQBQuestionListItem[] = payload?.questions || (Array.isArray(payload) ? payload : []);
      const total: number = payload?.total ?? json.total_count ?? items.length;

      setQuestions(items);
      setTotalCount(total);
      setMatchKind(payload?.search?.match_kind ?? null);
      setDidYouMean(payload?.search?.did_you_mean ?? null);
      setMatchedTerms(payload?.search?.matched_terms ?? []);
      setPage(pageNum);
    } catch (err) {
      // A failed list request used to be a console line and nothing else, so the
      // screen sat on an empty list that looked like a legitimate no-results.
      console.error('Failed to fetch questions:', err);
      setQuestions([]);
      setFetchError('Could not load questions. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  function goToPage(pageNum: number) {
    setExpandedQuestionId(null);
    setExpandedDetail(null);
    fetchQuestions(pageNum);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ─── Question handlers ────────────────────────────────────────────────────

  async function handleExpandQuestion(questionId: string) {
    // In selection mode, toggle selection instead of expanding
    if (selectionMode) {
      toggleQuestionSelection(questionId);
      return;
    }

    if (expandedQuestionId === questionId) {
      setExpandedQuestionId(null);
      setExpandedDetail(null);
      return;
    }

    setExpandedQuestionId(questionId);
    setExpandedDetail(null);
    setDetailLoading(true);

    try {
      const token = await getToken();
      const res = await fetch(
        `/api/question-bank/questions/${questionId}?classroom_id=${activeClassroom!.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const json = await res.json();
        setExpandedDetail(json.data || json);
      }
    } catch (err) {
      console.error('Failed to fetch question detail:', err);
    } finally {
      setDetailLoading(false);
    }
  }

  /** Where the open question sits in the list, or -1. */
  const detailIndex = expandedQuestionId
    ? questions.findIndex((q) => q.id === expandedQuestionId)
    : -1;

  /**
   * Move the detail pane one question along the list.
   *
   * Deliberately does not page: the arrows walk what is on screen, and running
   * off the end of a page is a pagination decision the student should make
   * themselves rather than have the arrows make silently.
   */
  function stepQuestion(delta: number) {
    if (detailIndex < 0) return;
    const next = questions[detailIndex + delta];
    if (next) void handleExpandQuestion(next.id);
  }

  async function handleInlineSubmit(answer: string) {
    if (!expandedQuestionId || !activeClassroom) return;
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/question-bank/questions/${expandedQuestionId}/attempt`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            selected_answer: answer,
            mode: 'practice',
            classroom_id: activeClassroom.id,
          }),
        },
      );
      if (res.ok) {
        const json = await res.json();
        setExpandedDetail((prev) => prev ? { ...prev, ...json.data } : prev);
      }
    } catch (err) {
      console.error('Failed to submit answer:', err);
    }
  }

  async function handleReport(questionId: string, reportType: string, description: string) {
    if (!activeClassroom) return;
    try {
      const token = await getToken();
      const res = await fetch(`/api/question-bank/questions/${questionId}/report`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          report_type: reportType,
          description: description || undefined,
          classroom_id: activeClassroom.id,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to submit report');
      }
    } catch (err) {
      console.error('Failed to submit report:', err);
      throw err;
    }
  }

  async function handleStudyToggle() {
    if (!expandedQuestionId || !activeClassroom) return;
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/question-bank/questions/${expandedQuestionId}/study-mark`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ classroom_id: activeClassroom.id }),
        },
      );
      if (res.ok) {
        setExpandedDetail((prev) =>
          prev ? { ...prev, is_studied: !prev.is_studied } : prev,
        );
      }
    } catch (err) {
      console.error('Failed to toggle study mark:', err);
    }
  }

  async function handleSwipeStudy(questionId: string) {
    if (!activeClassroom) return;
    try {
      const token = await getToken();
      await fetch(`/api/question-bank/questions/${questionId}/study-mark`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ classroom_id: activeClassroom.id }),
      });
      setSnackbar({ open: true, message: 'Marked as studied', severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: 'Failed to mark as studied', severity: 'error' });
    }
  }

  // ─── Filter handlers ─────────────────────────────────────────────────────

  function handleFilterApply(newFilters: QBFilterState) {
    setFilters(newFilters);
  }

  function handleFilterRemove(key: keyof QBFilterState, value?: string | number) {
    setFilters((prev: QBFilterState) => {
      const next = { ...prev };
      if (key === 'exam_relevance' || key === 'attempt_status' || key === 'search_text') {
        delete next[key];
      } else {
        const arr = next[key] as (string | number)[] | undefined;
        if (arr && value !== undefined) {
          const filtered = arr.filter((v) => v !== value);
          if (filtered.length === 0) {
            delete next[key];
          } else {
            (next as Record<string, unknown>)[key as string] = filtered;
          }
        } else {
          delete next[key];
        }
      }
      return next;
    });
  }

  function handleClearFilters() {
    setFilters({});
  }

  // ─── Selection mode helpers ───────────────────────────────────────────────

  function toggleQuestionSelection(questionId: string) {
    const alreadyOn = selectedQuestionIds.has(questionId);
    // Read the size outside the updater: a setState call inside one is a side
    // effect React is entitled to run twice.
    if (!alreadyOn && selectedQuestionIds.size >= MAX_STUDENT_TEST_QUESTIONS) {
      setSnackbar({
        open: true,
        message: `A practice test tops out at ${MAX_STUDENT_TEST_QUESTIONS} questions.`,
        severity: 'info',
      });
      return;
    }
    // Any hand-toggle means this is no longer a clean sweep of the filters, so
    // the paper stops claiming it was. A 50-question paper built by "select all"
    // is a student exploring; the same size picked one by one is a student
    // working through something, and the teacher's read of the two differs.
    setSelectedViaSelectAll(false);
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      if (alreadyOn) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  }

  async function selectAllFiltered() {
    // Fetch ALL question IDs matching current filters (not just current page)
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      params.set('classroom_id', activeClassroom!.id);
      params.set('page', '1');
      // This asked for a thousand whole questions and then read nothing but the
      // id off each one: roughly 6.5MB of JSON over a phone connection to build
      // a list of UUIDs. fields=id runs the same filters and returns the ids.
      params.set('page_size', '1000');
      params.set('fields', 'id');
      if (selectedExam) params.set('exam_type', selectedExam);
      if (selectedYear) params.set('year', String(selectedYear));
      if (selectedSession) params.set('session', selectedSession);
      if (selectedShift) params.set('shift', selectedShift);
      if (selectedSection) params.set('section', selectedSection);
      applyFilterParams(params);

      const res = await fetch(`/api/question-bank/questions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        const payload = json.data || json;
        const ids: string[] = payload?.question_ids ?? [];
        // Capped, and said out loud. Selecting every one of 544 matches and then
        // being refused at Create is worse than being told here how many were
        // taken. The server enforces the same ceiling either way.
        const capped = ids.slice(0, MAX_STUDENT_TEST_QUESTIONS);
        setSelectedViaSelectAll(true);
        setSelectedQuestionIds(new Set(capped));
        if (ids.length > capped.length) {
          setSnackbar({
            open: true,
            message: `Selected the first ${capped.length} of ${ids.length} matches. A practice test tops out at ${MAX_STUDENT_TEST_QUESTIONS}.`,
            severity: 'info',
          });
        }
      }
    } catch {
      // Fallback: select only current page. NOT recorded as a clean sweep, since
      // it is a page rather than the filter set the student asked for.
      setSelectedViaSelectAll(false);
      setSelectedQuestionIds(new Set(questions.slice(0, MAX_STUDENT_TEST_QUESTIONS).map((q) => q.id)));
    }
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedQuestionIds(new Set());
    setSelectedViaSelectAll(false);
  }

  // ─── Create test handler ─────────────────────────────────────────────────

  async function handleCreateTest() {
    if (!activeClassroom || selectedQuestionIds.size === 0) return;

    setCreatingTest(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/question-bank/custom-tests', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: testTitle.trim(),
          question_ids: Array.from(selectedQuestionIds),
          timer_type: timerType,
          duration_minutes: timerType === 'full' ? durationMinutes : undefined,
          per_question_seconds: timerType === 'per_question' ? perQuestionSeconds : undefined,
          classroom_id: activeClassroom.id,
          // What this paper was built from. Sent so a teacher can later see how a
          // student went looking, which is the signal the Student tests tab was
          // missing entirely: every paper created before this shipped stores
          // nothing but a title, and the titles collide.
          //
          // Categories are sent COLLAPSED (a parent slug standing in for its
          // children), matching what the chip row, the URL and saved presets
          // store. The expanded form is a network detail, and expanding it here
          // would make a teacher read twenty slugs where the student picked one.
          source_filters: {
            exam_type: selectedExam,
            year: selectedYear,
            session: selectedSession,
            categories: filters.categories,
            difficulty: filters.difficulty,
            question_format: filters.question_format,
            topic_ids: filters.topic_ids,
            attempt_status: filters.attempt_status,
            search_text: filters.search_text,
            selection: selectedViaSelectAll ? 'select_all' : 'manual',
            matched_count: totalCount,
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to create test');
      }

      setSnackbar({ open: true, message: 'Custom test created successfully!', severity: 'success' });
      setCreateTestOpen(false);
      exitSelectionMode();
      setTestTitle('');
      setTitleTouched(false);
      setTimerType('none');
      setDurationMinutes(60);
      setPerQuestionSeconds(120);
      router.push('/student/tests');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create test';
      setSnackbar({ open: true, message, severity: 'error' });
    } finally {
      setCreatingTest(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  /**
   * One left edge for the whole page.
   *
   * The back button, the search field and the list each had their own padding
   * (0.5/2, a flat 2, and 0.5/2), so the three rows started at three different
   * x positions on a laptop. One value, used by all of them.
   */
  const GUTTER = { xs: 1, md: 2 };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        // height:'100%' used to resolve against an auto-height Container, so
        // flex:1 on the list never got a bounded height and its overflowY never
        // became a real scroll box. Rather than replace one guess with another,
        // the page now just flows: the list is as long as it is, and the detail
        // pane sticks (see DETAIL_PANE_TOP below). Pinning the whole page to the
        // viewport would need the shell's padding as well as its chrome, and
        // SHELL_CHROME is documented as the full-bleed number, which this route
        // is not.
        minHeight: 0,
      }}
    >
      {/* Back button */}
      <Box sx={{ px: GUTTER, pt: 0.5 }}>
        <Button
          size="small"
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push('/student/question-bank')}
          sx={{
            textTransform: 'none',
            color: 'text.secondary',
            fontWeight: 500,
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          {contextLabel || 'Question Bank'}
        </Button>
      </Box>

      {/* Search: always visible. It used to be hidden inside the filter drawer,
          so most students never found it. */}
      <Box sx={{ px: GUTTER, pb: 1 }}>
        <TextField
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search questions, formulas, topics..."
          size="small"
          fullWidth
          inputProps={{ 'aria-label': 'Search questions' }}
          InputProps={{
            startAdornment: (
              <SearchOutlinedIcon
                sx={{ color: 'text.secondary', mr: 1 }}
                fontSize="small"
                aria-hidden="true"
              />
            ),
            endAdornment: searchInput ? (
              <IconButton
                size="small"
                aria-label="Clear search"
                onClick={() => setSearchInput('')}
                sx={{ minWidth: 44, minHeight: 44 }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            ) : null,
          }}
          sx={{
            // 16px keeps iOS from zooming the viewport on focus, and 48px is
            // the Material 3 minimum for a primary touch target.
            '& .MuiInputBase-input': { fontSize: 16 },
            '& .MuiInputBase-root': { minHeight: 48, borderRadius: 2 },
          }}
        />
      </Box>

      <Box sx={{ px: GUTTER }}>
        <QBSearchStatus
          query={filters.search_text ?? ''}
          matchKind={matchKind}
          didYouMean={didYouMean}
          total={totalCount}
          loading={loading}
          onUseSuggestion={(term) => setSearchInput(term)}
          onClear={() => setSearchInput('')}
        />
      </Box>

      {/* Top Filter Bar (sticky) */}
      <TopFilterBar
        filters={filters}
        loading={loading}
        onFilterChange={(newFilters) => setFilters(newFilters)}
        onOpenDrawer={() => setFilterOpen(true)}
        activeFilterCount={activeFilterCount}
        totalCount={totalCount}
        filteredCount={questions.length}
        selectionMode={selectionMode}
        selectedCount={selectedQuestionIds.size}
        onToggleSelectionMode={() => {
          if (selectionMode) {
            exitSelectionMode();
          } else {
            setSelectionMode(true);
          }
        }}
        onSelectAll={selectAllFiltered}
        onCreateTest={() => setCreateTestOpen(true)}
        contextLabel={contextLabel}
        isYearPaperView={isYearPaperView}
        lang={lang}
        onLangChange={(v) => setLang(v)}
        categoryLabels={categoryLabels}
      />

      {/*
        The list, and beside it the question being read.

        On one column this is what it always was. On two, the list scrolls in its
        own pane and the detail scrolls in another, so paging through questions
        never loses your place in the list.
      */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: isTwoPane ? 'grid' : 'block',
          gridTemplateColumns: isTwoPane ? 'minmax(340px, 400px) 1fr' : undefined,
          gap: isTwoPane ? 2 : 0,
          alignItems: 'start',
          px: GUTTER,
          pb: 2,
        }}
      >
      <Box sx={{ minWidth: 0 }}>
        {fetchError && !loading && (
          <Alert severity="warning" sx={{ mt: 1, borderRadius: 2 }}>
            {fetchError}
          </Alert>
        )}
        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, pt: 1 }}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rounded" height={120} sx={{ borderRadius: 2 }} />
            ))}
          </Box>
        ) : !activeClassroom ? (
          <EmptyState
            icon={<QuizOutlinedIcon sx={{ fontSize: 48, color: 'text.secondary' }} />}
            title="No classroom yet"
            description="The Question Bank opens once you are enrolled in a classroom."
          />
        ) : questions.length === 0 ? (
          <EmptyState
            icon={<QuizOutlinedIcon sx={{ fontSize: 48, color: 'text.secondary' }} />}
            title="No questions match your filters"
            description="Try removing a filter or clearing the search."
            action={
              <Button variant="outlined" onClick={handleClearFilters} sx={{ minHeight: 44 }}>
                Reset Filters
              </Button>
            }
          />
        ) : (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 0.75,
              pt: 1,
              pb: selectionMode && selectedQuestionIds.size > 0 ? 10 : 0,
            }}
          >
            {questions.map((q, idx) => (
              <Box key={q.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
                {/* Checkbox in selection mode */}
                {selectionMode && (
                  <Checkbox
                    checked={selectedQuestionIds.has(q.id)}
                    onChange={() => toggleQuestionSelection(q.id)}
                    sx={{
                      mt: 1,
                      mr: -0.5,
                      minWidth: 42,
                      minHeight: 42,
                    }}
                    inputProps={{ 'aria-label': `Select question ${idx + 1}` }}
                  />
                )}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <SwipeableQuestionCard
                    onStudied={() => handleSwipeStudy(q.id)}
                    onBookmark={() => setSnackbar({ open: true, message: 'Bookmarked!', severity: 'success' })}
                    onLongPress={() => {
                      if (!selectionMode) {
                        setSelectionMode(true);
                        setSelectedQuestionIds(new Set([q.id]));
                      }
                    }}
                    disabled={selectionMode}
                  >
                    <InlineQuestionCard
                      highlight={matchedTerms}
                      question={q}
                      questionDetail={
                        !isTwoPane && expandedQuestionId === q.id ? expandedDetail : null
                      }
                      // With a detail pane beside the list the row stays a row:
                      // expanding in place as well would render the question twice.
                      expanded={!isTwoPane && expandedQuestionId === q.id}
                      selected={isTwoPane && expandedQuestionId === q.id}
                      loading={!isTwoPane && expandedQuestionId === q.id && detailLoading}
                      questionIndex={idx}
                      lang={lang}
                      onToggleExpand={() => handleExpandQuestion(q.id)}
                      onSubmit={handleInlineSubmit}
                      onStudyToggle={handleStudyToggle}
                      onReport={handleReport}
                      onCategoryClick={(cat) => {
                        setFilters((prev) => {
                          const current = prev.categories || [];
                          if (current.includes(cat)) return prev;
                          return { ...prev, categories: [...current, cat] };
                        });
                      }}
                    />
                  </SwipeableQuestionCard>
                </Box>
              </Box>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={page <= 1}
                    onClick={() => goToPage(page - 1)}
                    sx={{ minWidth: 40, minHeight: 40 }}
                  >
                    ‹
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                    .map((p, idx, arr) => {
                      const showEllipsis = idx > 0 && p - arr[idx - 1] > 1;
                      return (
                        <Box key={p} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {showEllipsis && (
                            <Typography variant="body2" color="text.disabled" sx={{ px: 0.5 }}>
                              ...
                            </Typography>
                          )}
                          <Button
                            size="small"
                            variant={p === page ? 'contained' : 'text'}
                            onClick={() => goToPage(p)}
                            sx={{
                              minWidth: 40,
                              minHeight: 40,
                              fontWeight: p === page ? 700 : 400,
                            }}
                          >
                            {p}
                          </Button>
                        </Box>
                      );
                    })}
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={page >= totalPages}
                    onClick={() => goToPage(page + 1)}
                    sx={{ minWidth: 40, minHeight: 40 }}
                  >
                    ›
                  </Button>
                </Box>
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* The detail pane. Only ever mounted on two columns. */}
      {isTwoPane && (
        <Box
          sx={{
            // Sticky rather than a second scroll pane: the question stays in
            // view while the list scrolls behind it, and nothing has to know the
            // exact height of the chrome above to get there. The offset clears
            // the sticky filter bar this sits beside.
            position: 'sticky',
            top: DETAIL_PANE_TOP,
            alignSelf: 'start',
            maxHeight: `calc(100vh - ${DETAIL_PANE_TOP + SHELL_CHROME.md}px)`,
            overflowY: 'auto',
            borderLeft: '1px solid',
            borderColor: 'divider',
            pl: 2,
          }}
        >
          {detailLoading ? (
            <Box sx={{ pt: 1 }}>
              <Skeleton variant="text" width="40%" height={28} />
              <Skeleton variant="text" width="90%" />
              <Skeleton variant="rounded" height={180} sx={{ my: 2, borderRadius: 2 }} />
              <Skeleton variant="rounded" height={48} sx={{ borderRadius: 2 }} />
            </Box>
          ) : expandedDetail ? (
            <QuestionDetail
              question={expandedDetail}
              onSubmit={handleInlineSubmit}
              onStudyToggle={handleStudyToggle}
              onReport={(reportType, description) =>
                handleReport(expandedDetail.id, reportType, description)
              }
              onNext={() => stepQuestion(1)}
              onPrev={() => stepQuestion(-1)}
              hasNext={detailIndex >= 0 && detailIndex < questions.length - 1}
              hasPrev={detailIndex > 0}
              currentIndex={detailIndex}
              totalCount={questions.length}
              initialLang={lang}
            />
          ) : (
            <EmptyState
              icon={<QuizOutlinedIcon sx={{ fontSize: 48, color: 'text.secondary' }} />}
              title="Pick a question"
              description="Choose one from the list to read it, answer it and see the solution here."
            />
          )}
        </Box>
      )}
      </Box>

      {/* Selection bottom bar (fixed) */}
      {selectionMode && selectedQuestionIds.size > 0 && (
        <Paper
          elevation={8}
          sx={{
            position: 'fixed',
            bottom: { xs: 56, sm: 0 },
            left: 0,
            right: 0,
            p: 2,
            zIndex: 100,
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              maxWidth: 800,
              mx: 'auto',
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {selectedQuestionIds.size} selected
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Button
              variant="contained"
              onClick={() => setCreateTestOpen(true)}
              sx={{ textTransform: 'none', minHeight: 44 }}
            >
              Create Test
            </Button>
          </Box>
        </Paper>
      )}

      {/* Create Test Dialog */}
      <Dialog
        open={createTestOpen}
        onClose={() => setCreateTestOpen(false)}
        fullScreen={isMobile}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center' }}>
          Create Custom Test
          <IconButton
            onClick={() => setCreateTestOpen(false)}
            sx={{ ml: 'auto' }}
            aria-label="Close"
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
            <TextField
              label="Test Name"
              value={testTitle}
              onChange={(e) => {
                setTitleTouched(true);
                setTestTitle(e.target.value);
              }}
              fullWidth
              required
              inputProps={{ maxLength: 200 }}
            />

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                Timer Type
              </Typography>
              <RadioGroup
                value={timerType}
                onChange={(e) => setTimerType(e.target.value as 'none' | 'full' | 'per_question')}
              >
                <FormControlLabel
                  value="none"
                  control={<Radio />}
                  label="No Timer"
                />
                <FormControlLabel
                  value="full"
                  control={<Radio />}
                  label="Full Test Timer"
                />
                <FormControlLabel
                  value="per_question"
                  control={<Radio />}
                  label="Per Question Timer"
                />
              </RadioGroup>
            </Box>

            {timerType === 'full' && (
              <TextField
                label="Duration (minutes)"
                type="number"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Math.max(1, Number(e.target.value)))}
                inputProps={{ min: 1, max: 600 }}
                fullWidth
              />
            )}

            {timerType === 'per_question' && (
              <TextField
                label="Time per question (seconds)"
                type="number"
                value={perQuestionSeconds}
                onChange={(e) => setPerQuestionSeconds(Math.max(10, Number(e.target.value)))}
                inputProps={{ min: 10, max: 3600 }}
                fullWidth
              />
            )}

            <Typography variant="body2" color="text.secondary">
              {selectedQuestionIds.size} question{selectedQuestionIds.size !== 1 ? 's' : ''} selected
              {' '}({selectedQuestionIds.size} marks total)
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setCreateTestOpen(false)}
            sx={{ textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleCreateTest}
            disabled={creatingTest || !testTitle.trim() || selectedQuestionIds.size === 0}
            sx={{ textTransform: 'none', minWidth: 120 }}
          >
            {creatingTest ? 'Creating...' : 'Create Test'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Filter Drawer */}
      <FilterDrawer
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onApply={handleFilterApply}
        topics={topics}
        topicCounts={topicCounts}
        categoryCounts={categoryCounts}
        categoryTree={categoryTree}
        examTree={examTree}
        matchCount={matchCount}
        onDraftChange={setDraftFilters}
        contextLabel={contextLabel}
      />

      {/* Snackbar for feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
