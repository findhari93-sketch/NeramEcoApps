'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  IconButton,
  TextField,
  Chip,
  Paper,
  Stack,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  Snackbar,
  CircularProgress,
  Divider,
} from '@neram/ui';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import MathText from '@/components/common/MathText';

interface DetailTest {
  id: string;
  title: string;
  description: string | null;
  test_type: string;
  duration_minutes: number | null;
  per_question_seconds: number | null;
  total_marks: number | null;
  passing_marks: number | null;
  is_published: boolean;
  is_repository: boolean;
  created_from: string | null;
}

interface DetailQuestion {
  test_question_id: string;
  question_id: string;
  question_text: string | null;
  question_image_url: string | null;
  question_format: string;
  options: Array<{ id?: string; label?: string; text?: string; image_url?: string }> | null;
  marks: number;
  sort_order: number;
  correct_answer?: string | null;
}

interface DetailPlacement {
  id: string;
  context_type: string;
  context_id: string;
  passing_pct: number | null;
  is_visible: boolean;
  available_from: string | null;
  available_until: string | null;
}

const CONTEXT_LABELS: Record<string, string> = {
  classroom_assignment: 'Assigned to class',
  student_practice: 'Practice pool',
  study_file: 'Study chapter',
  foundation_section: 'Foundation section',
  module_item: 'Module section',
  class_recap_section: 'Recap checkpoint',
};

const MIRRORED_FROM = ['foundation_migration', 'module_migration', 'recap_migration', 'study_migration'];

function timerLabel(t: DetailTest): string {
  if (t.test_type === 'timed' && t.duration_minutes) return `${t.duration_minutes} min`;
  if (t.test_type === 'per_question_timer' && t.per_question_seconds) return `${t.per_question_seconds}s / question`;
  return 'Untimed';
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

/** An option row is correct when correct_answer matches its id, its letter label, or its text. */
function isCorrectOption(
  opt: { id?: string; label?: string; text?: string },
  index: number,
  correct: string | null | undefined,
): boolean {
  if (!correct) return false;
  const c = String(correct).trim().toLowerCase();
  if (opt.id && String(opt.id).trim().toLowerCase() === c) return true;
  if (opt.label && String(opt.label).trim().toLowerCase() === c) return true;
  const letter = String.fromCharCode(97 + index);
  return c === letter;
}

export default function TestDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const testId = params?.id;
  const { getToken, isTeacher, activeClassroom } = useNexusAuthContext();

  const [test, setTest] = useState<DetailTest | null>(null);
  const [questions, setQuestions] = useState<DetailQuestion[]>([]);
  const [placements, setPlacements] = useState<DetailPlacement[]>([]);
  const [attemptsCount, setAttemptsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Dialogs
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignFrom, setAssignFrom] = useState('');
  const [assignUntil, setAssignUntil] = useState('');
  const [assignPct, setAssignPct] = useState<number>(70);

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

  const load = useCallback(async () => {
    if (!testId) return;
    setLoading(true);
    setError(null);
    try {
      const json = await authFetch(`/api/question-bank/tests/${testId}`);
      setTest(json.data.test);
      setQuestions(json.data.questions || []);
      setPlacements(json.data.placements || []);
      setAttemptsCount(json.data.attempts_count || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load test');
    } finally {
      setLoading(false);
    }
  }, [testId, authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  async function togglePublish() {
    if (!test) return;
    setBusy(true);
    try {
      const json = await authFetch(`/api/question-bank/tests/${test.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_published: !test.is_published }),
      });
      setTest((t) => (t ? { ...t, is_published: json.data.is_published } : t));
      setToast(json.data.is_published ? 'Test published' : 'Test hidden');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setBusy(false);
    }
  }

  async function saveRename() {
    if (!test || !renameValue.trim()) return;
    setBusy(true);
    try {
      const json = await authFetch(`/api/question-bank/tests/${test.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: renameValue.trim() }),
      });
      setTest((t) => (t ? { ...t, title: json.data.title } : t));
      setRenameOpen(false);
      setToast('Title updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!test) return;
    setBusy(true);
    try {
      await authFetch(`/api/question-bank/tests/${test.id}`, { method: 'DELETE' });
      setToast('Test deleted');
      router.push('/teacher/tests');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
      setBusy(false);
    }
  }

  async function addPlacement(contextType: 'classroom_assignment' | 'student_practice') {
    if (!test || !activeClassroom) return;
    setBusy(true);
    try {
      await authFetch(`/api/question-bank/tests/${test.id}/placements`, {
        method: 'POST',
        body: JSON.stringify({
          context_type: contextType,
          context_id: activeClassroom.id,
          passing_pct: assignPct,
          available_from: assignFrom ? new Date(assignFrom).toISOString() : null,
          available_until: assignUntil ? new Date(assignUntil).toISOString() : null,
        }),
      });
      setAssignOpen(false);
      setToast(contextType === 'classroom_assignment' ? 'Assigned to the class' : 'Added to the practice pool');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place test');
    } finally {
      setBusy(false);
    }
  }

  async function removePlacement(placementId: string) {
    if (!test) return;
    setBusy(true);
    try {
      await authFetch(`/api/question-bank/tests/${test.id}/placements/${placementId}`, { method: 'DELETE' });
      setPlacements((prev) => prev.filter((p) => p.id !== placementId));
      setToast('Placement removed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove placement');
    } finally {
      setBusy(false);
    }
  }

  if (!isTeacher) {
    return (
      <Box sx={{ px: { xs: 2, md: 3 }, py: 6, textAlign: 'center' }}>
        <Typography color="text.secondary">Only teachers can view test details.</Typography>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ px: { xs: 2, md: 3 }, py: 2, maxWidth: 900, mx: 'auto' }}>
        <Skeleton variant="text" width={240} height={40} />
        <Skeleton variant="rectangular" height={90} sx={{ borderRadius: 2, mb: 2, mt: 1 }} />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rectangular" height={56} sx={{ borderRadius: 1.5, mb: 1 }} />
        ))}
      </Box>
    );
  }

  if (!test) {
    return (
      <Box sx={{ px: { xs: 2, md: 3 }, py: 6, textAlign: 'center' }}>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          {error || 'Test not found.'}
        </Typography>
        <Button variant="outlined" size="small" onClick={() => router.push('/teacher/tests')} sx={{ textTransform: 'none' }}>
          Back to Tests
        </Button>
      </Box>
    );
  }

  const isMirrored = !!test.created_from && MIRRORED_FROM.includes(test.created_from);

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2, maxWidth: 900, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, mb: 1 }}>
        <IconButton onClick={() => router.push('/teacher/tests')} aria-label="Back to tests" sx={{ mt: 0.25 }}>
          <ArrowBackOutlinedIcon />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 700, lineHeight: 1.25, wordBreak: 'break-word' }}>
              {test.title}
            </Typography>
            <IconButton
              size="small"
              aria-label="Rename test"
              onClick={() => {
                setRenameValue(test.title);
                setRenameOpen(true);
              }}
            >
              <EditOutlinedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>
          {test.description && (
            <Typography variant="body2" color="text.secondary">
              {test.description}
            </Typography>
          )}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
            <Chip
              size="small"
              label={test.is_published ? 'Published' : 'Hidden'}
              color={test.is_published ? 'success' : 'default'}
              variant={test.is_published ? 'filled' : 'outlined'}
            />
            <Chip size="small" variant="outlined" label={timerLabel(test)} />
            <Chip size="small" variant="outlined" label={`${questions.length} Q`} />
            {test.total_marks != null && <Chip size="small" variant="outlined" label={`${test.total_marks} marks`} />}
            {test.passing_marks != null && <Chip size="small" variant="outlined" label={`Pass: ${test.passing_marks}`} />}
            <Chip size="small" variant="outlined" label={`${attemptsCount} ${attemptsCount === 1 ? 'attempt' : 'attempts'}`} />
          </Box>
        </Box>
      </Box>

      {isMirrored && (
        <Alert severity="info" sx={{ mb: 2 }}>
          This quiz is mirrored from a legacy section. Publishing or deleting here does not change what students see
          inside Foundation, Modules or Class Recaps.
        </Alert>
      )}

      {/* Actions */}
      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={test.is_published ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
          onClick={togglePublish}
          disabled={busy}
          sx={{ textTransform: 'none', minHeight: 44 }}
        >
          {test.is_published ? 'Unpublish' : 'Publish'}
        </Button>
        <Button
          variant="contained"
          size="small"
          startIcon={<SendOutlinedIcon />}
          onClick={() => setAssignOpen(true)}
          disabled={busy || !activeClassroom}
          sx={{ textTransform: 'none', minHeight: 44 }}
        >
          Assign
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="text"
          color="error"
          size="small"
          startIcon={<DeleteOutlineOutlinedIcon />}
          onClick={() => setDeleteOpen(true)}
          disabled={busy}
          sx={{ textTransform: 'none', minHeight: 44 }}
        >
          Delete
        </Button>
      </Stack>

      {/* Placements */}
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
        Where it is used
      </Typography>
      {placements.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 3 }}>
          <Typography variant="body2" color="text.secondary">
            Not placed anywhere yet. Use Assign to give it to your class or add it to the practice pool.
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={1} sx={{ mb: 3 }}>
          {placements.map((p) => (
            <Paper
              key={p.id}
              variant="outlined"
              sx={{ p: 1.25, borderRadius: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {CONTEXT_LABELS[p.context_type] || p.context_type}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.25 }}>
                  {p.available_from && (
                    <Chip size="small" variant="outlined" label={`Opens ${fmtDateTime(p.available_from)}`} sx={{ height: 20, fontSize: '0.7rem' }} />
                  )}
                  {p.available_until && (
                    <Chip size="small" variant="outlined" label={`Due ${fmtDateTime(p.available_until)}`} sx={{ height: 20, fontSize: '0.7rem' }} />
                  )}
                  {p.passing_pct != null && (
                    <Chip size="small" variant="outlined" label={`Pass ${p.passing_pct}%`} sx={{ height: 20, fontSize: '0.7rem' }} />
                  )}
                  {!p.is_visible && <Chip size="small" label="Hidden" sx={{ height: 20, fontSize: '0.7rem' }} />}
                </Box>
              </Box>
              {(p.context_type === 'classroom_assignment' || p.context_type === 'student_practice') && (
                <IconButton
                  aria-label="Remove placement"
                  onClick={() => removePlacement(p.id)}
                  disabled={busy}
                  sx={{ minWidth: 44, minHeight: 44 }}
                >
                  <CloseOutlinedIcon sx={{ fontSize: 18 }} />
                </IconButton>
              )}
            </Paper>
          ))}
        </Stack>
      )}

      {/* Questions */}
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
        Questions
      </Typography>
      {questions.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No questions found for this test.
        </Typography>
      ) : (
        <Box sx={{ mb: 4 }}>
          {questions.map((q, idx) => (
            <Accordion key={q.test_question_id} disableGutters variant="outlined" sx={{ borderRadius: 1.5, mb: 0.75, '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreOutlinedIcon />} sx={{ minHeight: 48 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, pr: 1 }}>
                  <Chip size="small" label={idx + 1} sx={{ height: 22, fontWeight: 700, flexShrink: 0 }} />
                  <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
                    {q.question_text || '(image-based question)'}
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                {q.question_text && (
                  <Typography variant="body2" component="div" sx={{ mb: 1 }}>
                    <MathText text={q.question_text} />
                  </Typography>
                )}
                {q.question_image_url && (
                  <Box
                    component="img"
                    src={q.question_image_url}
                    alt="Question"
                    sx={{ maxWidth: '100%', borderRadius: 1, mb: 1 }}
                  />
                )}
                {Array.isArray(q.options) && q.options.length > 0 ? (
                  <Stack spacing={0.5}>
                    {q.options.map((opt, oi) => {
                      const correct = isCorrectOption(opt, oi, q.correct_answer);
                      return (
                        <Box
                          key={opt.id || opt.label || oi}
                          sx={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 1,
                            p: 0.75,
                            borderRadius: 1,
                            bgcolor: correct ? 'success.light' : 'transparent',
                            border: '1px solid',
                            borderColor: correct ? 'success.main' : 'divider',
                          }}
                        >
                          {correct ? (
                            <CheckCircleOutlinedIcon color="success" sx={{ fontSize: 18, mt: 0.25 }} />
                          ) : (
                            <Box sx={{ width: 18, flexShrink: 0 }} />
                          )}
                          <Typography variant="body2" component="div" sx={{ minWidth: 0 }}>
                            <MathText text={opt.text || opt.label || ''} />
                          </Typography>
                        </Box>
                      );
                    })}
                  </Stack>
                ) : (
                  q.correct_answer != null && (
                    <Typography variant="body2">
                      Answer: <b>{q.correct_answer}</b>
                    </Typography>
                  )
                )}
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  {q.marks} {q.marks === 1 ? 'mark' : 'marks'}
                </Typography>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      )}

      {/* Rename dialog */}
      <Dialog open={renameOpen} onClose={() => !busy && setRenameOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>Rename test</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Test title"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            sx={{ mt: 0.5 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRenameOpen(false)} disabled={busy} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={saveRename} disabled={busy || !renameValue.trim()} sx={{ textTransform: 'none' }}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={deleteOpen} onClose={() => !busy && setDeleteOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>Delete this test?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            The test and its placements are removed for students. Attempt history is kept.
            {isMirrored && ' The original quiz inside its legacy section is not affected.'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteOpen(false)} disabled={busy} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={confirmDelete}
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ textTransform: 'none' }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Assign dialog */}
      <Dialog open={assignOpen} onClose={() => !busy && setAssignOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>Assign this test</DialogTitle>
        <DialogContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2, mt: 0.5 }}>
            <TextField
              size="small"
              fullWidth
              type="datetime-local"
              label="Opens (optional)"
              value={assignFrom}
              onChange={(e) => setAssignFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              size="small"
              fullWidth
              type="datetime-local"
              label="Due (optional)"
              value={assignUntil}
              onChange={(e) => setAssignUntil(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
          <TextField
            size="small"
            type="number"
            label="Pass %"
            value={assignPct}
            onChange={(e) => setAssignPct(Math.max(1, Math.min(100, Number(e.target.value) || 0)))}
            sx={{ mb: 2, width: 120 }}
          />
          <Stack spacing={1.5} divider={<Divider flexItem />}>
            <Box>
              <Button
                fullWidth
                variant="contained"
                disabled={busy || !activeClassroom}
                onClick={() => addPlacement('classroom_assignment')}
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
                onClick={() => addPlacement('student_practice')}
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
          <Button onClick={() => setAssignOpen(false)} disabled={busy} sx={{ textTransform: 'none' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" onClose={() => setToast(null)}>
          {toast}
        </Alert>
      </Snackbar>
      <Snackbar open={Boolean(error) && !loading && !!test} autoHideDuration={4000} onClose={() => setError(null)}>
        <Alert severity="error" variant="filled" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
}
