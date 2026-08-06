'use client';

/**
 * A student builds their own practice paper.
 *
 * Same primitives as the teacher builder (filter the bank, select, compose), but
 * scoped to the student: the paper is theirs, filed in their own folder tree,
 * and published to them immediately.
 *
 * This lives under Tests rather than inside the question bank on purpose. The
 * bank is where questions are; Tests is where papers are. A student looking for
 * "the thing I practise with" should only ever have to learn one place.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Paper,
  TextField,
  MenuItem,
  Chip,
  Skeleton,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  InputAdornment,
} from '@neram/ui';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import RadioButtonUncheckedOutlinedIcon from '@mui/icons-material/RadioButtonUncheckedOutlined';
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import TagPicker from '@/components/question-bank/TagPicker';
import QuestionPreviewText from '@/components/question-bank/QuestionPreviewText';
import { MAX_STUDENT_TEST_QUESTIONS } from '@/lib/test-limits';

const PAGE_SIZE = 20;
/** The one ceiling, shared with the question bank's builder and with the API. */
const MAX_QUESTIONS = MAX_STUDENT_TEST_QUESTIONS;

interface BankQuestion {
  id: string;
  question_text: string | null;
  difficulty: string;
  exam_relevance: string;
  tags?: Array<{ id: string; label: string }>;
}

interface StudentFolder {
  id: string;
  name: string;
  children: StudentFolder[];
}

export default function StudentTestBuilderPage() {
  const router = useRouter();
  const { getToken, activeClassroom, loading: authLoading } = useNexusAuthContext() as any;

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [difficulty, setDifficulty] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [questions, setQuestions] = useState<BankQuestion[] | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<Map<string, BankQuestion>>(new Map());

  const [folders, setFolders] = useState<StudentFolder[]>([]);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [folderId, setFolderId] = useState('');
  const [timer, setTimer] = useState<'none' | 'full'>('none');
  const [minutes, setMinutes] = useState(20);
  const [creating, setCreating] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const authFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init?.headers || {}),
        },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Request failed');
      }
      return res.json();
    },
    [getToken],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(0);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadFolders = useCallback(async () => {
    try {
      const json = await authFetch('/api/test-folders');
      setFolders(json.data?.tree || []);
    } catch {
      // Folders are optional. A student can build a paper without filing it.
    }
  }, [authFetch]);

  useEffect(() => {
    if (authLoading) return;
    loadFolders();
  }, [authLoading, loadFolders]);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      if (page === 0) setQuestions(null);
      try {
        const params = new URLSearchParams();
        params.set('page', String(page + 1));
        params.set('page_size', String(PAGE_SIZE));
        if (debounced) params.set('search', debounced);
        if (difficulty.length) params.set('difficulty', difficulty.join(','));
        if (tagIds.length) params.set('tag_ids', tagIds.join(','));
        // classroom_id, not classroom. The route reads the long name, so the
        // short one meant every request arrived with no classroom at all and
        // came back 400 "classroom_id is required" (NXS-0114).
        if (activeClassroom?.id) params.set('classroom_id', activeClassroom.id);

        const json = await authFetch(`/api/question-bank/questions?${params.toString()}`);
        if (cancelled) return;
        const rows: BankQuestion[] = json.data?.questions || json.questions || [];
        setQuestions((prev) => (page === 0 || !prev ? rows : [...prev, ...rows]));
        setHasMore(rows.length === PAGE_SIZE);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load questions');
          setQuestions([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, page, debounced, difficulty, tagIds, activeClassroom?.id, authFetch]);

  const flatFolders = useMemo(() => {
    const out: Array<{ id: string; label: string }> = [];
    const walk = (nodes: StudentFolder[], prefix: string) => {
      for (const n of nodes) {
        const label = prefix ? `${prefix} > ${n.name}` : n.name;
        out.push({ id: n.id, label });
        walk(n.children || [], label);
      }
    };
    walk(folders, '');
    return out;
  }, [folders]);

  function toggle(q: BankQuestion) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(q.id)) next.delete(q.id);
      else if (next.size < MAX_QUESTIONS) next.set(q.id, q);
      else setToast(`A practice test tops out at ${MAX_QUESTIONS} questions.`);
      return next;
    });
  }

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      const json = await authFetch('/api/test-folders', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setNewFolderOpen(false);
      setNewFolderName('');
      await loadFolders();
      setFolderId(json.data?.id || '');
      setToast(`Folder "${name}" created.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the folder');
    }
  }

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const json = await authFetch('/api/question-bank/custom-tests', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          question_ids: [...selected.keys()],
          timer_type: timer,
          duration_minutes: timer === 'full' ? minutes : null,
          classroom_id: activeClassroom?.id ?? null,
          folder_id: folderId || null,
          // How this paper was found. This builder only offers search, difficulty
          // and topic, so the other keys stay absent rather than being sent as
          // nulls: a teacher reading the row should see what was set, not a form
          // full of blanks. Selection is always manual here, there is no sweep.
          source_filters: {
            difficulty,
            topic_ids: tagIds,
            search_text: debounced || null,
            selection: 'manual',
          },
        }),
      });
      router.push(`/student/tests/take?test_id=${json.data.test_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the test');
      setCreating(false);
    }
  }

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2, maxWidth: 800, mx: 'auto', pb: 12 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
        <IconButton onClick={() => router.push('/student/tests')} aria-label="Back to tests" sx={{ minWidth: 44, minHeight: 44 }}>
          <ArrowBackOutlinedIcon />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            Build a practice test
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Pick the questions you want to drill, up to {MAX_QUESTIONS}
          </Typography>
        </Box>
      </Box>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
        <TextField
          size="small"
          fullWidth
          label="Search questions"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlinedIcon sx={{ fontSize: 18 }} />
              </InputAdornment>
            ),
          }}
          sx={{ mb: 1.5 }}
        />
        <ToggleButtonGroup
          size="small"
          value={difficulty}
          onChange={(_, v) => {
            setDifficulty(v as string[]);
            setPage(0);
          }}
          sx={{ mb: 1.5, flexWrap: 'wrap' }}
        >
          {['EASY', 'MEDIUM', 'HARD'].map((d) => (
            <ToggleButton key={d} value={d} sx={{ textTransform: 'none', px: 1.75, minHeight: 40 }}>
              {d.charAt(0) + d.slice(1).toLowerCase()}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <TagPicker
          value={tagIds}
          onChange={(ids) => {
            setTagIds(ids);
            setPage(0);
          }}
          getToken={getToken}
          label="Filter by topic"
        />
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {questions === null ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={72} sx={{ borderRadius: 1.5 }} />
          ))}
        </Box>
      ) : questions.length === 0 ? (
        <Paper variant="outlined" sx={{ py: 5, px: 3, textAlign: 'center', borderRadius: 2 }}>
          <Typography variant="body2" color="text.secondary">
            No question matches those filters. Try widening them.
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {questions.map((q) => {
            const isSelected = selected.has(q.id);
            return (
              <Paper
                key={q.id}
                variant="outlined"
                onClick={() => toggle(q)}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle(q);
                  }
                }}
                sx={{
                  p: 1.5,
                  borderRadius: 1.5,
                  display: 'flex',
                  gap: 1.5,
                  alignItems: 'flex-start',
                  cursor: 'pointer',
                  minHeight: 64,
                  borderColor: isSelected ? 'primary.main' : 'divider',
                  bgcolor: isSelected ? 'action.selected' : 'transparent',
                  transition: 'border-color 150ms ease, background-color 150ms ease',
                  '&:hover': { borderColor: 'primary.main' },
                }}
              >
                <Box sx={{ color: isSelected ? 'primary.main' : 'text.disabled', display: 'flex', mt: 0.25 }}>
                  {isSelected ? <CheckCircleOutlinedIcon /> : <RadioButtonUncheckedOutlinedIcon />}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <QuestionPreviewText text={q.question_text} sx={{ mb: 0.5 }} />
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    <Chip size="small" variant="outlined" label={q.difficulty} sx={{ height: 20, fontSize: '0.68rem' }} />
                    {(q.tags || []).slice(0, 3).map((t) => (
                      <Chip key={t.id} size="small" label={t.label} sx={{ height: 20, fontSize: '0.68rem' }} />
                    ))}
                  </Box>
                </Box>
              </Paper>
            );
          })}
          {hasMore && (
            <Button onClick={() => setPage((p) => p + 1)} sx={{ textTransform: 'none', minHeight: 44 }}>
              Load more
            </Button>
          )}
        </Box>
      )}

      {selected.size > 0 && (
        <Paper
          elevation={8}
          sx={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            p: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            zIndex: 1100,
            borderRadius: 0,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700, flex: 1 }}>
            {selected.size} selected
          </Typography>
          <Button onClick={() => setSelected(new Map())} sx={{ textTransform: 'none', minHeight: 44 }}>
            Clear
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              if (!title.trim()) setTitle(`My practice test (${selected.size})`);
              setCreateOpen(true);
            }}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Create test
          </Button>
        </Paper>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Name your test</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField label="Test name" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth size="small" />
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
              <TextField
                select
                label="Folder"
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                size="small"
                sx={{ flex: 1 }}
                helperText="Optional, keeps your tests tidy"
              >
                <MenuItem value="">No folder</MenuItem>
                {flatFolders.map((f) => (
                  <MenuItem key={f.id} value={f.id}>
                    {f.label}
                  </MenuItem>
                ))}
              </TextField>
              <IconButton
                aria-label="New folder"
                onClick={() => setNewFolderOpen(true)}
                sx={{ minWidth: 44, minHeight: 44, mt: 0.5 }}
              >
                <CreateNewFolderOutlinedIcon />
              </IconButton>
            </Box>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={timer}
              onChange={(_, v) => v && setTimer(v)}
              sx={{ flexWrap: 'wrap' }}
            >
              <ToggleButton value="none" sx={{ textTransform: 'none', px: 2, minHeight: 40 }}>
                No timer
              </ToggleButton>
              <ToggleButton value="full" sx={{ textTransform: 'none', px: 2, minHeight: 40 }}>
                Timed
              </ToggleButton>
            </ToggleButtonGroup>
            {timer === 'full' && (
              <TextField
                label="Minutes"
                type="number"
                value={minutes}
                onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))}
                size="small"
                inputProps={{ min: 1, inputMode: 'numeric' }}
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)} sx={{ textTransform: 'none', minHeight: 44 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={create}
            disabled={creating || !title.trim()}
            startIcon={creating ? <CircularProgress size={15} color="inherit" /> : undefined}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Start it
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={newFolderOpen} onClose={() => setNewFolderOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>New folder</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Folder name"
            placeholder="Weak topics"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createFolder()}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewFolderOpen(false)} sx={{ textTransform: 'none', minHeight: 44 }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={createFolder} disabled={!newFolderName.trim()} sx={{ textTransform: 'none', minHeight: 44 }}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={3500} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity="info" variant="filled" onClose={() => setToast(null)}>
          {toast}
        </Alert>
      </Snackbar>
    </Box>
  );
}
