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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  useMediaQuery,
  useTheme,
  IconButton,
  Typography,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';

interface SessionOption {
  id: string;
  day_number?: number;
  day_of_week?: string;
  slot?: string;
  title?: string;
}

interface HomeworkCreateDialogProps {
  open: boolean;
  onClose: () => void;
  planId: string;
  onCreated: () => void;
  getToken: () => Promise<string | null>;
}

const HOMEWORK_TYPES = [
  { value: 'drawing', label: 'Drawing' },
  { value: 'mcq', label: 'MCQ' },
  { value: 'study', label: 'Study' },
  { value: 'review', label: 'Review' },
  { value: 'mixed', label: 'Mixed' },
];

export default function HomeworkCreateDialog({
  open,
  onClose,
  planId,
  onCreated,
  getToken,
}: HomeworkCreateDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [sessionId, setSessionId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('mixed');
  const [maxPoints, setMaxPoints] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState('');
  const [dueDate, setDueDate] = useState('');

  // Fetch sessions when dialog opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function fetchSessions() {
      setLoadingSessions(true);
      try {
        const token = await getToken();
        if (!token || cancelled) return;

        const res = await fetch(`/api/course-plans/${planId}/sessions`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setSessions(data.sessions || []);
          }
        }
      } catch {
        // Sessions are optional, non-critical
      } finally {
        if (!cancelled) setLoadingSessions(false);
      }
    }

    fetchSessions();
    return () => { cancelled = true; };
  }, [open, planId, getToken]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setSessionId('');
      setTitle('');
      setDescription('');
      setType('mixed');
      setMaxPoints('');
      setEstimatedMinutes('');
      setDueDate('');
      setError(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const body: Record<string, unknown> = {
        plan_id: planId,
        title: title.trim(),
        type,
      };

      if (sessionId) body.session_id = sessionId;
      if (description.trim()) body.description = description.trim();
      if (maxPoints) body.max_points = Number(maxPoints);
      if (estimatedMinutes) body.estimated_minutes = Number(estimatedMinutes);
      if (dueDate) body.due_date = dueDate;

      const res = await fetch(`/api/course-plans/${planId}/homework`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create homework');
      }

      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create homework');
    } finally {
      setSaving(false);
    }
  };

  const formatSessionLabel = (s: SessionOption): string => {
    const parts: string[] = [];
    if (s.title) parts.push(s.title);
    if (s.day_of_week) parts.push(s.day_of_week);
    if (s.slot) parts.push(s.slot);
    if (parts.length === 0) parts.push(`Session (Day ${s.day_number || '?'})`);
    return parts.join(' - ');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: { borderRadius: isMobile ? 0 : 3 },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontWeight: 700,
          pb: 1,
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Add Homework
        </Typography>
        <IconButton onClick={onClose} sx={{ width: 40, height: 40 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        {/* Session selector */}
        <FormControl fullWidth size="small">
          <InputLabel>Session (optional)</InputLabel>
          <Select
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            label="Session (optional)"
            disabled={loadingSessions}
            sx={{ minHeight: 48 }}
          >
            <MenuItem value="">
              <em>No session</em>
            </MenuItem>
            {sessions.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {formatSessionLabel(s)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Title */}
        <TextField
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          fullWidth
          size="small"
          placeholder="e.g., Draw a perspective scene"
          sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
        />

        {/* Description */}
        <TextField
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          multiline
          minRows={2}
          maxRows={5}
          fullWidth
          size="small"
          placeholder="Instructions for the student..."
        />

        {/* Type */}
        <FormControl fullWidth size="small">
          <InputLabel>Type</InputLabel>
          <Select
            value={type}
            onChange={(e) => setType(e.target.value)}
            label="Type"
            sx={{ minHeight: 48 }}
          >
            {HOMEWORK_TYPES.map((t) => (
              <MenuItem key={t.value} value={t.value}>
                {t.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Points and Time row */}
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            label="Max Points"
            type="number"
            value={maxPoints}
            onChange={(e) => setMaxPoints(e.target.value)}
            size="small"
            inputProps={{ min: 0, step: 1 }}
            sx={{ flex: 1, '& .MuiInputBase-root': { minHeight: 48 } }}
          />
          <TextField
            label="Est. Minutes"
            type="number"
            value={estimatedMinutes}
            onChange={(e) => setEstimatedMinutes(e.target.value)}
            size="small"
            inputProps={{ min: 0, step: 5 }}
            sx={{ flex: 1, '& .MuiInputBase-root': { minHeight: 48 } }}
          />
        </Box>

        {/* Due date */}
        <TextField
          label="Due Date"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          fullWidth
          size="small"
          InputLabelProps={{ shrink: true }}
          sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
        />

        {error && (
          <Typography variant="body2" color="error" sx={{ fontWeight: 600 }}>
            {error}
          </Typography>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button
          onClick={onClose}
          disabled={saving}
          sx={{ textTransform: 'none', minHeight: 48 }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={saving || !title.trim()}
          startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}
          sx={{ textTransform: 'none', minHeight: 48, fontWeight: 600 }}
        >
          {saving ? 'Creating...' : 'Create Homework'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
