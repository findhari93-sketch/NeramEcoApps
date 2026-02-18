'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  Box,
  Container,
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
  CircularProgress,
  Chip,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  Slide,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import { TransitionProps } from '@mui/material/transitions';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { LoginModal } from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';

// Slide transition for bottom sheet on mobile
const SlideTransition = (props: TransitionProps & { children: React.ReactElement }) => (
  <Slide direction="up" {...props} />
);

interface DemoSlot {
  id: string;
  title: string;
  slot_date: string;
  slot_time: string;
  duration_minutes: number;
  max_registrations: number;
  current_registrations: number;
  status: string;
  demo_mode: string;
  display_date?: string;
  display_time?: string;
  spots_left?: number;
}

interface SundayOption {
  date: string;
  displayDate: string;
  dayName: string;
  monthDay: string;
}

export default function DemoClassPage() {
  const params = useParams();
  const locale = params.locale as string;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { user } = useFirebaseAuth();

  // State
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Slots and selection
  const [availableSlots, setAvailableSlots] = useState<DemoSlot[]>([]);
  const [sundays, setSundays] = useState<SundayOption[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<'morning' | 'afternoon' | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<DemoSlot | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    currentClass: '',
    interestCourse: '',
    city: '',
  });

  // Phone verification
  const [showPhoneVerification, setShowPhoneVerification] = useState(false);
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);

  useEffect(() => {
    generateSundays();
    fetchAvailableSlots();
  }, []);

  useEffect(() => {
    // Pre-fill user data if logged in
    if (user) {
      setFormData(prev => ({
        ...prev,
        name: user.name || prev.name,
        email: user.email || prev.email,
        phone: user.phone?.replace('+91', '') || prev.phone,
      }));
      if (user.phone) {
        setVerifiedPhone(user.phone.replace('+91', ''));
      }
    }
  }, [user]);

  const generateSundays = () => {
    const result: SundayOption[] = [];
    const today = new Date();

    // Find next Sunday
    const dayOfWeek = today.getDay();
    const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek; // Skip today if Sunday
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
      const dayName = sunday.toLocaleDateString('en-IN', { weekday: 'short' });
      const monthDay = sunday.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });

      result.push({ date: dateStr, displayDate, dayName, monthDay });
    }

    setSundays(result);
    if (result.length > 0) {
      setSelectedDate(result[0].date);
    }
  };

  const fetchAvailableSlots = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/demo-class/slots');
      const data = await response.json();

      if (response.ok) {
        setAvailableSlots(data.slots || []);
      }
    } catch (err) {
      console.error('Failed to fetch slots:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    setSelectedTime(null);
    setSelectedSlot(null);
  };

  const handleTimeSelect = (time: 'morning' | 'afternoon') => {
    setSelectedTime(time);

    // Find matching slot
    const targetTime = time === 'morning' ? '10:00' : '15:00';
    const slot = availableSlots.find(
      s => s.slot_date === selectedDate && s.slot_time.startsWith(targetTime)
    );
    setSelectedSlot(slot || null);
  };

  const handleProceed = () => {
    if (!selectedSlot) {
      setError('Please select a date and time');
      return;
    }
    setShowForm(true);
  };

  const handleFormChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handlePhoneVerified = (phone: string) => {
    setVerifiedPhone(phone);
    setFormData(prev => ({ ...prev, phone }));
    setShowPhoneVerification(false);
  };

  const handleSubmit = async () => {
    // Validation
    if (!formData.name.trim()) {
      setError('Please enter your name');
      return;
    }

    if (!verifiedPhone && !formData.phone) {
      setShowPhoneVerification(true);
      return;
    }

    if (!verifiedPhone) {
      setShowPhoneVerification(true);
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const response = await fetch('/api/demo-class/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotId: selectedSlot?.id,
          name: formData.name,
          phone: verifiedPhone,
          email: formData.email,
          currentClass: formData.currentClass,
          interestCourse: formData.interestCourse,
          city: formData.city,
          firebaseUid: user?.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      setSuccess(true);
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (timeStr: string) => {
    const [hours] = timeStr.split(':').map(Number);
    return hours < 12 ? 'Morning' : 'Afternoon';
  };

  const getSpotsLeft = (slot: DemoSlot) => {
    return slot.max_registrations - slot.current_registrations;
  };

  const getSlotForTime = (time: 'morning' | 'afternoon') => {
    const targetTime = time === 'morning' ? '10:00' : '15:00';
    return availableSlots.find(
      s => s.slot_date === selectedDate && s.slot_time.startsWith(targetTime)
    );
  };

  // Success Screen
  if (success) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <Container maxWidth="sm" sx={{ py: { xs: 4, md: 8 }, textAlign: 'center' }}>
          <Box
            sx={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              bgcolor: 'success.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 3,
            }}
          >
            <CheckCircleIcon sx={{ fontSize: 48, color: 'white' }} />
          </Box>

          <Typography variant="h4" fontWeight="bold" gutterBottom>
            You&apos;re Registered!
          </Typography>

          <Typography variant="h6" color="text.secondary" gutterBottom>
            {selectedSlot && sundays.find(s => s.date === selectedSlot.slot_date)?.displayDate}
          </Typography>

          <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
            {selectedTime === 'morning' ? '10:00 AM' : '3:00 PM'}
          </Typography>

          <Alert severity="info" sx={{ mb: 3, textAlign: 'left' }}>
            <Typography variant="body2">
              Your registration is being reviewed. You&apos;ll receive a confirmation email with class
              details once approved.
            </Typography>
          </Alert>

          <Stack spacing={2}>
            <Button
              variant="contained"
              size="large"
              fullWidth
              href={`/${locale}`}
              sx={{ minHeight: 48 }}
            >
              Back to Home
            </Button>
            <Button
              variant="outlined"
              size="large"
              fullWidth
              href={`/${locale}/courses`}
              sx={{ minHeight: 48 }}
            >
              Explore Courses
            </Button>
          </Stack>
        </Container>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Hero Section */}
      <Box
        sx={{
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          py: { xs: 4, md: 6 },
          textAlign: 'center',
        }}
      >
        <Container maxWidth="md">
          <Typography variant="h3" component="h1" fontWeight="bold" gutterBottom sx={{ fontSize: { xs: '2rem', md: '3rem' } }}>
            Free Demo Class
          </Typography>
          <Typography variant="h6" sx={{ opacity: 0.9, fontSize: { xs: '1rem', md: '1.25rem' } }}>
            Experience our teaching methodology before enrolling
          </Typography>
        </Container>
      </Box>

      <Container maxWidth="md" sx={{ py: { xs: 3, md: 6 } }}>
        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {/* Date Selection */}
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CalendarTodayIcon /> Select a Date
            </Typography>

            <Box
              sx={{
                display: 'flex',
                gap: 2,
                overflowX: 'auto',
                pb: 2,
                mb: 4,
                '&::-webkit-scrollbar': { height: 6 },
                '&::-webkit-scrollbar-thumb': { bgcolor: 'grey.300', borderRadius: 3 },
              }}
            >
              {sundays.map((sunday) => (
                <Card
                  key={sunday.date}
                  onClick={() => handleDateSelect(sunday.date)}
                  sx={{
                    minWidth: 100,
                    cursor: 'pointer',
                    textAlign: 'center',
                    border: 2,
                    borderColor: selectedDate === sunday.date ? 'primary.main' : 'transparent',
                    bgcolor: selectedDate === sunday.date ? 'primary.50' : 'background.paper',
                    transition: 'all 0.2s',
                    '&:hover': { borderColor: 'primary.light' },
                  }}
                >
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="caption" color="text.secondary">
                      {sunday.dayName}
                    </Typography>
                    <Typography variant="h6" fontWeight="bold">
                      {sunday.monthDay}
                    </Typography>
                  </CardContent>
                </Card>
              ))}
            </Box>

            {/* Time Selection */}
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AccessTimeIcon /> Select a Time
            </Typography>

            <Grid container spacing={2} sx={{ mb: 4 }}>
              {(['morning', 'afternoon'] as const).map((time) => {
                const slot = getSlotForTime(time);
                const spotsLeft = slot ? getSpotsLeft(slot) : 0;
                const isFull = slot && spotsLeft <= 0;
                const isSelected = selectedTime === time;

                return (
                  <Grid item xs={6} key={time}>
                    <Card
                      onClick={() => !isFull && handleTimeSelect(time)}
                      sx={{
                        cursor: isFull ? 'not-allowed' : 'pointer',
                        opacity: isFull ? 0.5 : 1,
                        border: 2,
                        borderColor: isSelected ? 'primary.main' : 'transparent',
                        bgcolor: isSelected ? 'primary.50' : 'background.paper',
                        transition: 'all 0.2s',
                        '&:hover': { borderColor: isFull ? 'transparent' : 'primary.light' },
                      }}
                    >
                      <CardContent sx={{ textAlign: 'center', p: { xs: 2, md: 3 } }}>
                        <Typography variant="h6" fontWeight="bold">
                          {time === 'morning' ? 'Morning' : 'Afternoon'}
                        </Typography>
                        <Typography variant="h5" color="primary.main" fontWeight="bold">
                          {time === 'morning' ? '10:00 AM' : '3:00 PM'}
                        </Typography>
                        {slot ? (
                          <Chip
                            label={isFull ? 'Full' : `${spotsLeft} spots left`}
                            color={isFull ? 'error' : spotsLeft < 10 ? 'warning' : 'success'}
                            size="small"
                            sx={{ mt: 1 }}
                          />
                        ) : (
                          <Chip label="No slot" variant="outlined" size="small" sx={{ mt: 1 }} />
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>

            {/* Info */}
            <Alert severity="info" sx={{ mb: 4 }}>
              Demo class will be conducted when 10+ students register. You&apos;ll receive a
              confirmation email once your registration is approved.
            </Alert>

            {/* Continue Button */}
            <Button
              variant="contained"
              size="large"
              fullWidth
              onClick={handleProceed}
              disabled={!selectedSlot}
              sx={{ minHeight: 56, fontSize: '1.1rem' }}
            >
              Continue
            </Button>
          </>
        )}
      </Container>

      {/* Registration Form (Bottom Sheet on Mobile) */}
      <Dialog
        open={showForm}
        onClose={() => setShowForm(false)}
        fullScreen={isMobile}
        maxWidth="sm"
        fullWidth
        TransitionComponent={isMobile ? SlideTransition : undefined}
        sx={{
          '& .MuiDialog-paper': {
            ...(isMobile && {
              position: 'fixed',
              bottom: 0,
              m: 0,
              borderRadius: '16px 16px 0 0',
              maxHeight: '90vh',
            }),
          },
        }}
      >
        <DialogTitle sx={{ textAlign: 'center', pt: 3 }}>
          <Typography variant="h5" fontWeight="bold">
            Complete Registration
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {selectedSlot && sundays.find(s => s.date === selectedSlot.slot_date)?.displayDate} at{' '}
            {selectedTime === 'morning' ? '10:00 AM' : '3:00 PM'}
          </Typography>
        </DialogTitle>

        <DialogContent>
          <Stack spacing={3} sx={{ py: 2 }}>
            <TextField
              fullWidth
              label="Your Name"
              value={formData.name}
              onChange={(e) => handleFormChange('name', e.target.value)}
              required
              inputProps={{ style: { fontSize: 16 } }}
            />

            <Box>
              <TextField
                fullWidth
                label="Phone Number"
                value={verifiedPhone || formData.phone}
                onChange={(e) => handleFormChange('phone', e.target.value)}
                disabled={!!verifiedPhone}
                required
                InputProps={{
                  startAdornment: (
                    <Typography sx={{ mr: 1, color: 'text.secondary' }}>+91</Typography>
                  ),
                  endAdornment: verifiedPhone ? (
                    <CheckCircleIcon color="success" />
                  ) : (
                    <Button size="small" onClick={() => setShowPhoneVerification(true)}>
                      Verify
                    </Button>
                  ),
                }}
                inputProps={{ inputMode: 'numeric', style: { fontSize: 16 } }}
              />
              {verifiedPhone && (
                <Typography variant="caption" color="success.main">
                  Phone verified
                </Typography>
              )}
            </Box>

            <TextField
              fullWidth
              label="Email (Optional)"
              type="email"
              value={formData.email}
              onChange={(e) => handleFormChange('email', e.target.value)}
              inputProps={{ style: { fontSize: 16 } }}
            />

            <Grid container spacing={2}>
              <Grid item xs={6}>
                <FormControl fullWidth>
                  <InputLabel>Current Class</InputLabel>
                  <Select
                    value={formData.currentClass}
                    label="Current Class"
                    onChange={(e) => handleFormChange('currentClass', e.target.value)}
                  >
                    <MenuItem value="10th">Class 10</MenuItem>
                    <MenuItem value="11th">Class 11</MenuItem>
                    <MenuItem value="12th">Class 12</MenuItem>
                    <MenuItem value="12th-pass">12th Pass</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <FormControl fullWidth>
                  <InputLabel>Interest</InputLabel>
                  <Select
                    value={formData.interestCourse}
                    label="Interest"
                    onChange={(e) => handleFormChange('interestCourse', e.target.value)}
                  >
                    <MenuItem value="nata">NATA</MenuItem>
                    <MenuItem value="jee_paper2">JEE Paper 2</MenuItem>
                    <MenuItem value="both">Both</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            <Button
              variant="contained"
              size="large"
              fullWidth
              onClick={handleSubmit}
              disabled={submitting || !verifiedPhone || !formData.name}
              sx={{ minHeight: 56, fontSize: '1.1rem' }}
            >
              {submitting ? <CircularProgress size={24} color="inherit" /> : 'Book Demo Class'}
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>

      {/* Phone Verification Modal */}
      <LoginModal
        open={showPhoneVerification}
        onClose={() => setShowPhoneVerification(false)}
        allowClose={true}
        onAuthenticated={() => {
          setShowPhoneVerification(false);
          // Re-check user phone after verification
          if (user?.phone) {
            setVerifiedPhone(user.phone.replace('+91', ''));
            setFormData(prev => ({ ...prev, phone: user.phone!.replace('+91', '') }));
          }
        }}
        apiBaseUrl={process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011'}
        phoneOnly={true}
      />
    </Box>
  );
}
