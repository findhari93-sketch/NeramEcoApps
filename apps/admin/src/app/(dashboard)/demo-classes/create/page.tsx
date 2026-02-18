'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Chip,
  Stack,
  Divider,
  CircularProgress,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import type { DemoMode } from '@neram/database';

interface SundayOption {
  date: string;
  displayDate: string;
}

export default function CreateDemoSlotPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Available Sundays for quick selection
  const [sundays, setSundays] = useState<SundayOption[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    title: 'Free Demo Class',
    description: '',
    slot_date: '',
    slot_time: '10:00',
    duration_minutes: 60,
    min_registrations: 10,
    max_registrations: 50,
    demo_mode: 'online' as DemoMode,
    instructor_name: '',
  });

  useEffect(() => {
    // Generate next 4 Sundays
    const generateSundays = () => {
      const result: SundayOption[] = [];
      const today = new Date();

      // Find next Sunday
      const dayOfWeek = today.getDay();
      const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
      const nextSunday = new Date(today);
      nextSunday.setDate(today.getDate() + daysUntilSunday);

      for (let i = 0; i < 4; i++) {
        const sunday = new Date(nextSunday);
        sunday.setDate(nextSunday.getDate() + i * 7);

        const dateStr = sunday.toISOString().split('T')[0];
        const displayDate = sunday.toLocaleDateString('en-IN', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        });

        result.push({ date: dateStr, displayDate });
      }

      setSundays(result);
    };

    generateSundays();
  }, []);

  const handleChange = (field: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.slot_date) {
      setError('Please select a date');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/demo-classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          slot_time: `${formData.slot_time}:00`,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create demo slot');
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/demo-classes');
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const timeSlots = [
    { value: '10:00', label: 'Morning - 10:00 AM' },
    { value: '15:00', label: 'Afternoon - 3:00 PM' },
    { value: '17:00', label: 'Evening - 5:00 PM' },
  ];

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.back()}
        >
          Back
        </Button>
        <Box>
          <Typography variant="h4" component="h1" fontWeight="bold">
            Create Demo Slot
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Schedule a new demo class for students
          </Typography>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 3 }}>
          Demo slot created successfully! Redirecting...
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <Grid container spacing={3}>
          {/* Left Column - Main Form */}
          <Grid item xs={12} md={8}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Slot Details
                </Typography>

                <TextField
                  fullWidth
                  label="Title"
                  value={formData.title}
                  onChange={(e) => handleChange('title', e.target.value)}
                  sx={{ mb: 3 }}
                />

                <TextField
                  fullWidth
                  label="Description (Optional)"
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  multiline
                  rows={3}
                  sx={{ mb: 3 }}
                />

                <Divider sx={{ my: 3 }} />

                <Typography variant="h6" gutterBottom>
                  Date & Time
                </Typography>

                {/* Quick Sunday Selection */}
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Quick Select (Next 4 Sundays)
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 3 }}>
                  {sundays.map((sunday) => (
                    <Chip
                      key={sunday.date}
                      label={sunday.displayDate}
                      onClick={() => handleChange('slot_date', sunday.date)}
                      color={formData.slot_date === sunday.date ? 'primary' : 'default'}
                      variant={formData.slot_date === sunday.date ? 'filled' : 'outlined'}
                      sx={{ mb: 1 }}
                    />
                  ))}
                </Stack>

                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Date"
                      type="date"
                      value={formData.slot_date}
                      onChange={(e) => handleChange('slot_date', e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      helperText="Or pick a custom date"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
                      <InputLabel>Time Slot</InputLabel>
                      <Select
                        value={formData.slot_time}
                        label="Time Slot"
                        onChange={(e) => handleChange('slot_time', e.target.value)}
                      >
                        {timeSlots.map((slot) => (
                          <MenuItem key={slot.value} value={slot.value}>
                            {slot.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>

                <TextField
                  fullWidth
                  label="Duration (minutes)"
                  type="number"
                  value={formData.duration_minutes}
                  onChange={(e) => handleChange('duration_minutes', parseInt(e.target.value))}
                  sx={{ mt: 2 }}
                  inputProps={{ min: 30, max: 180 }}
                />

                <Divider sx={{ my: 3 }} />

                <Typography variant="h6" gutterBottom>
                  Capacity
                </Typography>

                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Minimum Registrations"
                      type="number"
                      value={formData.min_registrations}
                      onChange={(e) => handleChange('min_registrations', parseInt(e.target.value))}
                      helperText="Demo conducted when this is reached"
                      inputProps={{ min: 1, max: 100 }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Maximum Registrations"
                      type="number"
                      value={formData.max_registrations}
                      onChange={(e) => handleChange('max_registrations', parseInt(e.target.value))}
                      helperText="Registration closed after this"
                      inputProps={{ min: 1, max: 200 }}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Right Column - Settings */}
          <Grid item xs={12} md={4}>
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Mode
                </Typography>

                <FormControl fullWidth>
                  <InputLabel>Demo Mode</InputLabel>
                  <Select
                    value={formData.demo_mode}
                    label="Demo Mode"
                    onChange={(e) => handleChange('demo_mode', e.target.value)}
                  >
                    <MenuItem value="online">Online (Zoom/Teams)</MenuItem>
                    <MenuItem value="offline">Offline (Physical Class)</MenuItem>
                    <MenuItem value="hybrid">Hybrid (Both Options)</MenuItem>
                  </Select>
                </FormControl>
              </CardContent>
            </Card>

            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Instructor
                </Typography>

                <TextField
                  fullWidth
                  label="Instructor Name (Optional)"
                  value={formData.instructor_name}
                  onChange={(e) => handleChange('instructor_name', e.target.value)}
                  helperText="Leave empty to assign later"
                />
              </CardContent>
            </Card>

            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={loading || !formData.slot_date}
              sx={{ minHeight: 48 }}
            >
              {loading ? <CircularProgress size={24} /> : 'Create Demo Slot'}
            </Button>
          </Grid>
        </Grid>
      </form>
    </Box>
  );
}
