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
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  Avatar,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import PendingIcon from '@mui/icons-material/Pending';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import { type SessionData } from './SessionCard';

type CompletionStatus = 'completed' | 'skipped' | 'partial' | 'rescheduled';

interface ClassCompletionDialogProps {
  open: boolean;
  onClose: () => void;
  session: SessionData | null;
  planId: string;
  onSaved: () => void;
  getToken: () => Promise<string | null>;
}

/**
 * Extract teacher name from session.teacher or from session.notes.
 * Notes format: "Sudarshini | Apr 3 | Day 7"
 */
function getTeacherName(session: SessionData | null): string {
  if (!session) return '';
  if (session.teacher?.name) return session.teacher.name;
  if (session.notes) {
    const parts = session.notes.split('|');
    if (parts.length >= 2) {
      const name = parts[0].trim();
      if (name && name.length < 40) return name;
    }
  }
  return '';
}

/**
 * Extract time label from session slot and notes.
 */
function getTimeLabel(session: SessionData | null): string {
  if (!session) return '';
  const slot = (session.slot || '').toUpperCase();
  if (session.scheduled_class) {
    return `${slot} ${session.scheduled_class.start_time}–${session.scheduled_class.end_time}`;
  }
  // Derive from slot convention
  if (slot === 'AM') return 'AM 11:00–12:00';
  if (slot === 'PM') return 'PM 14:00–20:00';
  return slot;
}

const STATUS_OPTIONS: {
  value: CompletionStatus;
  label: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  {
    value: 'completed',
    label: 'Completed',
    icon: <CheckCircleIcon sx={{ fontSize: 20 }} />,
    color: '#2e7d32',
  },
  {
    value: 'skipped',
    label: 'Skipped',
    icon: <SkipNextIcon sx={{ fontSize: 20 }} />,
    color: '#d32f2f',
  },
  {
    value: 'partial',
    label: 'Partial',
    icon: <PendingIcon sx={{ fontSize: 20 }} />,
    color: '#ed6c02',
  },
  {
    value: 'rescheduled',
    label: 'Rescheduled',
    icon: <EventRepeatIcon sx={{ fontSize: 20 }} />,
    color: '#0288d1',
  },
];

export default function ClassCompletionDialog({
  open,
  onClose,
  session,
  planId,
  onSaved,
  getToken,
}: ClassCompletionDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [status, setStatus] = useState<CompletionStatus | null>(null);
  const [actualTopic, setActualTopic] = useState('');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teacherName = useMemo(() => getTeacherName(session), [session]);
  const timeLabel = useMemo(() => getTimeLabel(session), [session]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open && session) {
      setStatus(null);
      setActualTopic('');
      setNotes('');
      setReason('');
      setError(null);
    }
  }, [open, session]);

  const showReasonField = status === 'skipped' || status === 'rescheduled';

  const handleSubmit = async () => {
    if (!session || !status) return;
    setSubmitting(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) throw new Error('Authentication required');

      // Build the update payload
      const updates: Record<string, unknown> = {};

      // Map internal status to DB status
      if (status === 'completed' || status === 'partial') {
        updates.status = 'completed';
      } else if (status === 'skipped' || status === 'rescheduled') {
        updates.status = 'skipped';
      }

      // If actual topic is different from planned, update title
      if (actualTopic.trim() && actualTopic.trim() !== session.title) {
        updates.title = actualTopic.trim();
      }

      // Build notes string
      const noteParts: string[] = [];
      const existingNotes = session.notes || '';

      if (status === 'partial') {
        noteParts.push('⚠ Partially covered — needs continuation');
      }
      if (status === 'rescheduled' && reason.trim()) {
        noteParts.push(`Rescheduled: ${reason.trim()}`);
      }
      if (status === 'skipped' && reason.trim()) {
        noteParts.push(`Skipped: ${reason.trim()}`);
      }
      if (notes.trim()) {
        noteParts.push(notes.trim());
      }

      if (noteParts.length > 0) {
        const appendedNotes = noteParts.join(' | ');
        updates.notes = existingNotes
          ? `${existingNotes} | ${appendedNotes}`
          : appendedNotes;
      }

      const res = await fetch(`/api/course-plans/${planId}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          session_id: session.id,
          ...updates,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update session');
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update session');
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
      <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Class Status Update</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
          {/* Session info summary */}
          {session && (
            <Box
              sx={{
                bgcolor: 'action.hover',
                borderRadius: 2,
                p: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: 0.75,
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                {session.title}
              </Typography>
              {teacherName && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Avatar
                    src={session.teacher?.avatar_url || undefined}
                    sx={{ width: 24, height: 24, fontSize: '0.7rem' }}
                  >
                    {teacherName[0]}
                  </Avatar>
                  <Typography variant="body2" color="text.secondary">
                    {teacherName}
                  </Typography>
                </Box>
              )}
              <Typography variant="body2" color="text.secondary">
                Day {session.day_number} &bull; {timeLabel}
              </Typography>
            </Box>
          )}

          {/* Status selection */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
              What happened?
            </Typography>
            <ToggleButtonGroup
              value={status}
              exclusive
              onChange={(_, newStatus) => {
                if (newStatus !== null) setStatus(newStatus);
              }}
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 1,
                '& .MuiToggleButtonGroup-grouped': {
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: '12px !important',
                  margin: 0,
                },
              }}
            >
              {STATUS_OPTIONS.map((opt) => (
                <ToggleButton
                  key={opt.value}
                  value={opt.value}
                  sx={{
                    flex: { xs: '1 1 calc(50% - 4px)', sm: '1 1 0' },
                    minHeight: 48,
                    textTransform: 'none',
                    gap: 0.75,
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    '&.Mui-selected': {
                      bgcolor: `${opt.color}14`,
                      color: opt.color,
                      borderColor: `${opt.color} !important`,
                      '&:hover': {
                        bgcolor: `${opt.color}20`,
                      },
                    },
                  }}
                >
                  {opt.icon}
                  {opt.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>

          {/* Reason field — only for Skipped/Rescheduled */}
          {showReasonField && (
            <TextField
              label={status === 'rescheduled' ? 'Reason for rescheduling' : 'Reason for skipping'}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              fullWidth
              placeholder={
                status === 'rescheduled'
                  ? 'e.g., Teacher unavailable, moved to next week'
                  : 'e.g., Holiday, student exam paper discussion'
              }
              inputProps={{ style: { minHeight: 24 } }}
            />
          )}

          {/* Actual topic covered */}
          <TextField
            label="Actual topic covered (optional)"
            value={actualTopic}
            onChange={(e) => setActualTopic(e.target.value)}
            fullWidth
            placeholder={session?.title || 'Same as planned if left blank'}
            inputProps={{ style: { minHeight: 24 } }}
          />

          {/* Notes */}
          <TextField
            label="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            fullWidth
            multiline
            rows={2}
            placeholder="Any additional notes about this session..."
          />

          {error && (
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting} sx={{ minHeight: 48 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || !status}
          sx={{ minHeight: 48, minWidth: 80 }}
        >
          {submitting ? <CircularProgress size={20} color="inherit" /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
