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
  Chip,
  IconButton,
  useMediaQuery,
  useTheme,
  CircularProgress,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';

interface CreatePlanDialogProps {
  open: boolean;
  onClose: () => void;
  classroomId: string;
  onCreated: () => void;
  getToken: () => Promise<string | null>;
}

const ALL_DAYS = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

const DEFAULT_DAYS = ['tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

interface SlotDef {
  slot: string;
  label: string;
  start_time: string;
  end_time: string;
}

const DEFAULT_SLOTS: SlotDef[] = [
  { slot: 'am', label: 'Morning', start_time: '11:00', end_time: '12:00' },
  { slot: 'pm', label: 'Evening', start_time: '19:00', end_time: '20:00' },
];

export default function CreatePlanDialog({
  open,
  onClose,
  classroomId,
  onCreated,
  getToken,
}: CreatePlanDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [durationWeeks, setDurationWeeks] = useState(5);
  const [selectedDays, setSelectedDays] = useState<string[]>(DEFAULT_DAYS);
  const [slots, setSlots] = useState<SlotDef[]>(DEFAULT_SLOTS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setDurationWeeks(5);
      setSelectedDays(DEFAULT_DAYS);
      setSlots([...DEFAULT_SLOTS]);
      setError(null);
    }
  }, [open]);

  const toggleDay = (dayKey: string) => {
    setSelectedDays((prev) =>
      prev.includes(dayKey) ? prev.filter((d) => d !== dayKey) : [...prev, dayKey]
    );
  };

  const updateSlot = (index: number, field: keyof SlotDef, value: string) => {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const addSlot = () => {
    setSlots((prev) => [
      ...prev,
      { slot: `slot${prev.length + 1}`, label: '', start_time: '09:00', end_time: '10:00' },
    ]);
  };

  const removeSlot = (index: number) => {
    if (slots.length <= 1) return;
    setSlots((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!name.trim() || !durationWeeks || selectedDays.length === 0 || slots.length === 0) return;
    setSubmitting(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) throw new Error('Authentication required');

      const res = await fetch('/api/course-plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          classroom_id: classroomId,
          name: name.trim(),
          description: description.trim() || undefined,
          duration_weeks: durationWeeks,
          days_per_week: selectedDays,
          sessions_per_day: slots.map((s) => ({
            slot: s.slot,
            label: s.label || s.slot.toUpperCase(),
            start_time: s.start_time,
            end_time: s.end_time,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create plan');
      }

      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create plan');
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
      <DialogTitle sx={{ fontWeight: 700 }}>Create Course Plan</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
          <TextField
            label="Plan Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            placeholder="e.g., NATA 2026 Foundation"
            inputProps={{ style: { minHeight: 24 } }}
          />

          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={3}
            placeholder="Optional description..."
          />

          <TextField
            label="Duration (weeks)"
            type="number"
            value={durationWeeks}
            onChange={(e) => setDurationWeeks(Math.max(1, parseInt(e.target.value) || 1))}
            fullWidth
            inputProps={{ min: 1, max: 52, style: { minHeight: 24 } }}
          />

          {/* Days per week */}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Class Days
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {ALL_DAYS.map((day) => (
                <Chip
                  key={day.key}
                  label={day.label}
                  onClick={() => toggleDay(day.key)}
                  color={selectedDays.includes(day.key) ? 'primary' : 'default'}
                  variant={selectedDays.includes(day.key) ? 'filled' : 'outlined'}
                  sx={{ minWidth: 48, minHeight: 36, fontWeight: 600 }}
                />
              ))}
            </Box>
          </Box>

          {/* Sessions per day */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Sessions per Day
              </Typography>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={addSlot}
                sx={{ textTransform: 'none', minHeight: 36 }}
              >
                Add Slot
              </Button>
            </Box>
            {slots.map((slot, i) => (
              <Box
                key={i}
                sx={{
                  display: 'flex',
                  gap: 1,
                  alignItems: 'center',
                  mb: 1.5,
                  p: 1.5,
                  bgcolor: 'action.hover',
                  borderRadius: 1.5,
                  flexWrap: { xs: 'wrap', sm: 'nowrap' },
                }}
              >
                <TextField
                  label="Slot Name"
                  value={slot.label}
                  onChange={(e) => updateSlot(i, 'label', e.target.value)}
                  size="small"
                  sx={{ flex: 1, minWidth: { xs: '100%', sm: 120 } }}
                  placeholder="e.g., Morning"
                />
                <TextField
                  label="Start"
                  type="time"
                  value={slot.start_time}
                  onChange={(e) => updateSlot(i, 'start_time', e.target.value)}
                  size="small"
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: { xs: 'calc(50% - 20px)', sm: 120 } }}
                />
                <TextField
                  label="End"
                  type="time"
                  value={slot.end_time}
                  onChange={(e) => updateSlot(i, 'end_time', e.target.value)}
                  size="small"
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: { xs: 'calc(50% - 20px)', sm: 120 } }}
                />
                <IconButton
                  size="small"
                  onClick={() => removeSlot(i)}
                  disabled={slots.length <= 1}
                  sx={{ minWidth: 40, minHeight: 40 }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Box>

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
          disabled={!name.trim() || selectedDays.length === 0 || slots.length === 0 || submitting}
          sx={{ minHeight: 48 }}
        >
          {submitting ? <CircularProgress size={20} color="inherit" /> : 'Create Plan'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
