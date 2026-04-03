'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  Checkbox,
  FormControlLabel,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  Divider,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import { type SessionData } from './SessionCard';

/** Map day-of-week string to JS day number (0=Sun...6=Sat) */
const DAY_MAP: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

const DAY_LABELS: Record<string, string> = {
  sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
  thu: 'Thursday', fri: 'Friday', sat: 'Saturday',
};

function getDateForDay(startDate: string, dayOfWeek: string): string {
  const start = new Date(startDate + 'T00:00:00');
  const startDay = start.getDay();
  const targetDay = DAY_MAP[dayOfWeek.toLowerCase()] ?? 1;
  let diff = targetDay - startDay;
  if (diff < 0) diff += 7;
  const result = new Date(start);
  result.setDate(result.getDate() + diff);
  return result.toISOString().split('T')[0];
}

interface PushWeekDialogProps {
  open: boolean;
  onClose: () => void;
  sessions: SessionData[];
  weekId: string;
  planId: string;
  onPushed: () => void;
  getTeacherToken: () => Promise<string | null>;
}

export default function PushWeekDialog({
  open,
  onClose,
  sessions,
  weekId,
  planId,
  onPushed,
  getTeacherToken,
}: PushWeekDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [startDate, setStartDate] = useState('');
  const [createTeamsMeetings, setCreateTeamsMeetings] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultCount, setResultCount] = useState<number | null>(null);

  const unpushedSessions = useMemo(
    () => sessions.filter((s) => s.status === 'planned' && !s.scheduled_class_id),
    [sessions]
  );

  useEffect(() => {
    if (open) {
      // Default to next Monday
      const now = new Date();
      const dayOfWeek = now.getDay();
      const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 7 : 8 - dayOfWeek;
      const nextMonday = new Date(now);
      nextMonday.setDate(now.getDate() + daysUntilMonday);
      setStartDate(nextMonday.toISOString().split('T')[0]);
      setCreateTeamsMeetings(true);
      setError(null);
      setResultCount(null);
    }
  }, [open]);

  const preview = useMemo(() => {
    if (!startDate) return [];
    return unpushedSessions.map((s) => ({
      ...s,
      computedDate: s.day_of_week ? getDateForDay(startDate, s.day_of_week) : startDate,
    }));
  }, [startDate, unpushedSessions]);

  const handleSubmit = async () => {
    if (!startDate || unpushedSessions.length === 0) return;
    setSubmitting(true);
    setError(null);

    try {
      const token = await getTeacherToken();
      if (!token) throw new Error('Authentication required');

      const res = await fetch(`/api/course-plans/${planId}/sessions/push-week`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          week_id: weekId,
          start_date: startDate,
          create_teams_meetings: createTeamsMeetings,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to push week');
      }

      const data = await res.json();
      setResultCount(data.count || 0);
      onPushed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to push week');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      fullScreen={fullScreen}
      PaperProps={{ sx: { mx: { xs: 0, sm: 2 }, width: { xs: '100%', sm: 'calc(100% - 32px)' } } }}
    >
      <DialogTitle sx={{ fontWeight: 700 }}>Push Entire Week</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {resultCount !== null ? (
            <Alert severity="success" sx={{ borderRadius: 1.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {resultCount} session{resultCount !== 1 ? 's' : ''} pushed to timetable!
              </Typography>
            </Alert>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary">
                {unpushedSessions.length} unpushed session{unpushedSessions.length !== 1 ? 's' : ''} in this week
              </Typography>

              <TextField
                label="Week Start Date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
                inputProps={{ style: { minHeight: 24 } }}
              />

              <FormControlLabel
                control={
                  <Checkbox
                    checked={createTeamsMeetings}
                    onChange={(e) => setCreateTeamsMeetings(e.target.checked)}
                  />
                }
                label="Create Teams meetings"
                sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.9rem' } }}
              />

              {/* Preview */}
              {preview.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                    Preview
                  </Typography>
                  <List dense sx={{ bgcolor: 'action.hover', borderRadius: 1.5, py: 0 }}>
                    {preview.map((s, i) => (
                      <Box key={s.id}>
                        {i > 0 && <Divider />}
                        <ListItem sx={{ px: 2, py: 1 }}>
                          <ListItemText
                            primary={s.title}
                            secondary={`${DAY_LABELS[s.day_of_week || ''] || s.day_of_week || ''} - ${s.computedDate} (${s.slot?.toUpperCase()})`}
                            primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                            secondaryTypographyProps={{ variant: 'caption' }}
                          />
                        </ListItem>
                      </Box>
                    ))}
                  </List>
                </Box>
              )}
            </>
          )}

          {error && (
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {resultCount !== null ? (
          <Button variant="contained" onClick={onClose} sx={{ minHeight: 48 }}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={submitting} sx={{ minHeight: 48 }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={!startDate || unpushedSessions.length === 0 || submitting}
              sx={{ minHeight: 48 }}
            >
              {submitting ? <CircularProgress size={20} color="inherit" /> : `Push ${unpushedSessions.length} Sessions`}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
