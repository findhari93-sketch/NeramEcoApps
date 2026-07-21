'use client';

// NOTE: this route is /teacher/tests/new, NOT /teacher/tests/build, on purpose.
// The repo root .gitignore has a bare `build` pattern (line 13) that swallows ANY
// folder named build, so a build/ route folder silently never gets committed.

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  ToggleButton,
  ToggleButtonGroup,
  Checkbox,
  Chip,
  Skeleton,
  Paper,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Switch,
  Snackbar,
  Alert,
  CircularProgress,
  Divider,
} from '@neram/ui';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import PlaylistAddCheckOutlinedIcon from '@mui/icons-material/PlaylistAddCheckOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import TagPicker from '@/components/question-bank/TagPicker';
import type { NexusQBQuestionListItem, QBDifficulty } from '@neram/database';

const DIFFICULTIES: QBDifficulty[] = ['EASY', 'MEDIUM', 'HARD'];
const DIFF_COLOR: Record<string, 'success' | 'warning' | 'error'> = { EASY: 'success', MEDIUM: 'warning', HARD: 'error' };
const PAGE_SIZE = 20;

type TimerType = 'none' | 'full' | 'per_question';

export default function TestBuilderPage() {
  const router = useRouter();
  const { getToken, isTeacher, activeClassroom } = useNexusAuthContext();

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [exam, setExam] = useState<'' | 'JEE' | 'NATA' | 'BOTH'>('');
  const [difficulty, setDifficulty] = useState<QBDifficulty[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);

  // Results
  const [questions, setQuestions] = useState<NexusQBQuestionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Selection (persists across pages/filters)
  const [selected, setSelected] = useState<Map<string, NexusQBQuestionListItem>>(new Map());

  // Create/place dialog
  const [dialogPhase, setDialogPhase] = useState<null | 'form' | 'place'>(null);
  const [title, setTitle] = useState('');
  const [timerType, setTimerType] = useState<TimerType>('none');
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [perQuestionSeconds, setPerQuestionSeconds] = useState<number>(60);
  const [passingPctInput, setPassingPctInput] = useState<number>(70);
  const [publish, setPublish] = useState(true);
  const [availableFrom, setAvailableFrom] = useState('');
  const [availableUntil, setAvailableUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [createdTestId, setCreatedTestId] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const buildQuery = useCallback(
    (pageNum: number) => {
      const p = new URLSearchParams();
      p.set('page', String(pageNum));
      p.set('page_size', String(PAGE_SIZE));
      p.set('question_status', 'active');
      if (exam) p.set('exam_relevance', exam);
      if (difficulty.length) p.set('difficulty', difficulty.join(','));
      if (tagIds.length) p.set('tag_ids', tagIds.join(','));
      if (debouncedSearch.trim()) p.set('search', debouncedSearch.trim());
      return p.toString();
    },
    [exam, difficulty, tagIds, debouncedSearch],
  );

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(`/api/question-bank/questions?${buildQuery(pageNum)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to load questions');
        const json = await res.json();
        const list: NexusQBQuestionListItem[] = json.data?.questions || [];
        setTotal(json.data?.total || 0);
        setQuestions((prev) => (append ? [...prev, ...list] : list));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load questions');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [getToken, buildQuery],
  );

  // Refetch on filter change (reset to page 1)
  useEffect(() => {
    setPage(1);
    fetchPage(1, false);
  }, [fetchPage]);

  function toggle(q: NexusQBQuestionListItem) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(q.id)) next.delete(q.id);
      else next.set(q.id, q);
      return next;
    });
  }

  function loadMore() {
    const next = page + 1;
    setPage(next);
    fetchPage(next, true);
  }

  function openCreate() {
    if (selected.size === 0) return;
    setTitle('');
    setCreatedTestId(null);
    setDialogPhase('form');
  }

  async function createTest() {
    if (!title.trim() || selected.size === 0) return;
    setBusy(true);
    try {
      const token = await getToken();
      if (!token) return;
      const questionIds = [...selected.keys()];
      // 1 mark per question, so pass marks = pass% of the question count.
      const passingMarks = Math.round((passingPctInput / 100) * questionIds.length);
      const res = await fetch('/api/question-bank/tests', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          question_ids: questionIds,
          timer_type: timerType,
          duration_minutes: timerType === 'full' ? durationMinutes : null,
          per_question_seconds: timerType === 'per_question' ? perQuestionSeconds : null,
          passing_marks: passingMarks,
          is_published: publish,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create test');
      const json = await res.json();
      setCreatedTestId(json.data.test_id);
      setDialogPhase('place');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create test');
    } finally {
      setBusy(false);
    }
  }

  async function place(contextType: 'classroom_assignment' | 'student_practice') {
    if (!createdTestId || !activeClassroom) return;
    setBusy(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/question-bank/tests/${createdTestId}/placements`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context_type: contextType,
          context_id: activeClassroom.id,
          passing_pct: passingPctInput,
          available_from: availableFrom ? new Date(availableFrom).toISOString() : null,
          available_until: availableUntil ? new Date(availableUntil).toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to place test');
      finishFlow(contextType === 'classroom_assignment' ? 'Test assigned to the class' : 'Test added to the practice pool');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place test');
      setBusy(false);
    }
  }

  function finishFlow(message: string) {
    setBusy(false);
    setDialogPhase(null);
    setSelected(new Map());
    setToast(message);
  }

  if (!isTeacher) {
    return (
      <Box sx={{ px: { xs: 2, md: 3 }, py: 6, textAlign: 'center' }}>
        <Typography color="text.secondary">Only teachers can build tests.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2, pb: 12, maxWidth: 900, mx: 'auto' }}>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 0.5 }}>
        Build a test
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Filter the question bank, pick the questions you want, then assign the test to your class. Nothing is copied, the test reuses bank questions.
      </Typography>

      {/* Filters */}
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 2 }}>
        <Stack spacing={1.5}>
          <TextField
            size="small"
            fullWidth
            placeholder="Search question text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{ startAdornment: <SearchOutlinedIcon fontSize="small" sx={{ mr: 1, color: 'text.disabled' }} /> }}
          />
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel id="exam">Exam</InputLabel>
              <Select labelId="exam" label="Exam" value={exam} onChange={(e) => setExam(e.target.value as any)}>
                <MenuItem value="">All</MenuItem>
                <MenuItem value="JEE">JEE</MenuItem>
                <MenuItem value="NATA">NATA</MenuItem>
                <MenuItem value="BOTH">Both</MenuItem>
              </Select>
            </FormControl>
            <ToggleButtonGroup
              size="small"
              value={difficulty}
              onChange={(_, v) => setDifficulty(v)}
              aria-label="difficulty"
            >
              {DIFFICULTIES.map((d) => (
                <ToggleButton key={d} value={d} sx={{ textTransform: 'none', px: 1.5 }}>
                  {d[0] + d.slice(1).toLowerCase()}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
          <TagPicker value={tagIds} onChange={setTagIds} getToken={getToken} label="Filter by tags" />
        </Stack>
      </Paper>

      {/* Results header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {loading ? 'Loading.' : `${total} question${total === 1 ? '' : 's'}`}
        </Typography>
        {selected.size > 0 && (
          <Button size="small" onClick={() => setSelected(new Map())} sx={{ textTransform: 'none' }}>
            Clear selection
          </Button>
        )}
      </Box>

      {/* Question list */}
      {loading ? (
        <Stack spacing={1}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} variant="rounded" height={72} sx={{ borderRadius: 2 }} />
          ))}
        </Stack>
      ) : questions.length === 0 ? (
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <Typography color="text.secondary">No questions match these filters.</Typography>
        </Box>
      ) : (
        <Stack spacing={1}>
          {questions.map((q) => {
            const isSel = selected.has(q.id);
            return (
              <Paper
                key={q.id}
                variant="outlined"
                onClick={() => toggle(q)}
                sx={{
                  p: 1.25,
                  borderRadius: 2,
                  cursor: 'pointer',
                  display: 'flex',
                  gap: 1,
                  alignItems: 'flex-start',
                  borderColor: isSel ? 'primary.main' : 'divider',
                  bgcolor: isSel ? 'action.selected' : 'background.paper',
                  transition: 'border-color 150ms, background-color 150ms',
                  '&:hover': { borderColor: 'primary.light' },
                }}
              >
                <Checkbox checked={isSel} tabIndex={-1} size="small" sx={{ p: 0.5, mt: -0.25 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                  >
                    {q.question_text || '(image-based question)'}
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
                    <Chip size="small" label={q.difficulty} color={DIFF_COLOR[q.difficulty]} variant="outlined" sx={{ height: 20 }} />
                    <Chip size="small" label={q.exam_relevance} variant="outlined" sx={{ height: 20 }} />
                    {q.categories?.slice(0, 2).map((c) => (
                      <Chip key={c} size="small" label={c.replace(/_/g, ' ')} sx={{ height: 20 }} />
                    ))}
                  </Box>
                </Box>
              </Paper>
            );
          })}
          {questions.length < total && (
            <Button onClick={loadMore} disabled={loadingMore} sx={{ textTransform: 'none', alignSelf: 'center', mt: 1 }}>
              {loadingMore ? <CircularProgress size={18} /> : `Load more (${questions.length}/${total})`}
            </Button>
          )}
        </Stack>
      )}

      {/* Sticky selection bar */}
      {selected.size > 0 && (
        <Paper
          elevation={8}
          sx={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 30,
            px: { xs: 2, md: 3 },
            py: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            borderRadius: 0,
          }}
        >
          <PlaylistAddCheckOutlinedIcon color="primary" />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
            {selected.size} selected
          </Typography>
          <Button variant="contained" onClick={openCreate} sx={{ textTransform: 'none', minHeight: 44 }}>
            Create test
          </Button>
        </Paper>
      )}

      {/* Create + place dialog */}
      <Dialog open={dialogPhase !== null} onClose={() => !busy && setDialogPhase(null)} fullWidth maxWidth="xs">
        {dialogPhase === 'form' && (
          <>
            <DialogTitle sx={{ fontWeight: 700 }}>New test ({selected.size} questions)</DialogTitle>
            <DialogContent>
              <Stack spacing={2.5} sx={{ mt: 0.5 }}>
                <TextField
                  autoFocus
                  fullWidth
                  size="small"
                  label="Test title"
                  placeholder="e.g. Weekend revision, History of Architecture"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <FormControl size="small" fullWidth>
                  <InputLabel id="timer">Timing</InputLabel>
                  <Select labelId="timer" label="Timing" value={timerType} onChange={(e) => setTimerType(e.target.value as TimerType)}>
                    <MenuItem value="none">Untimed</MenuItem>
                    <MenuItem value="full">Whole-test timer</MenuItem>
                    <MenuItem value="per_question">Per-question timer</MenuItem>
                  </Select>
                </FormControl>
                {timerType === 'full' && (
                  <TextField size="small" type="number" label="Duration (minutes)" value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value) || 0)} />
                )}
                {timerType === 'per_question' && (
                  <TextField size="small" type="number" label="Seconds per question" value={perQuestionSeconds} onChange={(e) => setPerQuestionSeconds(Number(e.target.value) || 0)} />
                )}
                <TextField size="small" type="number" label="Pass %" value={passingPctInput} onChange={(e) => setPassingPctInput(Math.max(1, Math.min(100, Number(e.target.value) || 0)))} />
                <FormControlLabel
                  control={<Switch checked={publish} onChange={(e) => setPublish(e.target.checked)} />}
                  label={publish ? 'Published (visible once placed)' : 'Hidden (draft)'}
                />
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={() => setDialogPhase(null)} disabled={busy} sx={{ textTransform: 'none' }}>
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={createTest}
                disabled={busy || !title.trim()}
                startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
                sx={{ textTransform: 'none', minHeight: 40 }}
              >
                Create
              </Button>
            </DialogActions>
          </>
        )}

        {dialogPhase === 'place' && (
          <>
            <DialogTitle sx={{ fontWeight: 700 }}>Test created</DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Where should this go? You can also place it later from the Tests page.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
                <TextField
                  size="small"
                  fullWidth
                  type="datetime-local"
                  label="Opens (optional)"
                  value={availableFrom}
                  onChange={(e) => setAvailableFrom(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  size="small"
                  fullWidth
                  type="datetime-local"
                  label="Due (optional)"
                  value={availableUntil}
                  onChange={(e) => setAvailableUntil(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Stack>
              <Stack spacing={1.5} divider={<Divider flexItem />}>
                <Box>
                  <Button
                    fullWidth
                    variant="contained"
                    disabled={busy || !activeClassroom}
                    onClick={() => place('classroom_assignment')}
                    sx={{ textTransform: 'none', minHeight: 44 }}
                  >
                    Assign to {activeClassroom?.name || 'this class'}
                  </Button>
                  <Typography variant="caption" color="text.secondary">
                    Everyone in the class must complete it.
                  </Typography>
                </Box>
                <Box>
                  <Button
                    fullWidth
                    variant="outlined"
                    disabled={busy || !activeClassroom}
                    onClick={() => place('student_practice')}
                    sx={{ textTransform: 'none', minHeight: 44 }}
                  >
                    Add to practice pool
                  </Button>
                  <Typography variant="caption" color="text.secondary">
                    Optional self-practice for students.
                  </Typography>
                </Box>
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={() => finishFlow('Test saved to repository')} disabled={busy} sx={{ textTransform: 'none' }}>
                Later
              </Button>
              <Button onClick={() => router.push('/teacher/tests')} disabled={busy} sx={{ textTransform: 'none' }}>
                Done
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} sx={{ mb: 8 }}>
        <Alert severity="success" variant="filled" onClose={() => setToast(null)}>
          {toast}
        </Alert>
      </Snackbar>
      <Snackbar open={Boolean(error)} autoHideDuration={4000} onClose={() => setError(null)}>
        <Alert severity="error" variant="filled" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
}
