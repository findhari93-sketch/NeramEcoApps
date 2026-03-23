'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  Typography,
  Skeleton,
  Alert,
  Button,
  Stack,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  InputAdornment,
  Paper,
  Fab,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import SortIcon from '@mui/icons-material/Sort';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import ThreadCard from '@/components/exam-recall/ThreadCard';
import type {
  ExamRecallCheckpointStatus,
  ExamRecallThreadListItem,
  ExamRecallSection,
  ExamRecallQuestionType,
  ExamRecallThreadStatus,
  ExamRecallTopicCategory,
  ExamRecallSessionSummary,
} from '@neram/database';

const PAGE_SIZE = 20;

const SECTION_OPTIONS: Array<{ value: ExamRecallSection | ''; label: string }> = [
  { value: '', label: 'All Sections' },
  { value: 'part_a', label: 'Part A (Drawing)' },
  { value: 'part_b', label: 'Part B (MCQ/Aptitude)' },
];

const QUESTION_TYPE_OPTIONS: Array<{ value: ExamRecallQuestionType | ''; label: string }> = [
  { value: '', label: 'All Types' },
  { value: 'mcq', label: 'MCQ' },
  { value: 'numerical', label: 'Numerical' },
  { value: 'fill_blank', label: 'Fill-blank' },
  { value: 'drawing', label: 'Drawing' },
];

const STATUS_OPTIONS: Array<{ value: ExamRecallThreadStatus | ''; label: string }> = [
  { value: '', label: 'All Statuses' },
  { value: 'raw', label: 'Raw' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'published', label: 'Published' },
];

const TOPIC_OPTIONS: Array<{ value: ExamRecallTopicCategory | ''; label: string }> = [
  { value: '', label: 'All Topics' },
  { value: 'visual_reasoning', label: 'Visual Reasoning' },
  { value: 'logical_derivation', label: 'Logical Derivation' },
  { value: 'gk_architecture', label: 'GK / Architecture' },
  { value: 'language', label: 'Language' },
  { value: 'design_sensitivity', label: 'Design Sensitivity' },
  { value: 'numerical_ability', label: 'Numerical Ability' },
  { value: 'drawing', label: 'Drawing' },
];

type SortOption = 'newest' | 'most_confirmed' | 'most_vouched';

export default function BrowsePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { user, activeClassroom, getToken } = useNexusAuthContext();

  // From query params
  const initialExamDate = searchParams.get('exam_date') || '';
  const initialSession = searchParams.get('session') || '';

  // Checkpoint gate
  const [checkpoint, setCheckpoint] = useState<ExamRecallCheckpointStatus | null>(null);
  const [checkpointLoading, setCheckpointLoading] = useState(true);

  // Filters
  const [section, setSection] = useState<ExamRecallSection | ''>('');
  const [questionType, setQuestionType] = useState<ExamRecallQuestionType | ''>('');
  const [topicCategory, setTopicCategory] = useState<ExamRecallTopicCategory | ''>('');
  const [status, setStatus] = useState<ExamRecallThreadStatus | ''>('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('newest');

  // Threads
  const [threads, setThreads] = useState<ExamRecallThreadListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Session summaries (for grouping headers)
  const [sessionSummaries, setSessionSummaries] = useState<ExamRecallSessionSummary[]>([]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = threads.length < totalCount;
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  // Fetch checkpoint to check if browsing is unlocked
  useEffect(() => {
    if (!activeClassroom || !initialExamDate) {
      setCheckpointLoading(false);
      return;
    }
    fetchCheckpoint();
  }, [activeClassroom, initialExamDate, initialSession]);

  // Fetch threads when filters change
  useEffect(() => {
    if (!activeClassroom || !checkpoint?.is_unlocked) return;
    setPage(1);
    fetchThreads(1, true);
  }, [activeClassroom, checkpoint, section, questionType, topicCategory, status, search, sort]);

  // Infinite scroll
  useEffect(() => {
    if (!sentinelRef.current || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loadingMore) {
          loadMore();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, threads.length]);

  const fetchCheckpoint = useCallback(async () => {
    if (!activeClassroom || !initialExamDate) return;
    setCheckpointLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({
        classroom_id: activeClassroom.id,
        exam_date: initialExamDate,
        session_number: initialSession || '1',
      });
      const res = await fetch(`/api/exam-recall/checkpoint?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load checkpoint');
      const data: ExamRecallCheckpointStatus = await res.json();
      setCheckpoint(data);
    } catch (err) {
      console.error('Checkpoint fetch error:', err);
    } finally {
      setCheckpointLoading(false);
    }
  }, [activeClassroom, initialExamDate, initialSession, getToken]);

  const fetchThreads = useCallback(
    async (p: number, reset: boolean) => {
      if (!activeClassroom) return;
      if (reset) setLoading(true);
      else setLoadingMore(true);

      try {
        const token = await getToken();
        const params = new URLSearchParams({
          classroom_id: activeClassroom.id,
          page: String(p),
          pageSize: String(PAGE_SIZE),
        });

        if (initialExamDate) params.set('exam_date', initialExamDate);
        if (initialSession) params.set('session_number', initialSession);
        if (section) params.set('section', section);
        if (questionType) params.set('question_type', questionType);
        if (topicCategory) params.set('topic_category', topicCategory);
        if (status) params.set('status', status);
        if (search) params.set('search', search);

        const res = await fetch(`/api/exam-recall/threads?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to load threads');
        const data = await res.json();
        const newThreads: ExamRecallThreadListItem[] = data.threads || [];

        if (reset) {
          setThreads(sortThreads(newThreads, sort));
        } else {
          setThreads((prev) => sortThreads([...prev, ...newThreads], sort));
        }
        setTotalCount(data.total || 0);
        if (data.session_summaries) {
          setSessionSummaries(data.session_summaries);
        }
      } catch (err) {
        console.error('Threads fetch error:', err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [activeClassroom, initialExamDate, initialSession, section, questionType, topicCategory, status, search, sort, getToken],
  );

  const loadMore = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchThreads(nextPage, false);
  }, [page, fetchThreads]);

  const sortThreads = (list: ExamRecallThreadListItem[], sortBy: SortOption) => {
    const sorted = [...list];
    switch (sortBy) {
      case 'newest':
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'most_confirmed':
        sorted.sort((a, b) => b.confirm_count - a.confirm_count);
        break;
      case 'most_vouched':
        sorted.sort((a, b) => b.vouch_count - a.vouch_count);
        break;
    }
    return sorted;
  };

  const handleConfirm = useCallback(
    async (threadId: string) => {
      try {
        const token = await getToken();
        await fetch(`/api/exam-recall/threads/${threadId}/confirm`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        fetchThreads(1, true);
      } catch (err) {
        console.error('Confirm error:', err);
      }
    },
    [getToken, fetchThreads],
  );

  const handleSearchChange = useCallback((value: string) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearch(value);
    }, 400);
  }, []);

  const formatExamDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  const getSessionLabel = (num: number) => {
    const labels: Record<number, string> = { 1: 'Morning', 2: 'Afternoon', 3: 'Evening' };
    return `Session ${num} (${labels[num] || ''})`;
  };

  // Group threads by exam_date + session_number
  const groupedThreads = threads.reduce(
    (acc, thread) => {
      const key = `${thread.exam_date}_${thread.session_number}`;
      if (!acc[key]) {
        acc[key] = {
          examDate: thread.exam_date,
          sessionNumber: thread.session_number,
          threads: [],
        };
      }
      acc[key].threads.push(thread);
      return acc;
    },
    {} as Record<string, { examDate: string; sessionNumber: number; threads: ExamRecallThreadListItem[] }>,
  );

  if (!activeClassroom) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">Select a classroom to continue.</Typography>
      </Box>
    );
  }

  // Checkpoint gate
  if (checkpointLoading) {
    return (
      <Stack spacing={2} sx={{ py: 2 }}>
        <Skeleton variant="rounded" height={60} />
        <Skeleton variant="rounded" height={300} />
      </Stack>
    );
  }

  if (checkpoint && !checkpoint.is_unlocked) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Alert severity="info" sx={{ mb: 2, textAlign: 'left' }}>
          You need to contribute first before browsing recalled questions. Complete the checkpoint
          requirements to unlock access.
        </Alert>
        <Button
          variant="contained"
          onClick={() =>
            router.push(
              `/student/exam-recall/contribute?exam_date=${initialExamDate}&session=${initialSession || '1'}`,
            )
          }
        >
          Go to Contribute
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', minHeight: '60vh' }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push('/student/exam-recall')}
          size="small"
          color="inherit"
        >
          Back
        </Button>
        <Typography variant={isMobile ? 'subtitle1' : 'h6'} fontWeight={600}>
          Browse Recalled Questions
        </Typography>
      </Stack>

      {/* Filter bar */}
      <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, mb: 2, borderRadius: 2 }}>
        <Stack spacing={1.5}>
          {/* Search */}
          <TextField
            placeholder="Search questions..."
            size="small"
            fullWidth
            onChange={(e) => handleSearchChange(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: '1.2rem', color: 'text.secondary' }} />
                </InputAdornment>
              ),
            }}
          />

          {/* Filter row */}
          <Stack
            direction="row"
            spacing={1}
            sx={{ overflowX: 'auto', pb: 0.5 }}
            flexWrap={isMobile ? 'nowrap' : 'wrap'}
          >
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>Section</InputLabel>
              <Select
                value={section}
                label="Section"
                onChange={(e) => setSection(e.target.value as ExamRecallSection | '')}
              >
                {SECTION_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Topic</InputLabel>
              <Select
                value={topicCategory}
                label="Topic"
                onChange={(e) => setTopicCategory(e.target.value as ExamRecallTopicCategory | '')}
              >
                {TOPIC_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 110 }}>
              <InputLabel>Type</InputLabel>
              <Select
                value={questionType}
                label="Type"
                onChange={(e) => setQuestionType(e.target.value as ExamRecallQuestionType | '')}
              >
                {QUESTION_TYPE_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Status</InputLabel>
              <Select
                value={status}
                label="Status"
                onChange={(e) => setStatus(e.target.value as ExamRecallThreadStatus | '')}
              >
                {STATUS_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          {/* Sort */}
          <Stack direction="row" alignItems="center" spacing={1}>
            <SortIcon sx={{ fontSize: '1rem', color: 'text.secondary' }} />
            <Stack direction="row" spacing={0.5}>
              {[
                { value: 'newest' as const, label: 'Newest' },
                { value: 'most_confirmed' as const, label: 'Most Confirmed' },
                { value: 'most_vouched' as const, label: 'Most Vouched' },
              ].map((opt) => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  size="small"
                  variant={sort === opt.value ? 'filled' : 'outlined'}
                  color={sort === opt.value ? 'primary' : 'default'}
                  onClick={() => setSort(opt.value)}
                  sx={{ cursor: 'pointer' }}
                />
              ))}
            </Stack>
          </Stack>
        </Stack>
      </Paper>

      {/* Results count */}
      {!loading && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          {totalCount} question{totalCount !== 1 ? 's' : ''} found
        </Typography>
      )}

      {/* Loading */}
      {loading && (
        <Stack spacing={1.5}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rounded" height={100} />
          ))}
        </Stack>
      )}

      {/* Empty */}
      {!loading && threads.length === 0 && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <Typography color="text.secondary">
            No recalled questions match your filters. Try adjusting your search criteria.
          </Typography>
        </Paper>
      )}

      {/* Thread list, grouped by session */}
      {!loading && threads.length > 0 && (
        <Stack spacing={2}>
          {Object.values(groupedThreads).map((group) => {
            const summary = sessionSummaries.find(
              (s) => s.exam_date === group.examDate && s.session_number === group.sessionNumber,
            );
            return (
              <Box key={`${group.examDate}_${group.sessionNumber}`}>
                {/* Session header */}
                <Paper
                  sx={{
                    p: { xs: 1, md: 1.5 },
                    mb: 1,
                    borderRadius: 1.5,
                    bgcolor: (t) =>
                      t.palette.mode === 'light' ? 'grey.50' : 'grey.900',
                  }}
                >
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    alignItems={{ sm: 'center' }}
                    justifyContent="space-between"
                    spacing={0.5}
                  >
                    <Typography variant="subtitle2" fontWeight={600}>
                      {formatExamDate(group.examDate)} — {getSessionLabel(group.sessionNumber)}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <Typography variant="caption" color="text.secondary">
                        {group.threads.length} question{group.threads.length !== 1 ? 's' : ''}
                      </Typography>
                      {summary && (
                        <Typography variant="caption" color="text.secondary">
                          {summary.contributor_count} contributor
                          {summary.contributor_count !== 1 ? 's' : ''}
                        </Typography>
                      )}
                    </Stack>
                  </Stack>
                </Paper>

                {/* Threads */}
                <Stack spacing={1.5}>
                  {group.threads.map((thread) => (
                    <ThreadCard
                      key={thread.id}
                      thread={thread}
                      onConfirm={() => handleConfirm(thread.id)}
                      onThreadClick={() =>
                        router.push(`/student/exam-recall/thread/${thread.id}`)
                      }
                    />
                  ))}
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}

      {/* Infinite scroll sentinel */}
      {hasMore && <Box ref={sentinelRef} sx={{ height: 1 }} />}
      {loadingMore && (
        <Stack spacing={1.5} sx={{ mt: 2 }}>
          {[1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={100} />
          ))}
        </Stack>
      )}

      {/* Floating Action Button */}
      <Fab
        color="primary"
        size={isMobile ? 'medium' : 'large'}
        sx={{
          position: 'fixed',
          bottom: { xs: 80, md: 32 },
          right: { xs: 16, md: 32 },
          zIndex: 1100,
        }}
        onClick={() =>
          router.push(
            `/student/exam-recall/contribute?exam_date=${initialExamDate}&session=${initialSession || '1'}`,
          )
        }
      >
        <AddIcon />
      </Fab>
    </Box>
  );
}
