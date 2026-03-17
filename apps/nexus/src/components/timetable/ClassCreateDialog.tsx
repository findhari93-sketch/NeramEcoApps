'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
} from '@neram/ui';
import { type ClassCardData } from './ClassCard';

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
  create_teams_meeting: boolean;
}

const emptyForm: ClassFormData = {
  title: '',
  scheduled_date: '',
  start_time: '',
  end_time: '',
  topic_id: '',
  batch_id: '',
  create_teams_meeting: false,
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
}: ClassCreateDialogProps) {
  const [formData, setFormData] = useState<ClassFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        create_teams_meeting: false,
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

    setSubmitting(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) return;

      const body: Record<string, unknown> = {
        ...formData,
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

      // If create_teams_meeting was requested and this is a new class, create the meeting
      if (!editingClass && formData.create_teams_meeting && data.class?.id) {
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
            }),
          });

          if (!meetingRes.ok) {
            const meetingErr = await meetingRes.json().catch(() => ({}));
            console.error('Teams meeting creation failed:', meetingErr.error);
            // Don't fail the whole operation — class was created, just meeting failed
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

          <TextField
            label="Topic"
            select
            fullWidth
            value={formData.topic_id}
            onChange={(e) => setFormData((f) => ({ ...f, topic_id: e.target.value }))}
            SelectProps={{ native: true }}
            InputLabelProps={{ shrink: true }}
          >
            <option value="">-- Select Topic --</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </TextField>

          <TextField
            label="Batch"
            select
            fullWidth
            value={formData.batch_id}
            onChange={(e) => setFormData((f) => ({ ...f, batch_id: e.target.value }))}
            SelectProps={{ native: true }}
            InputLabelProps={{ shrink: true }}
            helperText="Leave as 'All Batches' for classroom-wide classes"
          >
            <option value="">All Batches (Classroom-wide)</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </TextField>

          {!editingClass && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Checkbox
                checked={formData.create_teams_meeting}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, create_teams_meeting: e.target.checked }))
                }
                sx={{ '& .MuiSvgIcon-root': { fontSize: 28 } }}
              />
              <Typography variant="body2">Create Teams Meeting</Typography>
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
    </Dialog>
  );
}
