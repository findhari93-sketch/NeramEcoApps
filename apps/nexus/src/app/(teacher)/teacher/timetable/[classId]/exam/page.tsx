'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import ExamInvigilationRoster from '@/components/scheduled-exams/ExamInvigilationRoster';
import PublishExamResultsDialog from '@/components/scheduled-exams/PublishExamResultsDialog';

/**
 * One exam, from the teacher's side.
 *
 * Deliberately at /teacher/timetable/[classId]/exam and NOT at /teacher/exams:
 * that route already exists and means the external NATA and JEE exam-date
 * journey. Matching /student/timetable/[classId]/catch-up keeps the shape
 * consistent with the rest of the timetable.
 */

interface ExamRow {
  id: string;
  title: string | null;
  opens_at: string;
  closes_at: string;
  duration_minutes: number | null;
  passing_pct: number | null;
  results_state: 'unpublished' | 'provisional' | 'final';
  scheduled_class_id: string;
  test_id: string;
}

function istRange(opens: string, closes: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  return `${fmt(opens)} to ${new Date(closes).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}`;
}

export default function TeacherExamPage() {
  const router = useRouter();
  const params = useParams();
  const classId = params.classId as string;
  const { getToken } = useNexusAuthContext();

  const [exam, setExam] = useState<ExamRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [publishOpen, setPublishOpen] = useState(false);
  const [makeupFor, setMakeupFor] = useState<{ id: string; name: string } | null>(null);
  const [makeupDate, setMakeupDate] = useState('');
  const [makeupReason, setMakeupReason] = useState('');

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
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Request failed');
      return json;
    },
    [getToken],
  );

  const load = useCallback(async () => {
    try {
      // The exam is keyed on the class, so resolve it from the timetable row.
      const json = await authFetch(`/api/timetable/${classId}/exam`);
      setExam(json.data.exam);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this exam');
    } finally {
      setLoading(false);
    }
  }, [authFetch, classId]);

  useEffect(() => {
    load();
  }, [load]);

  const grantAttempt = async (studentId: string, studentName: string) => {
    if (!exam) return;
    try {
      await authFetch(`/api/exams/${exam.id}/attempt-override`, {
        method: 'POST',
        body: JSON.stringify({ student_id: studentId }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not grant another attempt to ${studentName}`);
    }
  };

  const grantMakeup = async () => {
    if (!exam || !makeupFor || !makeupDate) return;
    try {
      const opens = new Date(`${makeupDate}T00:00:00+05:30`).toISOString();
      const closes = new Date(`${makeupDate}T23:59:00+05:30`).toISOString();
      await authFetch(`/api/exams/${exam.id}/makeup`, {
        method: 'POST',
        body: JSON.stringify({
          student_id: makeupFor.id,
          opens_at: opens,
          closes_at: closes,
          reason: makeupReason || null,
        }),
      });
      setMakeupFor(null);
      setMakeupReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not grant that window');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (!exam) {
    return (
      <Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
        <Alert severity="info">There is no exam scheduled on this class.</Alert>
      </Box>
    );
  }

  const now = Date.now();
  const isLive = now >= new Date(exam.opens_at).getTime() && now <= new Date(exam.closes_at).getTime();
  const hasClosed = now > new Date(exam.closes_at).getTime();

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <IconButton size="small" onClick={() => router.push(`/teacher/timetable/${classId}`)} aria-label="Back to the class">
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }} noWrap>
            {exam.title || 'Exam'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {istRange(exam.opens_at, exam.closes_at)}
            {exam.duration_minutes ? ` · ${exam.duration_minutes} minutes each` : ''}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 2 }}>
        {/* State in words as well as colour. */}
        <Chip
          size="small"
          label={isLive ? 'Open now' : hasClosed ? 'Closed' : 'Not open yet'}
          color={isLive ? 'primary' : hasClosed ? 'default' : 'warning'}
        />
        <Chip
          size="small"
          variant="outlined"
          label={
            exam.results_state === 'final'
              ? 'Results final'
              : exam.results_state === 'provisional'
                ? 'Results provisional'
                : 'Results not published'
          }
        />
        {exam.passing_pct != null && (
          <Chip size="small" variant="outlined" label={`Pass at ${exam.passing_pct}%`} />
        )}
      </Box>

      {error && (
        <Alert severity="error" role="alert" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        {hasClosed && (
          <Button variant="contained" onClick={() => setPublishOpen(true)} sx={{ minHeight: 48 }}>
            {exam.results_state === 'unpublished' ? 'Publish results' : 'Publish again'}
          </Button>
        )}
        {isLive && (
          <Button
            variant="outlined"
            color="warning"
            onClick={async () => {
              await authFetch(`/api/exams/${exam.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ closes_at: new Date().toISOString() }),
              }).catch(() => null);
              load();
            }}
            sx={{ minHeight: 48 }}
          >
            Close exam now
          </Button>
        )}
      </Box>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
        variant="scrollable"
        scrollButtons="auto"
      >
        <Tab label={isLive ? 'Invigilate' : 'Who sat it'} sx={{ minHeight: 48 }} />
      </Tabs>

      {tab === 0 && (
        <ExamInvigilationRoster
          examId={exam.id}
          onGrantMakeup={(id, name) => {
            setMakeupFor({ id, name });
            setMakeupDate(new Date().toISOString().slice(0, 10));
          }}
          onGrantAttempt={grantAttempt}
        />
      )}

      <PublishExamResultsDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        examId={exam.id}
        onPublished={load}
      />

      <Dialog open={Boolean(makeupFor)} onClose={() => setMakeupFor(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>A second window</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {makeupFor?.name} will be able to sit this exam on the day you pick, and only that day.
            They get one attempt, the same as everyone else.
          </Typography>
          <TextField
            label="Day"
            type="date"
            value={makeupDate}
            onChange={(e) => setMakeupDate(e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
            sx={{ mb: 2 }}
          />
          <TextField
            label="Why (recorded against the grant)"
            value={makeupReason}
            onChange={(e) => setMakeupReason(e.target.value)}
            fullWidth
            multiline
            minRows={2}
            placeholder="Was ill, power cut, ..."
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setMakeupFor(null)} sx={{ minHeight: 48 }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={grantMakeup} disabled={!makeupDate} sx={{ minHeight: 48 }}>
            Open it
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
