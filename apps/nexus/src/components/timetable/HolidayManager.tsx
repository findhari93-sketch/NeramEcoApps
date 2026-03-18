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
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Alert,
  Divider,
} from '@neram/ui';
import DeleteIcon from '@mui/icons-material/Delete';
import EventBusyIcon from '@mui/icons-material/EventBusy';

export interface HolidayData {
  id: string;
  holiday_date: string;
  title: string;
  description: string | null;
  created_at: string;
}

interface HolidayManagerProps {
  open: boolean;
  onClose: () => void;
  classroomId: string;
  getToken: () => Promise<string | null>;
  onHolidaysChanged: () => void;
}

export default function HolidayManager({
  open,
  onClose,
  classroomId,
  getToken,
  onHolidaysChanged,
}: HolidayManagerProps) {
  const [holidays, setHolidays] = useState<HolidayData[]>([]);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHolidays = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      // Fetch all holidays (no date filter — show all)
      const res = await fetch(`/api/timetable/holidays?classroom_id=${classroomId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setHolidays(data.holidays || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchHolidays();
      setError(null);
    }
  }, [open]);

  const handleAdd = async () => {
    if (!date || !title) {
      setError('Date and title are required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/timetable/holidays', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          classroom_id: classroomId,
          holiday_date: date,
          title,
          description: description || null,
        }),
      });

      if (res.ok) {
        setDate('');
        setTitle('');
        setDescription('');
        fetchHolidays();
        onHolidaysChanged();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to add holiday');
      }
    } catch {
      setError('Failed to add holiday');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (holidayId: string) => {
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/timetable/holidays', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: holidayId, classroom_id: classroomId }),
      });

      if (res.ok) {
        fetchHolidays();
        onHolidaysChanged();
      }
    } catch {
      // ignore
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <EventBusyIcon color="error" />
        Manage Holidays
      </DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* Add holiday form */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2, pt: 1 }}>
          <TextField
            label="Holiday Date *"
            type="date"
            fullWidth
            value={date}
            onChange={(e) => setDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Holiday Title *"
            fullWidth
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Pongal, Republic Day"
          />
          <TextField
            label="Description"
            fullWidth
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            multiline
            rows={2}
          />
          <Button
            variant="contained"
            onClick={handleAdd}
            disabled={submitting || !date || !title}
            sx={{ minHeight: 48 }}
          >
            {submitting ? 'Adding...' : 'Add Holiday'}
          </Button>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Existing holidays */}
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          Upcoming Holidays ({holidays.length})
        </Typography>

        {loading ? (
          <Typography variant="body2" color="text.disabled">Loading...</Typography>
        ) : holidays.length === 0 ? (
          <Typography variant="body2" color="text.disabled">No holidays added yet</Typography>
        ) : (
          <List dense disablePadding>
            {holidays.map((h) => (
              <ListItem key={h.id} sx={{ px: 0 }}>
                <ListItemText
                  primary={h.title}
                  secondary={formatDate(h.holiday_date)}
                  primaryTypographyProps={{ fontWeight: 600, variant: 'body2' }}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
                <ListItemSecondaryAction>
                  <IconButton
                    edge="end"
                    size="small"
                    color="error"
                    onClick={() => handleDelete(h.id)}
                    sx={{ minWidth: 36, minHeight: 36 }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ minHeight: 48 }}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
