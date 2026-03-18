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

interface ConflictingClass {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
}

interface HolidayManagerProps {
  open: boolean;
  onClose: () => void;
  classroomId: string;
  getToken: () => Promise<string | null>;
  onHolidaysChanged: () => void;
  /** Check if classes exist on a given date — returns conflicting classes */
  getClassesOnDate?: (date: string) => ConflictingClass[];
  /** Cancel a class by id */
  onCancelClass?: (classId: string) => Promise<void>;
  /** Pre-fill date (e.g. from calendar context) */
  prefillDate?: string;
}

export default function HolidayManager({
  open,
  onClose,
  classroomId,
  getToken,
  onHolidaysChanged,
  getClassesOnDate,
  onCancelClass,
  prefillDate,
}: HolidayManagerProps) {
  const [holidays, setHolidays] = useState<HolidayData[]>([]);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictClasses, setConflictClasses] = useState<ConflictingClass[]>([]);
  const [showConflictConfirm, setShowConflictConfirm] = useState(false);

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
      // Default date to prefillDate or today
      const today = new Date();
      const defaultDate = prefillDate || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      setDate(defaultDate);
    }
  }, [open]);

  const handleAdd = async () => {
    if (!date || !title) {
      setError('Date and title are required');
      return;
    }

    // Check for conflicting classes on this date
    if (getClassesOnDate) {
      const conflicts = getClassesOnDate(date);
      if (conflicts.length > 0) {
        setConflictClasses(conflicts);
        setShowConflictConfirm(true);
        return;
      }
    }

    await doAddHoliday();
  };

  const handleConfirmConflict = async () => {
    setShowConflictConfirm(false);
    setSubmitting(true);
    setError(null);

    // Cancel all conflicting classes first
    if (onCancelClass) {
      try {
        for (const cls of conflictClasses) {
          await onCancelClass(cls.id);
        }
      } catch {
        setError('Failed to cancel existing classes');
        setSubmitting(false);
        return;
      }
    }

    setConflictClasses([]);
    await doAddHoliday();
  };

  const doAddHoliday = async () => {
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

      {/* Conflict confirmation dialog */}
      <Dialog open={showConflictConfirm} onClose={() => setShowConflictConfirm(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Classes exist on this date</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            There {conflictClasses.length === 1 ? 'is' : 'are'} {conflictClasses.length} class{conflictClasses.length === 1 ? '' : 'es'} scheduled on this date. They will be cancelled if you mark this as a holiday:
          </Typography>
          {conflictClasses.map((c) => (
            <Typography key={c.id} variant="body2" sx={{ fontWeight: 600, ml: 1, mb: 0.5 }}>
              &bull; {c.title} ({c.start_time} - {c.end_time})
            </Typography>
          ))}
          <Typography variant="body2" color="error" sx={{ mt: 1.5 }}>
            Do you want to cancel these classes and mark this day as a holiday?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowConflictConfirm(false)} sx={{ minHeight: 48 }}>
            No, keep classes
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmConflict}
            sx={{ minHeight: 48 }}
          >
            Cancel classes &amp; add holiday
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
