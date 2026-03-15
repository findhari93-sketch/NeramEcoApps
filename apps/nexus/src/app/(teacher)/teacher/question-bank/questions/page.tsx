'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  MenuItem,
  IconButton,
  Skeleton,
  Chip,
  Snackbar,
  Alert,
} from '@neram/ui';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { NexusQBQuestionListItem } from '@neram/database';
import { QB_CATEGORY_LABELS, QB_CATEGORIES } from '@neram/database';
import DifficultyChip from '@/components/question-bank/DifficultyChip';
import SourceBadges from '@/components/question-bank/SourceBadges';
import CategoryChips from '@/components/question-bank/CategoryChips';

const DIFFICULTY_OPTIONS = [
  { value: '', label: 'All Difficulties' },
  { value: 'EASY', label: 'Easy' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HARD', label: 'Hard' },
];

const RELEVANCE_OPTIONS = [
  { value: '', label: 'All Exams' },
  { value: 'NATA', label: 'NATA' },
  { value: 'JEE', label: 'JEE' },
  { value: 'BOTH', label: 'Both' },
];

export default function QuestionsListPage() {
  const router = useRouter();
  const { getToken } = useNexusAuthContext();

  const [questions, setQuestions] = useState<NexusQBQuestionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // Filters
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [category, setCategory] = useState('');
  const [examRelevance, setExamRelevance] = useState('');

  // Debounce search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [search]);

  const fetchQuestions = useCallback(
    async (pageNum: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const token = await getToken();
        if (!token) return;

        const params = new URLSearchParams();
        params.set('page', String(pageNum));
        params.set('page_size', String(PAGE_SIZE));
        if (debouncedSearch) params.set('search', debouncedSearch);
        if (difficulty) params.set('difficulty', difficulty);
        if (category) params.set('categories', category);
        if (examRelevance) params.set('exam_relevance', examRelevance);

        const res = await fetch(`/api/question-bank/questions?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          const fetched = json.data?.questions || [];
          const fetchedTotal = json.data?.total ?? 0;

          if (append) {
            setQuestions((prev) => [...prev, ...fetched]);
          } else {
            setQuestions(fetched);
          }
          setTotal(fetchedTotal);
        }
      } catch (err) {
        console.error('Failed to fetch questions:', err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [getToken, debouncedSearch, difficulty, category, examRelevance]
  );

  // Reset page and fetch when filters change
  useEffect(() => {
    setPage(1);
    fetchQuestions(1, false);
  }, [debouncedSearch, difficulty, category, examRelevance, fetchQuestions]);

  function handleLoadMore() {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchQuestions(nextPage, true);
  }

  async function handleToggleActive(questionId: string, currentActive: boolean) {
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/question-bank/questions/${questionId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_active: !currentActive }),
      });

      if (res.ok) {
        setQuestions((prev) =>
          prev.map((q) =>
            q.id === questionId ? { ...q, is_active: !currentActive } : q
          )
        );
        setSnackbar({
          open: true,
          message: !currentActive ? 'Question activated' : 'Question deactivated',
          severity: 'success',
        });
      } else {
        throw new Error('Failed to update');
      }
    } catch (err) {
      console.error('Failed to toggle question:', err);
      setSnackbar({ open: true, message: 'Failed to update question', severity: 'error' });
    }
  }

  const hasMore = questions.length < total;

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700, flex: 1 }}>
          Questions
        </Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddOutlinedIcon />}
          onClick={() => router.push('/teacher/question-bank/new')}
          sx={{ textTransform: 'none' }}
        >
          Add Question
        </Button>
      </Box>

      {/* Search */}
      <TextField
        placeholder="Search questions..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        size="small"
        fullWidth
        InputProps={{
          startAdornment: (
            <SearchOutlinedIcon sx={{ color: 'text.secondary', mr: 1 }} fontSize="small" />
          ),
        }}
        sx={{ mb: 1.5 }}
      />

      {/* Filter Row */}
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          mb: 2,
          flexWrap: 'wrap',
        }}
      >
        <TextField
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          select
          size="small"
          sx={{ minWidth: 140 }}
        >
          {DIFFICULTY_OPTIONS.map((d) => (
            <MenuItem key={d.value} value={d.value}>
              {d.label}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          select
          size="small"
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All Categories</MenuItem>
          {QB_CATEGORIES.map((cat: string) => (
            <MenuItem key={cat} value={cat}>
              {QB_CATEGORY_LABELS[cat as keyof typeof QB_CATEGORY_LABELS]}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          value={examRelevance}
          onChange={(e) => setExamRelevance(e.target.value)}
          select
          size="small"
          sx={{ minWidth: 120 }}
        >
          {RELEVANCE_OPTIONS.map((r) => (
            <MenuItem key={r.value} value={r.value}>
              {r.label}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      {/* Results count */}
      {!loading && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {total} question{total !== 1 ? 's' : ''} found
        </Typography>
      )}

      {/* Question List */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} variant="rectangular" height={96} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : questions.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <QuizOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
            No questions yet. Add your first question!
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddOutlinedIcon />}
            onClick={() => router.push('/teacher/question-bank/new')}
            sx={{ textTransform: 'none' }}
          >
            Add Question
          </Button>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {questions.map((q) => (
            <Paper
              key={q.id}
              variant="outlined"
              sx={{
                p: { xs: 1.5, md: 2 },
                opacity: q.is_active ? 1 : 0.6,
                transition: 'opacity 0.2s',
              }}
            >
              {/* Question text */}
              <Typography
                variant="body2"
                sx={{
                  mb: 1,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  lineHeight: 1.5,
                }}
              >
                {q.question_text || 'Image-based question'}
              </Typography>

              {/* Source badges */}
              <Box sx={{ mb: 0.75 }}>
                <SourceBadges sources={q.sources} />
              </Box>

              {/* Bottom row */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                <DifficultyChip difficulty={q.difficulty} size="small" />
                <CategoryChips categories={q.categories.slice(0, 2)} size="small" />

                {!q.is_active && (
                  <Chip label="Inactive" size="small" color="default" sx={{ height: 22, fontSize: '0.65rem' }} />
                )}

                <Box sx={{ flexGrow: 1 }} />

                {/* Actions */}
                <IconButton
                  size="small"
                  onClick={() => router.push(`/teacher/question-bank/questions/${q.id}/edit`)}
                  sx={{ minWidth: 40, minHeight: 40 }}
                  title="Edit"
                >
                  <EditOutlinedIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => handleToggleActive(q.id, q.is_active)}
                  sx={{ minWidth: 40, minHeight: 40 }}
                  title={q.is_active ? 'Deactivate' : 'Activate'}
                >
                  {q.is_active ? (
                    <VisibilityOffOutlinedIcon fontSize="small" />
                  ) : (
                    <VisibilityOutlinedIcon fontSize="small" />
                  )}
                </IconButton>
              </Box>
            </Paper>
          ))}

          {/* Load More */}
          {hasMore && (
            <Button
              variant="outlined"
              onClick={handleLoadMore}
              disabled={loadingMore}
              fullWidth
              sx={{ textTransform: 'none', mt: 1, minHeight: 48 }}
            >
              {loadingMore ? 'Loading...' : 'Load More'}
            </Button>
          )}
        </Box>
      )}

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
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
    </Box>
  );
}
