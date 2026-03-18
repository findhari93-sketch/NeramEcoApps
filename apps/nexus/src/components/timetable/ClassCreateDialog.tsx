'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
  FormHelperText,
  Switch,
} from '@neram/ui';
import VideocamIcon from '@mui/icons-material/Videocam';
import { type ClassCardData } from './ClassCard';
import { type HolidayInfo } from './WeeklyCalendarGrid';

interface TopicOption {
  id: string;
  title: string;
  category: string;
}

interface BatchOption {
  id: string;
  name: string;
}

interface ClassFormData {
  title: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  topic_id: string;
  batch_id: string;
  create_meeting: boolean;
}

const emptyForm: ClassFormData = {
  title: '',
  scheduled_date: '',
  start_time: '',
  end_time: '',
  topic_id: '',
  batch_id: '',
  create_meeting: false,
};

interface ClassCreateDialogProps {
  open: boolean;
  onClose: () => void;
  editingClass: ClassCardData | null;
  topics: TopicOption[];
  batches: BatchOption[];
  classroomId: string;
  getToken: () => Promise<string | null>;
  onSaved: () => void;
  /** Pre-fill date from calendar slot click */
  prefillDate?: string;
  /** Pre-fill start time from calendar slot click */
  prefillTime?: string;
  /** Holidays map for conflict checking */
  holidays?: Record<string, HolidayInfo>;
  /** Remove a holiday by date */
  onRemoveHoliday?: (date: string) => Promise<void>;
  /** Whether the classroom has a linked Teams team (enables channel meeting) */
  hasLinkedTeam?: boolean;
}

export default function ClassCreateDialog({
  open,
  onClose,
  editingClass,
  topics,
  batches,
  classroomId,
  getToken,
  onSaved,
  prefillDate,
  prefillTime,
  holidays,
  onRemoveHoliday,
  hasLinkedTeam,
}: ClassCreateDialogProps) {
  const [formData, setFormData] = useState<ClassFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holidayConflict, setHolidayConflict] = useState<{ date: string; title: string } | null>(null);

  // Populate form when editing
  useEffect(() => {
    if (editingClass) {
      setFormData({
        title: editingClass.title,
        scheduled_date: editingClass.scheduled_date,
        start_time: editingClass.start_time,
        end_time: editingClass.end_time,
        topic_id: editingClass.topic?.id || '',
        batch_id: editingClass.batch_id || '',
        create_meeting: false,
      });
    } else if (prefillDate || prefillTime) {
      setFormData({
        ...emptyForm,
        scheduled_date: prefillDate || '',
        start_time: prefillTime || '',
        end_time: prefillTime ? (() => {
          const [h] = prefillTime.split(':').map(Number);
          return `${(h + 1).toString().padStart(2, '0')}:00`;
        })() : '',
      });
    } else {
      setFormData(emptyForm);
    }
    setError(null);
  }, [editingClass, open]);

  const handleSubmit = async () => {
    if (!formData.title || !formData.scheduled_date || !formData.start_time || !formData.end_time) {
      setError('Please fill in all required fields');
      return;
    }

    // Check for holiday conflict (only when creating, not editing)
    if (!editingClass && holidays && holidays[formData.scheduled_date]) {
      setHolidayConflict({
        date: formData.scheduled_date,
        title: holidays[formData.scheduled_date].title,
      });
      return;
    }

    await doSubmit();
  };

  const handleConfirmHolidayOverride = async () => {
    if (holidayConflict && onRemoveHoliday) {
      try {
        await onRemoveHoliday(holidayConflict.date);
      } catch {
        setError('Failed to remove holiday');
        setHolidayConflict(null);
        return;
      }
    }
    setHolidayConflict(null);
    await doSubmit();
  };

  const doSubmit = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) return;

      const body: Record<string, unknown> = {
        title: formData.title,
        scheduled_date: formData.scheduled_date,
        start_time: formData.start_time,
        end_time: formData.end_time,
        classroom_id: classroomId,
        topic_id: formData.topic_id || null,
        batch_id: formData.batch_id || null,
      };

      const method = editingClass ? 'PATCH' : 'POST';
      if (editingClass) {
        body.id = editingClass.id;
      }

      const res = await fetch('/api/timetable', {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save class');
      }

      const data = await res.json();

      // If meeting toggle is on and this is a new class, create the Teams meeting
      if (!editingClass && formData.create_meeting && data.class?.id) {
        try {
          const meetingRes = await fetch('/api/timetable/teams-meeting', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              class_id: data.class.id,
              classroom_id: classroomId,
              auto: true,
            }),
          });

          if (!meetingRes.ok) {
            const meetingErr = await meetingRes.json().catch(() => ({}));
            console.error('Teams meeting creation failed:', meetingErr.error);
          }
        } catch (meetingErr) {
          console.error('Teams meeting creation error:', meetingErr);
        }
      }

      onClose();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save class');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{editingClass ? 'Edit Class' : 'Add Class'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="Title *"
            fullWidth
            value={formData.title}
            onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))}
            inputProps={{ style: { minHeight: 24 } }}
          />

          <TextField
            label="Date *"
            type="date"
            fullWidth
            value={formData.scheduled_date}
            onChange={(e) => setFormData((f) => ({ ...f, scheduled_date: e.target.value }))}
            InputLabelProps={{ shrink: true }}
          />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Start Time *"
              type="time"
              fullWidth
              value={formData.start_time}
              onChange={(e) => setFormData((f) => ({ ...f, start_time: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="End Time *"
              type="time"
              fullWidth
              value={formData.end_time}
              onChange={(e) => setFormData((f) => ({ ...f, end_time: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
          </Box>

          <FormControl fullWidth>
            <InputLabel id="topic-select-label" shrink>Topic</InputLabel>
            <Select
              labelId="topic-select-label"
              label="Topic"
              displayEmpty
              value={formData.topic_id}
              onChange={(e) => setFormData((f) => ({ ...f, topic_id: e.target.value as string }))}
              notched
              MenuProps={{ PaperProps: { sx: { maxHeight: 300 } } }}
              sx={{ minHeight: 48 }}
            >
              <MenuItem value="">
                <em>-- Select Topic --</em>
              </MenuItem>
              {topics.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.title}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel id="batch-select-label" shrink>Batch</InputLabel>
            <Select
              labelId="batch-select-label"
              label="Batch"
              displayEmpty
              value={formData.batch_id}
              onChange={(e) => setFormData((f) => ({ ...f, batch_id: e.target.value as string }))}
              notched
              MenuProps={{ PaperProps: { sx: { maxHeight: 300 } } }}
              sx={{ minHeight: 48 }}
            >
              <MenuItem value="">All Batches (Classroom-wide)</MenuItem>
              {batches.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.name}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>Leave as &apos;All Batches&apos; for classroom-wide classes</FormHelperText>
          </FormControl>

          {/* Create Teams Meeting toggle */}
          {!editingClass && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                p: 1.5,
                border: '1px solid',
                borderColor: formData.create_meeting ? 'primary.main' : 'divider',
                borderRadius: 1,
                bgcolor: formData.create_meeting ? 'primary.50' : 'transparent',
                transition: 'all 0.15s',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <VideocamIcon color={formData.create_meeting ? 'primary' : 'disabled'} />
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Create Teams Meeting
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {hasLinkedTeam
                      ? 'Meeting link + channel post + calendar invites'
                      : 'Meeting link + calendar invites to students'}
                  </Typography>
                </Box>
              </Box>
              <Switch
                checked={formData.create_meeting}
                onChange={(e) => setFormData((f) => ({ ...f, create_meeting: e.target.checked }))}
                color="primary"
              />
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ minHeight: 48 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || !formData.title || !formData.scheduled_date}
          sx={{ minHeight: 48 }}
        >
          {submitting ? 'Saving...' : editingClass ? 'Update' : 'Create'}
        </Button>
      </DialogActions>

      {/* Holiday conflict confirmation */}
      <Dialog open={!!holidayConflict} onClose={() => setHolidayConflict(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Holiday on this date</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            <strong>{holidayConflict?.date}</strong> is marked as a holiday: <strong>{holidayConflict?.title}</strong>
          </Typography>
          <Typography variant="body2" color="warning.main" sx={{ mt: 1.5 }}>
            Do you want to remove the holiday and schedule this class?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHolidayConflict(null)} sx={{ minHeight: 48 }}>
            No, keep holiday
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleConfirmHolidayOverride}
            sx={{ minHeight: 48 }}
          >
            Remove holiday &amp; create class
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
