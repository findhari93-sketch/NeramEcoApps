'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Button, Chip, Avatar, TextField,
  MenuItem, Collapse, CircularProgress, Alert, Skeleton,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import RefreshIcon from '@mui/icons-material/Refresh';
import type { QuestionSessionDisplay } from '@neram/database';

const CURRENT_YEAR = new Date().getFullYear();
const EXAM_YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

interface SessionTrackerProps {
  questionId: string;
  sessionCount: number;
  isAuthenticated: boolean;
  getAuthToken: () => Promise<string | null>;
}

export default function SessionTracker({
  questionId,
  sessionCount: initialCount,
  isAuthenticated,
  getAuthToken,
}: SessionTrackerProps) {
  const [sessions, setSessions] = useState<QuestionSessionDisplay[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sessionCount, setSessionCount] = useState(initialCount);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Follow fresh counts from the parent
  useEffect(() => {
    setSessionCount(initialCount);
  }, [initialCount]);

  // Form state
  const [examYear, setExamYear] = useState(CURRENT_YEAR);
  const [sessionLabel, setSessionLabel] = useState('');

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/questions/${questionId}/sessions`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSessions(data.data || []);
      setLoaded(true);
    } catch (err) {
      console.error('Error fetching sessions:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [questionId]);

  useEffect(() => {
    if (expanded && !loaded && !loading && !loadError) {
      fetchSessions();
    }
  }, [expanded, loaded, loading, loadError, fetchSessions]);

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        setError('Please sign in to report a session');
        return;
      }

      const res = await fetch(`/api/questions/${questionId}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          examYear,
          sessionLabel: sessionLabel.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Could not submit. Please try again.');
        return;
      }

      setShowForm(false);
      setSessionLabel('');
      setSessionCount((c) => c + 1);
      await fetchSessions();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Group sessions by year
  const sessionsByYear = sessions.reduce((acc, s) => {
    const year = s.exam_year;
    if (!acc[year]) acc[year] = [];
    acc[year].push(s);
    return acc;
  }, {} as Record<number, QuestionSessionDisplay[]>);

  return (
    <Box sx={{ mb: 3 }}>
      {/* Header row */}
      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
        <Button
          variant="text"
          onClick={() => setExpanded(!expanded)}
          endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          aria-expanded={expanded}
          aria-controls={`sessions-${questionId}`}
          sx={{ minHeight: 44, px: 1, ml: -1, fontWeight: 600, color: 'text.primary' }}
        >
          Appeared in {sessionCount} {sessionCount === 1 ? 'session' : 'sessions'}
        </Button>

        {isAuthenticated && (
          <Button
            variant="outlined"
            onClick={() => {
              setShowForm(!showForm);
              if (!expanded) setExpanded(true);
            }}
            aria-expanded={showForm}
            sx={{ minHeight: 44 }}
          >
            I got this too
          </Button>
        )}
      </Stack>

      {/* Expanded session list */}
      <Collapse in={expanded} id={`sessions-${questionId}`}>
        <Box sx={{ pl: 2, borderLeft: '2px solid', borderColor: 'divider' }}>
          {loading ? (
            <Box sx={{ py: 1 }} aria-hidden="true">
              <Skeleton variant="text" width="40%" />
              <Skeleton variant="text" width="60%" />
            </Box>
          ) : loadError ? (
            <Alert
              severity="error"
              role="alert"
              sx={{ my: 1 }}
              action={
                <Button color="inherit" onClick={fetchSessions} startIcon={<RefreshIcon />} sx={{ minHeight: 44 }}>
                  Retry
                </Button>
              }
            >
              Could not load session reports.
            </Alert>
          ) : sessions.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
              No session reports yet. Be the first to confirm this question.
            </Typography>
          ) : (
            Object.entries(sessionsByYear)
              .sort(([a], [b]) => Number(b) - Number(a))
              .map(([year, yearSessions]) => (
                <Box key={year} sx={{ mb: 1.5 }}>
                  <Typography variant="caption" fontWeight={700} color="text.secondary">
                    NATA {year}
                  </Typography>
                  <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                    {yearSessions.map((s) => (
                      <Stack key={s.id} direction="row" alignItems="center" spacing={1}>
                        <Avatar
                          src={s.author?.avatar_url || undefined}
                          alt=""
                          sx={{ width: 24, height: 24, fontSize: '0.75rem' }}
                        >
                          {(s.author?.name || 'U')[0]}
                        </Avatar>
                        <Typography variant="body2">
                          {s.author?.name || 'Anonymous'}
                        </Typography>
                        {s.session_label && (
                          <Chip
                            label={s.session_label}
                            size="small"
                            variant="outlined"
                            sx={{ height: 24, fontSize: '0.75rem' }}
                          />
                        )}
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              ))
          )}

          {/* "I got this too" form */}
          <Collapse in={showForm}>
            <Box sx={{ mt: 1.5, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 1.5 }}>
                Report your session
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 1.5 }}>
                <TextField
                  select
                  label="Exam year"
                  value={examYear}
                  onChange={(e) => setExamYear(Number(e.target.value))}
                  sx={{ minWidth: 120 }}
                >
                  {EXAM_YEARS.map((y) => (
                    <MenuItem key={y} value={y}>{y}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Session / Slot (optional)"
                  placeholder="For example, Session 1, Morning"
                  value={sessionLabel}
                  onChange={(e) => setSessionLabel(e.target.value)}
                  inputProps={{ maxLength: 50 }}
                  fullWidth
                />
              </Stack>
              {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  onClick={handleSubmit}
                  disabled={submitting}
                  sx={{ minHeight: 44 }}
                >
                  {submitting ? <CircularProgress size={16} color="inherit" /> : 'Submit'}
                </Button>
                <Button
                  variant="text"
                  onClick={() => setShowForm(false)}
                  disabled={submitting}
                  sx={{ minHeight: 44 }}
                >
                  Cancel
                </Button>
              </Stack>
            </Box>
          </Collapse>
        </Box>
      </Collapse>
    </Box>
  );
}
