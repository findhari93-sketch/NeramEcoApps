'use client';

import { useState, useRef } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Rating,
  Alert,
  CircularProgress,
  Divider,
  Stack,
} from '@neram/ui';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import FeedbackIcon from '@mui/icons-material/Feedback';
import StarIcon from '@mui/icons-material/Star';
import BugReportIcon from '@mui/icons-material/BugReport';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import DesignServicesIcon from '@mui/icons-material/DesignServices';
import SpeedIcon from '@mui/icons-material/Speed';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';

const CATEGORIES = [
  { value: 'bug_report', label: 'Bug Report', icon: BugReportIcon, color: '#d32f2f' },
  { value: 'feature_request', label: 'Feature Request', icon: LightbulbIcon, color: '#ed6c02' },
  { value: 'ui_ux_issue', label: 'UI/UX Issue', icon: DesignServicesIcon, color: '#9c27b0' },
  { value: 'performance', label: 'Performance', icon: SpeedIcon, color: '#0288d1' },
  { value: 'other', label: 'Other', icon: MoreHorizIcon, color: '#757575' },
];

const RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
};

export default function FeedbackForm() {
  const [rating, setRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState(-1);
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [appVersion, setAppVersion] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [feedbackNumber, setFeedbackNumber] = useState('');
  const [error, setError] = useState('');
  const deviceInfoRef = useRef<Record<string, unknown>>({});

  // Capture device info once on first interaction — uses ref so no re-render/shake
  const captureDeviceInfo = () => {
    if (Object.keys(deviceInfoRef.current).length === 0) {
      deviceInfoRef.current = {
        userAgent: navigator.userAgent,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        platform: navigator.platform,
        language: navigator.language,
      };
    }
  };

  const handleSubmit = async () => {
    if (!rating || !category || description.trim().length < 10) return;

    captureDeviceInfo();
    setSubmitting(true);
    setError('');

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      try {
        const { getFirebaseAuth } = await import('@neram/auth');
        const auth = getFirebaseAuth();
        if (auth.currentUser) {
          const token = await auth.currentUser.getIdToken();
          headers['Authorization'] = `Bearer ${token}`;
        }
      } catch {
        // No auth — that's fine
      }

      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          rating,
          category,
          description: description.trim(),
          app_version: appVersion.trim() || undefined,
          email: email.trim() || undefined,
          device_info: deviceInfoRef.current,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit feedback');
      }

      const data = await res.json();
      setFeedbackNumber(data.feedbackNumber);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setRating(null);
    setCategory('');
    setDescription('');
    setAppVersion('');
    setEmail('');
    setSubmitted(false);
    setFeedbackNumber('');
    setError('');
  };

  const isValid = rating && category && description.trim().length >= 10;
  const activeRating = hoverRating !== -1 ? hoverRating : (rating || 0);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#f5f7fa',
        backgroundImage: 'linear-gradient(180deg, #1565C0 0%, #1565C0 120px, #f5f7fa 120px)',
      }}
    >
      {/* Top brand bar */}
      <Box sx={{ pt: { xs: 2.5, md: 4 }, pb: 1, textAlign: 'center' }}>
        <Typography
          variant="subtitle2"
          sx={{ color: 'rgba(255,255,255,0.85)', letterSpacing: 0.5 }}
        >
          aiArchitek by Neram Classes
        </Typography>
      </Box>

      <Container maxWidth="sm" sx={{ px: { xs: 2, sm: 3 }, pb: { xs: 4, md: 6 } }}>
        {submitted ? (
          /* ─── SUCCESS STATE ─── */
          <Paper
            elevation={0}
            sx={{
              p: { xs: 3, md: 4 },
              borderRadius: 3,
              textAlign: 'center',
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Box
              sx={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                bgcolor: '#e8f5e9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 2.5,
              }}
            >
              <CheckCircleOutlineIcon sx={{ fontSize: 40, color: 'success.main' }} />
            </Box>
            <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
              Thank You!
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 2.5 }}>
              Your feedback has been submitted successfully.
            </Typography>
            <Paper
              variant="outlined"
              sx={{ p: 2, mb: 3, bgcolor: 'grey.50', borderRadius: 2 }}
            >
              <Typography variant="caption" color="text.secondary">
                Feedback ID
              </Typography>
              <Typography variant="h6" fontWeight={700} sx={{ fontFamily: 'monospace' }}>
                {feedbackNumber}
              </Typography>
            </Paper>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              We appreciate your input and will use it to improve the app.
            </Typography>
            <Button
              variant="outlined"
              onClick={handleReset}
              fullWidth
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: 2,
                py: 1.5,
                minHeight: 48,
              }}
            >
              Submit Another Feedback
            </Button>
          </Paper>
        ) : (
          /* ─── FEEDBACK FORM ─── */
          <Paper
            elevation={0}
            sx={{
              p: { xs: 2.5, md: 4 },
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            {/* Header */}
            <Box sx={{ textAlign: 'center', mb: 3 }}>
              <Box
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  bgcolor: '#e3f2fd',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 1.5,
                }}
              >
                <FeedbackIcon sx={{ fontSize: 28, color: 'primary.main' }} />
              </Box>
              <Typography
                variant="h5"
                component="h1"
                sx={{ fontWeight: 700, fontSize: { xs: '1.375rem', md: '1.5rem' } }}
              >
                Share Your Feedback
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Help us make the app better for you
              </Typography>
            </Box>

            <Divider sx={{ mb: 3 }} />

            {error && (
              <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError('')}>
                {error}
              </Alert>
            )}

            {/* ── Star Rating ── */}
            <Box sx={{ mb: 3, textAlign: 'center' }}>
              <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                How would you rate your experience?
              </Typography>
              <Rating
                name="feedback-rating"
                value={rating}
                onChange={(_, newValue) => {
                  setRating(newValue);
                  captureDeviceInfo();
                }}
                onChangeActive={(_, newHover) => setHoverRating(newHover)}
                size="large"
                emptyIcon={<StarIcon style={{ opacity: 0.25 }} fontSize="inherit" />}
                sx={{
                  '& .MuiRating-iconFilled': { color: '#faaf00' },
                  '& .MuiRating-icon': {
                    fontSize: { xs: '2.5rem', md: '3rem' },
                    mx: 0.5,
                  },
                }}
              />
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  mt: 0.5,
                  minHeight: 24,
                  transition: 'opacity 0.2s',
                  opacity: activeRating > 0 ? 1 : 0,
                }}
              >
                {RATING_LABELS[activeRating] || '\u00A0'}
              </Typography>
            </Box>

            {/* ── Category Chips ── */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                What is this about?
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {CATEGORIES.map((c) => {
                  const Icon = c.icon;
                  const isSelected = category === c.value;
                  return (
                    <Button
                      key={c.value}
                      variant={isSelected ? 'contained' : 'outlined'}
                      size="small"
                      startIcon={<Icon sx={{ fontSize: '18px !important' }} />}
                      onClick={() => setCategory(c.value)}
                      sx={{
                        textTransform: 'none',
                        borderRadius: 6,
                        px: 2,
                        py: 1,
                        minHeight: 44,
                        fontWeight: isSelected ? 600 : 400,
                        borderColor: isSelected ? c.color : 'divider',
                        bgcolor: isSelected ? c.color : 'transparent',
                        color: isSelected ? '#fff' : 'text.primary',
                        '&:hover': {
                          bgcolor: isSelected ? c.color : 'action.hover',
                          borderColor: c.color,
                        },
                      }}
                    >
                      {c.label}
                    </Button>
                  );
                })}
              </Box>
            </Box>

            {/* ── Description ── */}
            <TextField
              label="Describe your feedback"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              multiline
              rows={4}
              placeholder="Tell us what happened, what you expected, or what you'd like to see..."
              helperText={
                description.trim().length > 0 && description.trim().length < 10
                  ? `${10 - description.trim().length} more characters needed`
                  : ''
              }
              error={description.trim().length > 0 && description.trim().length < 10}
              sx={{
                mb: 2.5,
                '& .MuiInputBase-root': { borderRadius: 2 },
                '& .MuiInputBase-input': { fontSize: 16 },
              }}
            />

            {/* ── Optional Fields ── */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
              <TextField
                label="App version"
                value={appVersion}
                onChange={(e) => setAppVersion(e.target.value)}
                fullWidth
                size="small"
                placeholder="e.g., 1.0.0"
                sx={{ '& .MuiInputBase-root': { borderRadius: 2 } }}
              />
              <TextField
                label="Email (for follow-up)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                fullWidth
                size="small"
                type="email"
                placeholder="your@email.com"
                sx={{ '& .MuiInputBase-root': { borderRadius: 2 } }}
              />
            </Stack>

            {/* ── Submit ── */}
            <Button
              variant="contained"
              fullWidth
              disabled={!isValid || submitting}
              onClick={handleSubmit}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: 2,
                py: 1.5,
                minHeight: 52,
                fontSize: '1rem',
                boxShadow: isValid ? 2 : 0,
              }}
            >
              {submitting ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                'Submit Feedback'
              )}
            </Button>
          </Paper>
        )}
      </Container>
    </Box>
  );
}
