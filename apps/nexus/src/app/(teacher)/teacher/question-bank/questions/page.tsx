'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  IconButton,
  Skeleton,
  Chip,
  Snackbar,
  Alert,
  Checkbox,
  Switch,
  Tooltip,
} from '@neram/ui';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { NexusQBQuestionListItem } from '@neram/database';
import {
  QB_QUESTION_STATUS_LABELS,
  QB_QUESTION_STATUS_COLORS,
} from '@neram/database';
import DifficultyChip from '@/components/question-bank/DifficultyChip';
import SourceBadges from '@/components/question-bank/SourceBadges';
import CategoryChips from '@/components/question-bank/CategoryChips';
import MathText from '@/components/common/MathText';
import TeacherFilterBar from '@/components/question-bank/TeacherFilterBar';

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
  const [questionStatus, setQuestionStatus] = useState('');

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

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
        if (questionStatus) params.set('question_status', questionStatus);

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
            setSelectedIds(new Set()); // Clear selection on filter change
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
    [getToken, debouncedSearch, difficulty, category, examRelevance, questionStatus]
  );

  // Reset page and fetch when filters change
  useEffect(() => {
    setPage(1);
    fetchQuestions(1, false);
  }, [debouncedSearch, difficulty, category, examRelevance, questionStatus, fetchQuestions]);

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
        const json = await res.json();
        const updated = json.data;
        setQuestions((prev) =>
          prev.map((q) =>
            q.id === questionId
              ? { ...q, is_active: updated.is_active, status: updated.status }
              : q
          )
        );
        setSnackbar({
          open: true,
          message: !currentActive ? 'Question activated — now visible to students' : 'Question deactivated',
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

  // Selection helpers
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === questions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(questions.map((q) => q.id)));
    }
  }

  async function handleBulkAction(action: 'activate' | 'deactivate') {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);

    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/question-bank/questions/bulk-update', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question_ids: Array.from(selectedIds),
          action,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const updatedCount = json.data?.updated || 0;

        // Update local state
        setQuestions((prev) =>
          prev.map((q) => {
            if (!selectedIds.has(q.id)) return q;
            if (action === 'activate') {
              return { ...q, is_active: true, status: 'active' as any };
            } else {
              return { ...q, is_active: false };
            }
          })
        );

        setSelectedIds(new Set());
        setSnackbar({
          open: true,
          message: `${updatedCount} question${updatedCount !== 1 ? 's' : ''} ${action === 'activate' ? 'activated' : 'deactivated'}`,
          severity: 'success',
        });
      } else {
        throw new Error('Failed to bulk update');
      }
    } catch (err) {
      console.error('Bulk update failed:', err);
      setSnackbar({ open: true, message: 'Bulk update failed', severity: 'error' });
    } finally {
      setBulkLoading(false);
    }
  }

  const hasMore = questions.length < total;
  const allSelected = questions.length > 0 && selectedIds.size === questions.length;
  const someSelected = selectedIds.size > 0;

  // Check if selected questions can be activated (have answer keys)
  const selectedQuestions = questions.filter((q) => selectedIds.has(q.id));
  const canActivate = selectedQuestions.some(
    (q) => !q.is_active || ['answer_keyed', 'complete'].includes(q.status)
  );
  const canDeactivate = selectedQuestions.some((q) => q.is_active);

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
        sx={{ mb: 1 }}
      />

      {/* Filter Chips */}
      <TeacherFilterBar
        difficulty={difficulty}
        category={category}
        examRelevance={examRelevance}
        questionStatus={questionStatus}
        total={total}
        loading={loading}
        onDifficultyChange={setDifficulty}
        onCategoryChange={setCategory}
        onExamRelevanceChange={setExamRelevance}
        onQuestionStatusChange={setQuestionStatus}
      />

      {/* Bulk Action Bar */}
      {someSelected && (
        <Paper
          sx={{
            p: 1.5,
            mb: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            bgcolor: 'primary.50',
            border: '1px solid',
            borderColor: 'primary.200',
            flexWrap: 'wrap',
          }}
        >
          <Typography variant="body2" fontWeight={600} sx={{ mr: 1 }}>
            {selectedIds.size} selected
          </Typography>
          {canActivate && (
            <Button
              size="small"
              variant="contained"
              color="success"
              disabled={bulkLoading}
              onClick={() => handleBulkAction('activate')}
              sx={{ textTransform: 'none', minHeight: 36 }}
            >
              {bulkLoading ? 'Updating...' : 'Activate for Students'}
            </Button>
          )}
          {canDeactivate && (
            <Button
              size="small"
              variant="outlined"
              color="warning"
              disabled={bulkLoading}
              onClick={() => handleBulkAction('deactivate')}
              sx={{ textTransform: 'none', minHeight: 36 }}
            >
              Deactivate
            </Button>
          )}
          <Button
            size="small"
            variant="text"
            onClick={() => setSelectedIds(new Set())}
            sx={{ textTransform: 'none', ml: 'auto' }}
          >
            Clear
          </Button>
        </Paper>
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
          {/* Select All Row */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.5 }}>
            <Checkbox
              size="small"
              checked={allSelected}
              indeterminate={someSelected && !allSelected}
              onChange={toggleSelectAll}
              sx={{ p: 0.5 }}
            />
            <Typography variant="caption" color="text.secondary">
              {allSelected ? 'Deselect all' : 'Select all'} ({questions.length})
            </Typography>
          </Box>

          {questions.map((q) => {
            const isSelected = selectedIds.has(q.id);
            const isActive = q.is_active && q.status === 'active';
            const hasAnswer = ['answer_keyed', 'complete', 'active'].includes(q.status);

            return (
              <Paper
                key={q.id}
                variant="outlined"
                sx={{
                  p: { xs: 1.5, md: 2 },
                  cursor: 'pointer',
                  borderColor: isSelected ? 'primary.main' : undefined,
                  bgcolor: isSelected ? 'primary.50' : undefined,
                  '&:hover': { bgcolor: isSelected ? 'primary.50' : 'action.hover' },
                }}
              >
                <Box sx={{ display: 'flex', gap: 1 }}>
                  {/* Checkbox */}
                  <Checkbox
                    size="small"
                    checked={isSelected}
                    onChange={() => toggleSelect(q.id)}
                    onClick={(e) => e.stopPropagation()}
                    sx={{ p: 0.5, alignSelf: 'flex-start', mt: 0.25 }}
                  />

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {/* Question text */}
                    <Box
                      sx={{
                        mb: 1,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {q.question_text ? (
                        <MathText text={q.question_text} variant="body2" />
                      ) : (
                        <Typography variant="body2">
                          {q.nta_question_id ? `NTA ID: ${q.nta_question_id}` : 'Image-based question'}
                        </Typography>
                      )}
                    </Box>

                    {/* Source badges */}
                    <Box sx={{ mb: 0.75 }}>
                      <SourceBadges sources={q.sources} />
                    </Box>

                    {/* Bottom row */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                      <DifficultyChip difficulty={q.difficulty} size="small" />
                      <CategoryChips categories={q.categories.slice(0, 2)} size="small" />

                      {q.status && q.status !== 'active' && (
                        <Chip
                          label={QB_QUESTION_STATUS_LABELS[q.status as keyof typeof QB_QUESTION_STATUS_LABELS] || q.status}
                          size="small"
                          sx={{
                            height: 22,
                            fontSize: '0.65rem',
                            bgcolor: (QB_QUESTION_STATUS_COLORS[q.status as keyof typeof QB_QUESTION_STATUS_COLORS] || '#999') + '20',
                            color: QB_QUESTION_STATUS_COLORS[q.status as keyof typeof QB_QUESTION_STATUS_COLORS] || '#999',
                            fontWeight: 600,
                          }}
                        />
                      )}

                      <Box sx={{ flexGrow: 1 }} />

                      {/* Actions */}
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/teacher/question-bank/questions/${q.id}/edit`);
                        }}
                        sx={{ minWidth: 40, minHeight: 40 }}
                        title="Edit"
                      >
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>

                      {/* Visibility Toggle - Switch with label */}
                      <Tooltip
                        title={
                          !hasAnswer
                            ? 'Add answer key before activating'
                            : isActive
                              ? 'Visible to students — click to hide'
                              : 'Hidden from students — click to show'
                        }
                        arrow
                      >
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.25,
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Switch
                            size="small"
                            checked={isActive}
                            disabled={!hasAnswer}
                            onChange={() => handleToggleActive(q.id, q.is_active)}
                            color="success"
                            sx={{
                              '& .MuiSwitch-thumb': { width: 14, height: 14 },
                              '& .MuiSwitch-switchBase': { padding: '7px' },
                              '& .MuiSwitch-track': { borderRadius: 8 },
                            }}
                          />
                          <Typography
                            variant="caption"
                            sx={{
                              fontSize: '0.6rem',
                              color: isActive ? 'success.main' : 'text.disabled',
                              fontWeight: 600,
                              minWidth: 28,
                            }}
                          >
                            {isActive ? 'Live' : 'Off'}
                          </Typography>
                        </Box>
                      </Tooltip>
                    </Box>
                  </Box>
                </Box>
              </Paper>
            );
          })}

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
