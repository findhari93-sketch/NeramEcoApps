'use client';

/**
 * One test, laid out like a form: Questions, Students, Settings.
 *
 * It used to be Overview (the 150 questions, the runs, the paper's origin and
 * six buttons) and Results, which held two more tabs, one of which listed the
 * same 150 questions again under four stat cards. A teacher had to go three
 * levels in and scroll past a screen of cards to reach a question. The founder
 * asked for it to work like a Microsoft Form or a Google Form, so it does:
 *
 *   Questions  every question, with how students did on it, and the filters
 *              and AI checks that act on them
 *   Students   who sat it, filtered by the numbers at the top
 *   Settings   where it is used, where it came from, and the rarely-used rest
 *
 * The header is one line of facts and two controls (Assign, and a menu for the
 * rest), so the tab content starts near the top of the screen.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  IconButton,
  TextField,
  Chip,
  Stack,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Snackbar,
  CircularProgress,
  Divider,
  Tabs,
  Tab,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@neram/ui';
import { NEXUS_TEACHER_TEST_KINDS, type NexusTestKind } from '@neram/database';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import TestResultsPanel from '@/components/tests/TestResultsPanel';
import TestHealthPanel from '@/components/tests/TestHealthPanel';
import TestSettingsView from '@/components/tests/TestSettingsView';
import ExamScheduleDialog from '@/components/scheduled-exams/ExamScheduleDialog';
import TestQuestionEditorDialog from '@/components/tests/TestQuestionEditorDialog';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { TestOriginFacts } from '@/lib/test-origin';
import { pickDefaultRunId, resolveTestPageTab, type TestPageTab } from '@/lib/test-page-tabs';
import type { PoolQuestion } from '@/components/tests/TestQuestionsView';

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
  test_kind?: NexusTestKind | null;
  /** How many of the questions one sitting asks. null asks all of them. */
  questions_to_serve?: number | null;
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

const MIRRORED_FROM = ['foundation_migration', 'module_migration', 'recap_migration', 'study_migration'];

function timerLabel(t: DetailTest): string {
  if (t.test_type === 'timed' && t.duration_minutes) return `${t.duration_minutes} min`;
  if (t.test_type === 'per_question_timer' && t.per_question_seconds) return `${t.per_question_seconds}s per question`;
  return 'Untimed';
}

export default function TestDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const testId = params?.id;
  const { getToken, getTeacherToken, isTeacher, activeClassroom } = useNexusAuthContext();

  const [test, setTest] = useState<DetailTest | null>(null);
  /** The archived import row, or null for a test built before it existed. */
  const [origin, setOrigin] = useState<TestOriginFacts | null>(null);
  const [kindDraft, setKindDraft] = useState<NexusTestKind>('classroom_assigned');
  const [questions, setQuestions] = useState<PoolQuestion[]>([]);
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
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null);

  /**
   * Seeded from the URL, read once at first render, so `?tab=results&placement_id=`
   * (what the Conducted tab and teacher notifications link to) lands on Students
   * for that run. Reading it on every render would fight setTab.
   */
  const [tab, setTab] = useState<TestPageTab>(() => resolveTestPageTab(searchParams?.get('tab')));
  /** The run both Questions and Students report on. */
  const [runId, setRunId] = useState(searchParams?.get('placement_id') || '');
  // Lifted out of the results panel because the health banner sits above the
  // tabs, and a problem copied out of it has to name the run it happened on.
  const [runLabel, setRunLabel] = useState<string | null>(null);
  /** Whether a run has been chosen yet, by the URL or by the default. */
  const runChosen = useRef(Boolean(searchParams?.get('placement_id')));
  /**
   * Which group of students the Students tab opens on, e.g. `&filter=below_pass`.
   * The panel owns it after first render and writes its own changes back.
   */
  const [resultsFilter] = useState(searchParams?.get('filter') || '');
  const [duplicating, setDuplicating] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [examOpen, setExamOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
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

  const applyTestPayload = useCallback((data: any) => {
    setTest(data.test);
    setKindDraft(data.test?.test_kind || 'classroom_assigned');
    setQuestions(data.questions || []);
    setPlacements(data.placements || []);
    setAttemptsCount(data.attempts_count || 0);
    // The run the numbers are about, when the URL did not name one: the most
    // recent run with a roster, so the page opens on "how did my class do".
    if (!runChosen.current) {
      runChosen.current = true;
      setRunId(pickDefaultRunId(data.placements || []));
    }
  }, []);

  const load = useCallback(async () => {
    if (!testId) return;
    setLoading(true);
    setError(null);
    try {
      const json = await authFetch(`/api/question-bank/tests/${testId}`);
      applyTestPayload(json.data);

      // Provenance, without the document. Never allowed to fail the page: a
      // test whose origin was never archived is an ordinary state, and every
      // test built before that table existed is in it.
      try {
        const o = await authFetch(`/api/question-bank/tests/${testId}/import?meta=1`);
        setOrigin(o?.data ?? null);
      } catch {
        setOrigin(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load test');
    } finally {
      setLoading(false);
    }
  }, [testId, authFetch, applyTestPayload]);

  /**
   * Re-read the paper without the page skeleton.
   *
   * After a question is fixed or a run is added, the full load() would swap the
   * whole page for a skeleton and unmount the results panel mid-task, taking
   * the teacher's filters and selection with it.
   */
  const refresh = useCallback(async () => {
    if (!testId) return;
    try {
      const json = await authFetch(`/api/question-bank/tests/${testId}`);
      applyTestPayload(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not refresh the test');
    }
  }, [testId, authFetch, applyTestPayload]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep the tab and the run in the URL, so a reload or a shared link lands
  // where the teacher was. Questions is the default and stays out of the URL.
  useEffect(() => {
    if (typeof window === 'undefined' || loading) return;
    const url = new URL(window.location.href);
    if (tab === 'questions') url.searchParams.delete('tab');
    else url.searchParams.set('tab', tab);
    if (runId) url.searchParams.set('placement_id', runId);
    else url.searchParams.delete('placement_id');
    window.history.replaceState(window.history.state, '', url.toString());
  }, [tab, runId, loading]);

  /** Relabel the test. Saved immediately so the choice survives closing the dialog. */
  async function saveKind(kind: NexusTestKind) {
    if (!test) return;
    setKindDraft(kind);
    setBusy(true);
    try {
      await authFetch(`/api/question-bank/tests/${test.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ test_kind: kind }),
      });
      setTest((t) => (t ? { ...t, test_kind: kind } : t));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set the test type');
      setKindDraft(test.test_kind || 'classroom_assigned');
    } finally {
      setBusy(false);
    }
  }

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

  /**
   * Copy the paper so it can be revised without moving the ground under scores
   * students already earned. The copy lands unpublished and unplaced.
   */
  async function duplicateForEdit() {
    if (!test) return;
    setDuplicating(true);
    try {
      const json = await authFetch(`/api/question-bank/tests/${test.id}/duplicate`, { method: 'POST' });
      router.push(`/teacher/tests/${json.data.test_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not duplicate the test');
      setDuplicating(false);
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
      refresh();
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
      if (runId === placementId) setRunId('');
      setToast('Run removed');
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
        <Skeleton variant="text" width={320} height={24} />
        <Skeleton variant="rectangular" height={48} sx={{ borderRadius: 1, mb: 2, mt: 1 }} />
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="rectangular" height={64} sx={{ borderRadius: 1.5, mb: 1 }} />
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
  const pooled = test.questions_to_serve != null && test.questions_to_serve < questions.length;
  const facts = [
    timerLabel(test),
    pooled ? `Pool of ${questions.length}, ${test.questions_to_serve} per sitting` : `${questions.length} questions`,
    test.total_marks != null ? `${test.total_marks} marks` : null,
    `${attemptsCount} ${attemptsCount === 1 ? 'attempt' : 'attempts'}`,
  ].filter(Boolean);

  const menuAction = (fn: () => void) => () => {
    setMenuEl(null);
    fn();
  };

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2, maxWidth: 900, mx: 'auto' }}>
      {/* Header: one line of facts, Assign, and a menu for the rest. */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', columnGap: 1, rowGap: 0.5, mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, flex: '1 1 280px', minWidth: 0 }}>
          <IconButton onClick={() => router.push('/teacher/tests')} aria-label="Back to tests" sx={{ width: 44, height: 44 }}>
            <ArrowBackOutlinedIcon />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0, pt: 0.5 }}>
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
                sx={{ width: 36, height: 36 }}
              >
                <EditOutlinedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Box>
            {test.description && (
              <Typography variant="body2" color="text.secondary">
                {test.description}
              </Typography>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
              <Chip
                size="small"
                label={test.is_published ? 'Published' : 'Hidden'}
                color={test.is_published ? 'success' : 'default'}
                variant={test.is_published ? 'filled' : 'outlined'}
                sx={{ height: 22 }}
              />
              <Typography variant="body2" color="text.secondary">
                {facts.join(' · ')}
              </Typography>
            </Box>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto', pt: 0.25 }}>
          <Button
            variant="contained"
            startIcon={<SendOutlinedIcon />}
            onClick={() => setAssignOpen(true)}
            disabled={busy || !activeClassroom}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Assign
          </Button>
          <IconButton
            aria-label="More actions for this test"
            aria-haspopup="menu"
            onClick={(e) => setMenuEl(e.currentTarget)}
            sx={{ width: 44, height: 44 }}
          >
            <MoreVertIcon />
          </IconButton>
          <Menu
            anchorEl={menuEl}
            open={Boolean(menuEl)}
            onClose={() => setMenuEl(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            {/* Any paper in the library can be sat as an exam, not only one built
                from a question paper. One of the three doors into ExamScheduleDialog. */}
            <MenuItem onClick={menuAction(() => setExamOpen(true))} disabled={busy} sx={{ minHeight: 48 }}>
              <ListItemIcon>
                <EventAvailableOutlinedIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Schedule as exam</ListItemText>
            </MenuItem>
            <MenuItem onClick={menuAction(() => setEditorOpen(true))} disabled={busy} sx={{ minHeight: 48 }}>
              <ListItemIcon>
                <EditNoteOutlinedIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Edit questions</ListItemText>
            </MenuItem>
            <MenuItem onClick={menuAction(togglePublish)} disabled={busy} sx={{ minHeight: 48 }}>
              <ListItemIcon>
                {test.is_published ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
              </ListItemIcon>
              <ListItemText>{test.is_published ? 'Unpublish' : 'Publish'}</ListItemText>
            </MenuItem>
            {attemptsCount > 0 && (
              <MenuItem onClick={menuAction(duplicateForEdit)} disabled={busy || duplicating} sx={{ minHeight: 48 }}>
                <ListItemIcon>
                  {duplicating ? <CircularProgress size={16} /> : <ContentCopyOutlinedIcon fontSize="small" />}
                </ListItemIcon>
                <ListItemText>Duplicate to edit</ListItemText>
              </MenuItem>
            )}
            <Divider />
            <MenuItem onClick={menuAction(() => setDeleteOpen(true))} disabled={busy} sx={{ minHeight: 48, color: 'error.main' }}>
              <ListItemIcon>
                <DeleteOutlineOutlinedIcon fontSize="small" color="error" />
              </ListItemIcon>
              <ListItemText>Delete</ListItemText>
            </MenuItem>
          </Menu>
        </Box>
      </Box>

      {/* Above the tabs on purpose. If this paper is broken, that is the first
          thing a teacher needs to know. Renders nothing when nothing is wrong. */}
      <TestHealthPanel
        testId={test.id}
        testTitle={test.title}
        placementId={runId || null}
        runLabel={runLabel}
        getToken={getToken}
      />

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v as TestPageTab)}
        variant="fullWidth"
        sx={{
          mb: 2,
          borderBottom: 1,
          borderColor: 'divider',
          '& .MuiTabs-flexContainer': { maxWidth: { sm: 520 } },
          '& .MuiTab-root': { textTransform: 'none', minHeight: 48, fontWeight: 600 },
        }}
      >
        <Tab value="questions" label={`Questions (${questions.length})`} />
        <Tab value="students" label="Students" />
        <Tab value="settings" label="Settings" />
      </Tabs>

      {/* Mounted once for both tabs, so moving between Questions and Students
          costs no second fetch and keeps the filters where the teacher left them. */}
      <Box sx={{ display: tab === 'settings' ? 'none' : 'block' }}>
        <TestResultsPanel
          testId={test.id}
          authFetch={authFetch}
          getToken={getToken}
          getTeacherToken={getTeacherToken}
          view={tab === 'students' ? 'students' : 'questions'}
          runId={runId}
          onRunIdChange={setRunId}
          onRunLabelChange={setRunLabel}
          initialFilter={resultsFilter}
          testTitle={test.title}
          pool={questions}
          onQuestionsChanged={refresh}
        />
      </Box>

      {tab === 'settings' && (
        <TestSettingsView
          isPublished={test.is_published}
          timerText={timerLabel(test)}
          questionsCount={questions.length}
          questionsToServe={test.questions_to_serve}
          totalMarks={test.total_marks}
          passingMarks={test.passing_marks}
          attemptsCount={attemptsCount}
          origin={origin}
          placements={placements}
          busy={busy}
          duplicating={duplicating}
          isMirrored={isMirrored}
          canAssign={Boolean(activeClassroom)}
          onAssign={() => setAssignOpen(true)}
          onSeeResults={(placementId) => {
            setRunId(placementId);
            setTab('students');
          }}
          onRemovePlacement={removePlacement}
          onDuplicate={duplicateForEdit}
          onDelete={() => setDeleteOpen(true)}
        />
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

      <ExamScheduleDialog
        open={examOpen}
        onClose={() => setExamOpen(false)}
        testId={testId}
        testTitle={test?.title ?? null}
        classroomId={activeClassroom?.id ?? null}
        onScheduled={() => refresh()}
      />

      {/* Assign dialog */}
      <Dialog open={assignOpen} onClose={() => !busy && setAssignOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>Assign this test</DialogTitle>
        <DialogContent>
          {/* Set here rather than only at creation, because a teacher usually
              decides "this is the weekly one" at the moment they assign it. */}
          <TextField
            select
            size="small"
            fullWidth
            label="Syllabus scope"
            value={kindDraft}
            onChange={(e) => saveKind(e.target.value as NexusTestKind)}
            disabled={busy}
            sx={{ mt: 0.5, mb: 2 }}
            helperText="What the paper covers. Students see this on the test card."
          >
            {NEXUS_TEACHER_TEST_KINDS.map((k) => (
              <MenuItem key={k.value} value={k.value}>
                {k.label}
              </MenuItem>
            ))}
          </TextField>
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

      <TestQuestionEditorDialog
        open={editorOpen}
        testId={testId}
        testTitle={test.title}
        authFetch={authFetch}
        onClose={() => setEditorOpen(false)}
        onSaved={refresh}
      />

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
