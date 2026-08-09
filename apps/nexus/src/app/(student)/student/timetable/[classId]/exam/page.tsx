'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  LinearProgress,
  Paper,
  Typography,
  useTheme,
  alpha,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

/**
 * The student's side of a scheduled exam: lobby, countdown, then the result.
 *
 * THE COUNTDOWN IS THE DESIGN. Everything else on this screen is secondary to
 * "how long have I got". One large number, the two facts that matter, and one
 * button.
 *
 * The route is /student/timetable/[classId]/exam and not /student/exams, which
 * already exists and means the external exam-date journey.
 */

interface ExamView {
  exam: {
    id: string;
    title: string | null;
    duration_minutes: number | null;
    passing_pct: number | null;
    results_state: string;
    test_id: string;
  };
  window: { opens_at: string; closes_at: string; is_makeup: boolean };
  placement_id: string | null;
  state: 'upcoming' | 'open' | 'in_progress' | 'submitted' | 'missed';
  my_score: { score: number; total_marks: number; percentage: number; provisional: boolean } | null;
  my_result: {
    rank: number | null;
    score: number;
    total_marks: number;
    percentage: number;
    section_scores: Array<{ label: string; score: number; total_marks: number; ungraded: number }>;
    is_provisional: boolean;
    absent: boolean;
    total_sat: number;
  } | null;
}

function formatIst(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function ordinal(n: number | null): string {
  if (n == null) return '';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function StudentExamPage() {
  const router = useRouter();
  const params = useParams();
  const theme = useTheme();
  const classId = params.classId as string;
  const { getToken } = useNexusAuthContext();

  const [view, setView] = useState<ExamView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/timetable/${classId}/exam`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Could not load this exam');
        return;
      }
      setView(json.data);
    } catch {
      setError('Could not load this exam');
    } finally {
      setLoading(false);
    }
  }, [classId, getToken]);

  useEffect(() => {
    load();
  }, [load]);

  // The clock ticks locally. One second is fine: this is a countdown a person
  // reads, not the authority on whether the door is shut. The server decides
  // that, and refuses a late attempt whatever this says.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (error || !view) {
    return (
      <Box sx={{ px: 2, py: 3 }}>
        <Alert severity="info">{error || 'There is no exam on this class.'}</Alert>
      </Box>
    );
  }

  const opensAt = new Date(view.window.opens_at).getTime();
  const closesAt = new Date(view.window.closes_at).getTime();
  const untilOpen = opensAt - now;
  const untilClose = closesAt - now;

  const start = () => {
    const url = `/student/tests/take?test_id=${view.exam.test_id}${
      view.placement_id ? `&placement_id=${view.placement_id}` : ''
    }&return=${encodeURIComponent(`/student/timetable/${classId}/exam`)}&return_label=${encodeURIComponent('Exam')}`;
    router.push(url);
  };

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2, maxWidth: 600, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Button
          size="small"
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push(`/student/timetable/${classId}`)}
          sx={{ minHeight: 44 }}
        >
          Back
        </Button>
      </Box>

      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
        {view.exam.title || 'Exam'}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Opens {formatIst(view.window.opens_at)}, closes {formatIst(view.window.closes_at)}
      </Typography>

      {view.window.is_makeup && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Your teacher opened this window for you specifically.
        </Alert>
      )}

      {/* ── Upcoming ──────────────────────────────────────────────────────── */}
      {view.state === 'upcoming' && (
        <Paper
          variant="outlined"
          sx={{ p: 3, borderRadius: 3, textAlign: 'center', mb: 2 }}
        >
          <Typography variant="overline" color="text.secondary">
            Opens in
          </Typography>
          <Typography
            role="timer"
            aria-live="off"
            sx={{ fontSize: '2.75rem', fontWeight: 800, lineHeight: 1.1, my: 1 }}
          >
            {formatCountdown(untilOpen)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {view.exam.duration_minutes
              ? `You get ${view.exam.duration_minutes} minutes once you start.`
              : 'You can use the whole window.'}
          </Typography>
        </Paper>
      )}

      {/* ── Open, not started ─────────────────────────────────────────────── */}
      {(view.state === 'open' || view.state === 'in_progress') && (
        <Paper
          variant="outlined"
          sx={{
            p: 3,
            borderRadius: 3,
            textAlign: 'center',
            mb: 2,
            borderColor: 'primary.main',
            bgcolor: alpha(theme.palette.primary.main, 0.04),
          }}
        >
          <Typography variant="overline" color="text.secondary">
            Closes in
          </Typography>
          <Typography
            role="timer"
            aria-live="off"
            sx={{
              fontSize: '2.75rem',
              fontWeight: 800,
              lineHeight: 1.1,
              my: 1,
              color: untilClose < 5 * 60_000 ? 'error.main' : 'text.primary',
            }}
          >
            {formatCountdown(untilClose)}
          </Typography>
          {/* Announced only at the moments that matter, so a screen reader is
              not read a ticking clock for three hours. */}
          <Box aria-live="assertive" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            {untilClose > 0 && untilClose < 60_000
              ? 'One minute left in this exam.'
              : untilClose > 0 && untilClose < 5 * 60_000
                ? 'Five minutes left in this exam.'
                : ''}
          </Box>

          <Button
            variant="contained"
            size="large"
            onClick={start}
            fullWidth
            sx={{ mt: 2, minHeight: 52, fontWeight: 700 }}
          >
            {view.state === 'in_progress' ? 'Carry on' : 'Start the exam'}
          </Button>

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            One attempt only.{' '}
            {view.exam.duration_minutes ? `${view.exam.duration_minutes} minutes.` : ''} Once you
            start, the clock does not stop.
          </Typography>
        </Paper>
      )}

      {/* ── Missed ────────────────────────────────────────────────────────── */}
      {view.state === 'missed' && (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <EventBusyOutlinedIcon color="error" />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              You were marked absent
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            This exam closed on {formatIst(view.window.closes_at)} and no attempt was recorded for
            you. If you could not sit it, speak to your teacher: they can open a second window.
          </Typography>
        </Paper>
      )}

      {/* ── Submitted ─────────────────────────────────────────────────────── */}
      {view.state === 'submitted' && (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <CheckCircleOutlineIcon color="success" />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Submitted
            </Typography>
          </Box>

          {view.exam.results_state === 'unpublished' ? (
            <Typography variant="body2" color="text.secondary">
              Your paper is in. Your teacher will publish the results once everyone has sat it.
            </Typography>
          ) : view.my_result ? (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: 1 }}>
                <Typography sx={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1 }}>
                  {Math.round(view.my_result.percentage)}%
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {view.my_result.score} of {view.my_result.total_marks}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 2 }}>
                {view.my_result.rank != null && (
                  <Chip
                    size="small"
                    color="primary"
                    label={`${ordinal(view.my_result.rank)} of ${view.my_result.total_sat}`}
                  />
                )}
                {view.my_result.is_provisional && (
                  <Chip size="small" color="warning" variant="outlined" label="Provisional" />
                )}
                {view.exam.passing_pct != null && (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={
                      view.my_result.percentage >= view.exam.passing_pct
                        ? 'Passed'
                        : 'Below the pass mark'
                    }
                  />
                )}
              </Box>

              {view.my_result.is_provisional && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  Your drawing is still being marked, so this total can still change.
                </Alert>
              )}

              {view.my_result.section_scores?.length > 1 && (
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                    Section by section
                  </Typography>
                  {view.my_result.section_scores.map((s) => (
                    <Box key={s.label} sx={{ mb: 1.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="body2">{s.label}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {s.ungraded > 0 && s.total_marks === 0
                            ? 'being marked'
                            : `${s.score} of ${s.total_marks}`}
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={s.total_marks > 0 ? Math.min(100, (s.score / s.total_marks) * 100) : 0}
                        sx={{ height: 6, borderRadius: 3 }}
                      />
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Results are out but yours could not be found. Speak to your teacher.
            </Typography>
          )}
        </Paper>
      )}
    </Box>
  );
}
