'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Drawer,
  TextField,
  useMediaQuery,
  useTheme,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
} from '@neram/ui';
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined';
import WbTwilightOutlinedIcon from '@mui/icons-material/WbTwilightOutlined';

interface ExamDateOption {
  id: string;
  exam_date: string;
  phase: string;
  attempt_number: number;
  label: string | null;
}

interface AddExamDateDialogProps {
  open: boolean;
  onClose: () => void;
  examDates: ExamDateOption[];
  classroomId: string;
  getToken: () => Promise<string | null>;
  onSubmitted: () => void;
}

function formatDateLabel(dateStr: string, label: string | null): string {
  const date = new Date(dateStr + 'T00:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const formatted = `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  return label ? `${formatted} — ${label}` : formatted;
}

export default function AddExamDateDialog({
  open,
  onClose,
  examDates,
  classroomId,
  getToken,
  onSubmitted,
}: AddExamDateDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [selectedDateId, setSelectedDateId] = useState('');
  const [city, setCity] = useState('');
  const [session, setSession] = useState<'morning' | 'afternoon' | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!selectedDateId) {
      setError('Please select an exam date');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const token = await getToken();
      const res = await fetch('/api/exam-schedule/my-date', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          exam_date_id: selectedDateId,
          exam_city: city.trim() || null,
          exam_session: session || null,
          classroom_id: classroomId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit');
      }

      onSubmitted();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit exam date');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedDateId('');
    setCity('');
    setSession('');
    setError('');
    onClose();
  };

  return (
    <Drawer
      anchor={isMobile ? 'bottom' : 'right'}
      open={open}
      onClose={handleClose}
      PaperProps={{
        sx: {
          width: isMobile ? '100%' : 400,
          maxHeight: isMobile ? '85vh' : '100%',
          borderTopLeftRadius: isMobile ? 16 : 0,
          borderTopRightRadius: isMobile ? 16 : 0,
        },
      }}
    >
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Typography variant="h6" fontWeight={700}>
          Add My Exam Date
        </Typography>

        {/* Exam Date Select */}
        <TextField
          select
          label="Exam Date"
          value={selectedDateId}
          onChange={(e) => setSelectedDateId(e.target.value)}
          fullWidth
          InputProps={{ sx: { minHeight: 48 } }}
        >
          {examDates.map((d) => (
            <MenuItem key={d.id} value={d.id}>
              {formatDateLabel(d.exam_date, d.label)}
            </MenuItem>
          ))}
          {examDates.length === 0 && (
            <MenuItem disabled value="">
              No upcoming dates available
            </MenuItem>
          )}
        </TextField>

        {/* City Input */}
        <TextField
          label="City"
          placeholder="e.g., Chennai, Bangalore"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          fullWidth
          InputProps={{ sx: { minHeight: 48 } }}
        />

        {/* Session Toggle */}
        <Box>
          <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
            Session
          </Typography>
          <ToggleButtonGroup
            value={session}
            exclusive
            onChange={(_, v) => { if (v) setSession(v); }}
            fullWidth
            sx={{ minHeight: 48 }}
          >
            <ToggleButton value="morning" sx={{ textTransform: 'none', gap: 1 }}>
              <WbSunnyOutlinedIcon sx={{ fontSize: '1.1rem' }} />
              Morning
            </ToggleButton>
            <ToggleButton value="afternoon" sx={{ textTransform: 'none', gap: 1 }}>
              <WbTwilightOutlinedIcon sx={{ fontSize: '1.1rem' }} />
              Afternoon
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {error && (
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        )}

        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || !selectedDateId}
          fullWidth
          sx={{ textTransform: 'none', fontWeight: 700, minHeight: 48 }}
        >
          {submitting ? 'Submitting...' : 'Submit Exam Date'}
        </Button>
      </Box>
    </Drawer>
  );
}
