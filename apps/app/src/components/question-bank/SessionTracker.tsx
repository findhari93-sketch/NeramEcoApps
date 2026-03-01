'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Button, Chip, Avatar, TextField,
  MenuItem, Collapse, CircularProgress, Alert,
} from '@neram/ui';
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

  // Form state
  const [examYear, setExamYear] = useState(CURRENT_YEAR);
  const [sessionLabel, setSessionLabel] = useState('');

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/questions/${questionId}/sessions`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data.data);
      }
    } catch (err) {
      console.error('Error fetching sessions:', err);
    } finally {
      setLoading(false);
    }
  }, [questionId]);

  useEffect(() => {
    if (expanded && sessions.length === 0) {
      fetchSessions();
    }
  }, [expanded, fetchSessions, sessions.length]);

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
        const data = await res.json();
        setError(data.error || 'Failed to submit');
        return;
      }

      setShowForm(false);
      setSessionLabel('');
      setSessionCount((c) => c + 1);
      await fetchSessions();
    } catch {
      setError('Something went wrong');
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
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Button
          size="small"
          variant="text"
          onClick={() => setExpanded(!expanded)}
          sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.85rem' }}
        >
          {expanded ? '▾' : '▸'} Appeared in {sessionCount} {sessionCount === 1 ? 'session' : 'sessions'}
        </Button>

        {isAuthenticated && (
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setShowForm(!showForm);
              if (!expanded) setExpanded(true);
            }}
            sx={{ textTransform: 'none', fontSize: '0.8rem', minHeight: 32 }}
          >
            I got this too
          </Button>
        )}
      </Stack>

      {/* Expanded session list */}
      <Collapse in={expanded}>
        <Box sx={{ pl: 2, borderLeft: '2px solid', borderColor: 'divider' }}>
          {loading ? (
            <Box sx={{ display: 'flex', py: 1 }}>
              <CircularProgress size={20} />
            </Box>
          ) : sessions.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
              No session reports yet. Be the first to confirm this question!
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
                          sx={{ width: 20, height: 20, fontSize: '0.6rem' }}
                        >
                          {(s.author?.name || 'U')[0]}
                        </Avatar>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {s.author?.name || 'Anonymous'}
                        </Typography>
                        {s.session_label && (
                          <Chip
                            label={s.session_label}
                            size="small"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.7rem' }}
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
            <Box sx={{ mt: 1.5, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 1.5 }}>
                Report your session
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 1.5 }}>
                <TextField
                  select
                  label="Exam Year"
                  size="small"
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
                  placeholder="e.g., Session 1, Morning"
                  size="small"
                  value={sessionLabel}
                  onChange={(e) => setSessionLabel(e.target.value)}
                  inputProps={{ maxLength: 50 }}
                  fullWidth
                />
              </Stack>
              {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleSubmit}
                  disabled={submitting}
                  sx={{ minHeight: 36 }}
                >
                  {submitting ? <CircularProgress size={16} color="inherit" /> : 'Submit'}
                </Button>
                <Button
                  size="small"
                  variant="text"
                  onClick={() => setShowForm(false)}
                  disabled={submitting}
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
