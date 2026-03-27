'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  Typography,
  Skeleton,
  Paper,
  IconButton,
  Badge,
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
  ToggleButton,
  ToggleButtonGroup,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import FilterListIcon from '@mui/icons-material/FilterList';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import SelectAllIcon from '@mui/icons-material/SelectAll';
import TranslateIcon from '@mui/icons-material/Translate';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useScrollSpy } from '@/hooks/useScrollSpy';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import QuestionBankLayout from '@/components/question-bank/QuestionBankLayout';
import InlineQuestionCard from '@/components/question-bank/InlineQuestionCard';
import FilterDrawer from '@/components/question-bank/FilterDrawer';
import FilterChips, { countActiveFilters } from '@/components/question-bank/FilterChips';
import { ProgressHeader } from '@/components/question-bank/ProgressHeader';
import { JumpBar, type QuestionStatus } from '@/components/question-bank/JumpBar';
import { MiniMap } from '@/components/question-bank/MiniMap';
import SwipeableQuestionCard from '@/components/question-bank/SwipeableQuestionCard';
import ScrollToTopFab from '@/components/question-bank/ScrollToTopFab';
import KeyboardShortcutsOverlay from '@/components/question-bank/KeyboardShortcutsOverlay';
import type {
  QBExamTree,
  QBFilterState,
  NexusQBQuestionListItem,
  NexusQBQuestionDetail,
  NexusQBTopic,
  QBDifficulty,
  QBQuestionFormat,
} from '@neram/database';

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
  const { activeClassroom, getToken } = useNexusAuthContext();

  // Exam sidebar state
  const [examTree, setExamTree] = useState<QBExamTree | null>(null);
  const [examTreeLoading, setExamTreeLoading] = useState(true);
  const [selectedExam, setSelectedExam] = useState<string | null>(
    searchParams.get('exam') || null,
  );
  const [selectedYear, setSelectedYear] = useState<number | null>(
    searchParams.get('year') ? Number(searchParams.get('year')) : null,
  );
  const [selectedSession, setSelectedSession] = useState<string | null>(
    searchParams.get('session') || null,
  );

  // Filters (categories, difficulty, format, status, search, topics)
  const [filters, setFilters] = useState<QBFilterState>(() =>
    deserializeFilters(searchParams),
  );

  // Question list state
  const [questions, setQuestions] = useState<NexusQBQuestionListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [topics, setTopics] = useState<NexusQBTopic[]>([]);

  // Inline expansion state
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<NexusQBQuestionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Selection mode state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  const [createTestOpen, setCreateTestOpen] = useState(false);

  // Create test dialog state
  const [testTitle, setTestTitle] = useState('');
  const [timerType, setTimerType] = useState<'none' | 'full' | 'per_question'>('none');
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [perQuestionSeconds, setPerQuestionSeconds] = useState<number>(120);
  const [creatingTest, setCreatingTest] = useState(false);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // Language toggle
  const [lang, setLang] = useState<'en' | 'hi'>('en');

  // Keyboard shortcuts overlay
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = questions.length < totalCount;
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

  // Scroll spy for tracking visible question
  const { currentIndex: scrollSpyIndex, containerRef: scrollContainerRef, scrollToIndex } = useScrollSpy({
    itemSelector: '[data-question-index]',
  });

  // Build question status map for JumpBar + MiniMap
  const questionStatuses = useMemo(() => {
    const statuses = new Map<number, QuestionStatus>();
    questions.forEach((q, idx) => {
      const summary = q.attempt_summary;
      if (summary && summary.total_attempts > 0) {
        statuses.set(idx, summary.best_result ? 'correct' : 'incorrect');
      } else {
        statuses.set(idx, 'unattempted');
      }
    });
    return statuses;
  }, [questions]);

  // Compute correct/incorrect counts for progress header
  const { correctCount, incorrectCount } = useMemo(() => {
    let correct = 0;
    let incorrect = 0;
    questionStatuses.forEach((s) => {
      if (s === 'correct') correct++;
      else if (s === 'incorrect') incorrect++;
    });
    return { correctCount: correct, incorrectCount: incorrect };
  }, [questionStatuses]);

  // Keyboard shortcuts
  const handleJumpToQuestion = useCallback((qNum: number) => {
    const idx = Math.max(0, Math.min(qNum - 1, questions.length - 1));
    scrollToIndex(idx);
  }, [questions.length, scrollToIndex]);

  const { goToMode, goToBuffer } = useKeyboardShortcuts({
    enabled: isDesktop && !createTestOpen && !filterOpen,
    actions: {
      onNext: () => {
        const nextIdx = Math.min(scrollSpyIndex + 1, questions.length - 1);
        scrollToIndex(nextIdx);
      },
      onPrev: () => {
        const prevIdx = Math.max(scrollSpyIndex - 1, 0);
        scrollToIndex(prevIdx);
      },
      onToggleExpand: () => {
        const q = questions[scrollSpyIndex];
        if (q) handleExpandQuestion(q.id);
      },
      onToggleStudied: () => handleStudyToggle(),
      onSelectOption: () => { /* MCQ option selection handled within QuestionDetail */ },
      onEscape: () => {
        if (expandedQuestionId) {
          setExpandedQuestionId(null);
          setExpandedDetail(null);
        } else if (selectionMode) {
          exitSelectionMode();
        }
      },
      onToggleHelp: () => setShortcutsOpen((prev) => !prev),
      onGoToQuestion: handleJumpToQuestion,
    },
  });

  // Fetch exam tree on mount
  useEffect(() => {
    if (!activeClassroom) return;
    fetchExamTree();
    fetchTopics();
  }, [activeClassroom]);

  // Load preset if specified
  useEffect(() => {
    const presetId = searchParams.get('preset');
    if (presetId && activeClassroom) {
      loadPreset(presetId);
    }
  }, [searchParams, activeClassroom]);

  // Fetch questions when filters, sidebar selection, or mode change
  useEffect(() => {
    if (!activeClassroom) return;
    fetchQuestions(1, false);
  }, [activeClassroom, filters, selectedExam, selectedYear, selectedSession]);

  // Sync filters + sidebar to URL
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

  // Infinite scroll observer
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          loadNextPage();
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, page]);

  async function fetchExamTree() {
    setExamTreeLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/question-bank/exam-tree?classroom_id=${activeClassroom!.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const json = await res.json();
        setExamTree(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch exam tree:', err);
    } finally {
      setExamTreeLoading(false);
    }
  }

  async function fetchTopics() {
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/question-bank/topics?classroom_id=${activeClassroom!.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const json = await res.json();
        setTopics(json.data || json || []);
      }
    } catch (err) {
      console.error('Failed to fetch topics:', err);
    }
  }

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

  async function fetchQuestions(pageNum: number, append: boolean) {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setQuestions([]);
    }

    try {
      const token = await getToken();
      const params = new URLSearchParams();
      params.set('classroom_id', activeClassroom!.id);
      params.set('page', String(pageNum));
      params.set('page_size', String(PAGE_SIZE));
      params.set('mode', 'practice');

      // Sidebar source filters
      if (selectedExam) params.set('exam_type', selectedExam);
      if (selectedYear) params.set('year', String(selectedYear));
      if (selectedSession) params.set('session', selectedSession);

      // Filter drawer filters
      if (filters.categories?.length) params.set('categories', filters.categories.join(','));
      if (filters.difficulty?.length) params.set('difficulty', filters.difficulty.join(','));
      if (filters.question_format?.length) params.set('question_format', filters.question_format.join(','));
      if (filters.attempt_status && filters.attempt_status !== 'all') params.set('attempt_status', filters.attempt_status);
      if (filters.search_text) params.set('search_text', filters.search_text);
      if (filters.topic_ids?.length) params.set('topic_ids', filters.topic_ids.join(','));

      const res = await fetch(`/api/question-bank/questions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to fetch questions');

      const json = await res.json();
      const payload = json.data || json;
      const items: NexusQBQuestionListItem[] = payload?.questions || (Array.isArray(payload) ? payload : []);
      const total: number = payload?.total ?? json.total_count ?? items.length;

      if (append) {
        setQuestions((prev) => [...prev, ...items]);
      } else {
        setQuestions(items);
      }
      setTotalCount(total);
      setPage(pageNum);
    } catch (err) {
      console.error('Failed to fetch questions:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  function loadNextPage() {
    fetchQuestions(page + 1, true);
  }

  function handleExamSelect(exam: string | null, year: number | null, session: string | null) {
    setSelectedExam(exam);
    setSelectedYear(year);
    setSelectedSession(session);
    setExpandedQuestionId(null);
    setExpandedDetail(null);
  }

  // Auto-suggest test title when create dialog opens
  useEffect(() => {
    if (createTestOpen && !testTitle) {
      const parts: string[] = [];
      if (selectedExam) parts.push(selectedExam === 'JEE_PAPER_2' ? 'JEE Paper 2' : selectedExam);
      if (selectedYear) parts.push(String(selectedYear));
      parts.push('Practice');
      parts.push(`- ${selectedQuestionIds.size} questions`);
      setTestTitle(parts.join(' '));
    }
  }, [createTestOpen]);

  // Selection mode helpers
  function toggleQuestionSelection(questionId: string) {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  }

  function selectAllFiltered() {
    setSelectedQuestionIds(new Set(questions.map((q) => q.id)));
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedQuestionIds(new Set());
  }

  // Create test handler
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
        // Refresh the detail to show result
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

  const activeFilterCount = countActiveFilters(filters);

  // Build context label for filter drawer
  const contextLabelParts: string[] = [];
  if (selectedExam) contextLabelParts.push(selectedExam === 'JEE_PAPER_2' ? 'JEE Paper 2' : selectedExam);
  if (selectedYear) contextLabelParts.push(String(selectedYear));
  if (selectedSession) contextLabelParts.push(selectedSession);
  const contextLabel = contextLabelParts.length > 0 ? contextLabelParts.join(' ') : undefined;

  return (
    <QuestionBankLayout
      examTree={examTree}
      examTreeLoading={examTreeLoading}
      selectedExam={selectedExam}
      selectedYear={selectedYear}
      selectedSession={selectedSession}
      onSelect={handleExamSelect}
      rightSlot={
        !loading && questions.length > 0 ? (
          <MiniMap
            totalQuestions={questions.length}
            currentIndex={scrollSpyIndex}
            questionStatuses={questionStatuses}
            onJump={scrollToIndex}
          />
        ) : undefined
      }
    >
      {/* Sticky Progress Header + Jump Bar + Actions */}
      <ProgressHeader
        contextLabel={contextLabel || 'Question Bank'}
        currentIndex={scrollSpyIndex}
        totalQuestions={totalCount || questions.length}
        correctCount={correctCount}
        incorrectCount={incorrectCount}
      >
        {/* Jump bar (inside progress header) */}
        {!loading && questions.length > 0 && (
          <JumpBar
            totalQuestions={questions.length}
            currentIndex={scrollSpyIndex}
            questionStatuses={questionStatuses}
            onJump={scrollToIndex}
            collapsible={isMobile}
          />
        )}

        {/* Actions row: create test, language, filter */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mt: 1,
            flexWrap: 'wrap',
          }}
        >
          {/* Go-to mode indicator */}
          {goToMode && (
            <Typography variant="caption" sx={{ bgcolor: 'warning.light', px: 1, py: 0.25, borderRadius: 1, fontWeight: 600 }}>
              Go to: {goToBuffer || '...'}
            </Typography>
          )}

          <Box sx={{ flexGrow: 1 }} />

          {/* Create Test / Cancel button */}
          {!selectionMode ? (
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setSelectionMode(true)}
              sx={{ textTransform: 'none', minHeight: 40 }}
            >
              Create Test
            </Button>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<SelectAllIcon />}
                onClick={selectAllFiltered}
                sx={{ textTransform: 'none', minHeight: 40 }}
              >
                Select All ({questions.length})
              </Button>
              <Button
                size="small"
                variant="text"
                color="inherit"
                onClick={exitSelectionMode}
                sx={{ textTransform: 'none', minHeight: 40 }}
              >
                Cancel
              </Button>
            </Box>
          )}

          {/* Language toggle */}
          <ToggleButtonGroup
            value={lang}
            exclusive
            onChange={(_, v) => v && setLang(v)}
            size="small"
            sx={{
              '& .MuiToggleButton-root': {
                px: 1,
                py: 0.25,
                fontSize: '0.7rem',
                fontWeight: 600,
                textTransform: 'none',
                minWidth: 32,
                minHeight: 32,
              },
            }}
          >
            <ToggleButton value="en">EN</ToggleButton>
            <ToggleButton value="hi">हि</ToggleButton>
          </ToggleButtonGroup>

          <IconButton
            onClick={() => setFilterOpen(true)}
            sx={{ minWidth: 48, minHeight: 48 }}
            aria-label="Open filters"
          >
            <Badge
              badgeContent={activeFilterCount}
              color="primary"
              invisible={activeFilterCount === 0}
            >
              <FilterListIcon />
            </Badge>
          </IconButton>
        </Box>
      </ProgressHeader>

      {/* Filter chips (below sticky header) */}
      <FilterChips
        filters={filters}
        onRemove={handleFilterRemove}
        onClearAll={handleClearFilters}
      />

      {/* Question list with scroll spy container */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={120} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      ) : questions.length === 0 ? (
        <Paper
          variant="outlined"
          sx={{
            p: 4,
            textAlign: 'center',
            borderRadius: 2,
          }}
        >
          <QuizOutlinedIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            No questions match your filters
          </Typography>
          <Button variant="outlined" onClick={handleClearFilters}>
            Reset Filters
          </Button>
        </Paper>
      ) : (
        <Box
          ref={scrollContainerRef as React.RefObject<HTMLDivElement>}
          sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pb: selectionMode && selectedQuestionIds.size > 0 ? 10 : 0 }}
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
                    question={q}
                    questionDetail={expandedQuestionId === q.id ? expandedDetail : null}
                    expanded={expandedQuestionId === q.id}
                    loading={expandedQuestionId === q.id && detailLoading}
                    questionIndex={idx}
                    lang={lang}
                    onToggleExpand={() => handleExpandQuestion(q.id)}
                    onSubmit={handleInlineSubmit}
                    onStudyToggle={handleStudyToggle}
                    onReport={handleReport}
                  />
                </SwipeableQuestionCard>
              </Box>
            </Box>
          ))}

          {/* Loading more indicator */}
          {loadingMore && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {[1, 2].map((i) => (
                <Skeleton key={i} variant="rounded" height={120} sx={{ borderRadius: 2 }} />
              ))}
            </Box>
          )}

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} style={{ height: 1 }} />
        </Box>
      )}

      {/* Sticky bottom bar when questions are selected */}
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
              onChange={(e) => setTestTitle(e.target.value)}
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
        contextLabel={contextLabel}
      />

      {/* Scroll to top FAB (mobile only) */}
      <ScrollToTopFab />

      {/* Keyboard shortcuts overlay (desktop only) */}
      <KeyboardShortcutsOverlay
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
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
    </QuestionBankLayout>
  );
}
