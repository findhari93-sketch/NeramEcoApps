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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import { type SessionData } from './SessionCard';

interface SessionEditDialogProps {
  open: boolean;
  onClose: () => void;
  session: SessionData | null;
  planId: string;
  classroomId: string;
  onSaved: () => void;
  getToken: () => Promise<string | null>;
}

interface TopicOption {
  id: string;
  name: string;
}

interface TeacherOption {
  id: string;
  name: string;
  avatar_url?: string | null;
}

export default function SessionEditDialog({
  open,
  onClose,
  session,
  planId,
  classroomId,
  onSaved,
  getToken,
}: SessionEditDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [topicId, setTopicId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Options
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [optionsLoaded, setOptionsLoaded] = useState(false);

  useEffect(() => {
    if (open && session) {
      setTitle(session.title || '');
      setDescription(session.description || '');
      setTopicId(session.topic_id || '');
      setTeacherId(session.teacher_id || '');
      setNotes(session.notes || '');
      setError(null);
    }
  }, [open, session]);

  // Fetch topics and teachers
  useEffect(() => {
    if (!open || !classroomId || optionsLoaded) return;

    async function fetchOptions() {
      try {
        const token = await getToken();
        if (!token) return;

        const [topicsRes, teachersRes] = await Promise.all([
          fetch(`/api/topics?classroom=${classroomId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/classrooms/${classroomId}/members?role=teacher`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (topicsRes.ok) {
          const data = await topicsRes.json();
          setTopics(data.topics || []);
        }
        if (teachersRes.ok) {
          const data = await teachersRes.json();
          setTeachers(data.members || []);
        }
        setOptionsLoaded(true);
      } catch (err) {
        console.error('Failed to load options:', err);
      }
    }

    fetchOptions();
  }, [open, classroomId, optionsLoaded, getToken]);

  // Reset loaded state when dialog closes
  useEffect(() => {
    if (!open) setOptionsLoaded(false);
  }, [open]);

  const handleSubmit = async () => {
    if (!session) return;
    setSubmitting(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) throw new Error('Authentication required');

      const res = await fetch(`/api/course-plans/${planId}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          session_id: session.id,
          title: title.trim(),
          description: description.trim() || null,
          topic_id: topicId || null,
          teacher_id: teacherId || null,
          notes: notes.trim() || null,
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
      <DialogTitle sx={{ fontWeight: 700 }}>Edit Session</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
          {session && (
            <Typography variant="body2" color="text.secondary">
              Day {session.day_number} &bull; {session.slot?.toUpperCase()} slot
            </Typography>
          )}

          <TextField
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            fullWidth
            inputProps={{ style: { minHeight: 24 } }}
          />

          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={2}
          />

          <FormControl fullWidth>
            <InputLabel shrink>Topic</InputLabel>
            <Select
              value={topicId}
              label="Topic"
              onChange={(e) => setTopicId(e.target.value)}
              displayEmpty
              notched
              sx={{ minHeight: 48 }}
            >
              <MenuItem value="">
                <em>-- None --</em>
              </MenuItem>
              {topics.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel shrink>Teacher</InputLabel>
            <Select
              value={teacherId}
              label="Teacher"
              onChange={(e) => setTeacherId(e.target.value)}
              displayEmpty
              notched
              sx={{ minHeight: 48 }}
            >
              <MenuItem value="">
                <em>-- None --</em>
              </MenuItem>
              {teachers.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            fullWidth
            multiline
            rows={3}
            placeholder="Internal notes for this session..."
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
          disabled={submitting}
          sx={{ minHeight: 48 }}
        >
          {submitting ? <CircularProgress size={20} color="inherit" /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
