'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  Typography,
  Skeleton,
  Paper,
  IconButton,
  Badge,
  ToggleButtonGroup,
  ToggleButton,
  Button,
} from '@neram/ui';
import FilterListIcon from '@mui/icons-material/FilterList';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import QuestionBankLayout from '@/components/question-bank/QuestionBankLayout';
import InlineQuestionCard from '@/components/question-bank/InlineQuestionCard';
import FilterDrawer from '@/components/question-bank/FilterDrawer';
import FilterChips, { countActiveFilters } from '@/components/question-bank/FilterChips';
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

  // Mode
  const [mode, setMode] = useState<'practice' | 'study'>(
    (searchParams.get('mode') as 'practice' | 'study') || 'practice',
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

  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = questions.length < totalCount;

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
  }, [activeClassroom, filters, mode, selectedExam, selectedYear, selectedSession]);

  // Sync filters + sidebar to URL
  useEffect(() => {
    const params = serializeFilters(filters);
    if (selectedExam) params.set('exam', selectedExam);
    if (selectedYear) params.set('year', String(selectedYear));
    if (selectedSession) params.set('session', selectedSession);
    if (mode !== 'practice') params.set('mode', mode);
    const qs = params.toString();
    const current = searchParams.toString();
    if (qs !== current) {
      router.replace(`/student/question-bank/questions${qs ? '?' + qs : ''}`, {
        scroll: false,
      });
    }
  }, [filters, mode, selectedExam, selectedYear, selectedSession]);

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
      params.set('mode', mode);

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

  async function handleExpandQuestion(questionId: string) {
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
    >
      {/* Top bar: mode toggle + question count + filter button */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 2,
          flexWrap: 'wrap',
        }}
      >
        <ToggleButtonGroup
          value={mode}
          exclusive
          onChange={(_, val) => val && setMode(val)}
          size="small"
          sx={{
            '& .MuiToggleButton-root': {
              textTransform: 'none',
              fontWeight: 600,
              px: 2,
              py: 0.5,
              borderRadius: '20px !important',
              fontSize: '0.85rem',
            },
          }}
        >
          <ToggleButton value="practice">Practice</ToggleButton>
          <ToggleButton value="study">Study</ToggleButton>
        </ToggleButtonGroup>

        <Box sx={{ flexGrow: 1 }} />

        {!loading && (
          <Typography variant="body2" color="text.secondary">
            {totalCount} question{totalCount !== 1 ? 's' : ''}
          </Typography>
        )}

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

      {/* Sticky filter chips */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          bgcolor: 'background.default',
        }}
      >
        <FilterChips
          filters={filters}
          onRemove={handleFilterRemove}
          onClearAll={handleClearFilters}
        />
      </Box>

      {/* Question list */}
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
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {questions.map((q, idx) => (
            <InlineQuestionCard
              key={q.id}
              question={q}
              questionDetail={expandedQuestionId === q.id ? expandedDetail : null}
              mode={mode}
              expanded={expandedQuestionId === q.id}
              loading={expandedQuestionId === q.id && detailLoading}
              questionIndex={idx}
              onToggleExpand={() => handleExpandQuestion(q.id)}
              onSubmit={handleInlineSubmit}
              onStudyToggle={handleStudyToggle}
            />
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

      {/* Filter Drawer */}
      <FilterDrawer
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onApply={handleFilterApply}
        topics={topics}
        contextLabel={contextLabel}
      />
    </QuestionBankLayout>
  );
}
