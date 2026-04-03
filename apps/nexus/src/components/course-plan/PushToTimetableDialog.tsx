'use client';

import { useState, useEffect } from 'react';
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
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import LinkIcon from '@mui/icons-material/Link';
import { type SessionData } from './SessionCard';

interface PushToTimetableDialogProps {
  open: boolean;
  onClose: () => void;
  session: SessionData | null;
  planId: string;
  onPushed: () => void;
  getTeacherToken: () => Promise<string | null>;
}

export default function PushToTimetableDialog({
  open,
  onClose,
  session,
  planId,
  onPushed,
  getTeacherToken,
}: PushToTimetableDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [scheduledDate, setScheduledDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [createTeamsMeeting, setCreateTeamsMeeting] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ joinUrl?: string } | null>(null);

  useEffect(() => {
    if (open && session) {
      // Default to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setScheduledDate(tomorrow.toISOString().split('T')[0]);
      setStartTime(session.start_time || '09:00');
      setEndTime(session.end_time || '10:00');
      setCreateTeamsMeeting(true);
      setError(null);
      setResult(null);
    }
  }, [open, session]);

  const handleSubmit = async () => {
    if (!session || !scheduledDate) return;
    setSubmitting(true);
    setError(null);

    try {
      const token = await getTeacherToken();
      if (!token) throw new Error('Authentication required');

      const res = await fetch(`/api/course-plans/${planId}/sessions/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          session_id: session.id,
          scheduled_date: scheduledDate,
          start_time: startTime,
          end_time: endTime,
          create_teams_meeting: createTeamsMeeting,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to push session');
      }

      const data = await res.json();
      setResult({
        joinUrl: data.teams_meeting?.joinUrl || null,
      });
      onPushed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to push session');
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
      <DialogTitle sx={{ fontWeight: 700 }}>Push to Timetable</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
          {session && (
            <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1.5 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {session.title}
              </Typography>
              {session.teacher && (
                <Typography variant="caption" color="text.secondary">
                  Teacher: {session.teacher.name}
                </Typography>
              )}
            </Box>
          )}

          {result ? (
            <Alert severity="success" sx={{ borderRadius: 1.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                Session pushed to timetable!
              </Typography>
              {result.joinUrl && (
                <Button
                  size="small"
                  startIcon={<LinkIcon />}
                  href={result.joinUrl}
                  target="_blank"
                  rel="noopener"
                  sx={{ textTransform: 'none', mt: 0.5 }}
                >
                  Open Teams Meeting
                </Button>
              )}
            </Alert>
          ) : (
            <>
              <TextField
                label="Scheduled Date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
                inputProps={{ style: { minHeight: 24 } }}
              />

              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  label="Start Time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                  inputProps={{ style: { minHeight: 24 } }}
                />
                <TextField
                  label="End Time"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                  inputProps={{ style: { minHeight: 24 } }}
                />
              </Box>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={createTeamsMeeting}
                    onChange={(e) => setCreateTeamsMeeting(e.target.checked)}
                  />
                }
                label="Create Teams meeting"
                sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.9rem' } }}
              />
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
        {result ? (
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
              disabled={!scheduledDate || submitting}
              sx={{ minHeight: 48 }}
            >
              {submitting ? <CircularProgress size={20} color="inherit" /> : 'Push'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
