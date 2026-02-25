'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Button,
  Card,
  CardContent,
  TextField,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Alert,
  CircularProgress,
  Rating,
  Stack,
} from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import StarIcon from '@mui/icons-material/Star';

interface SurveyData {
  overallRating: number | null;
  teachingRating: number | null;
  npsScore: number | null;
  likedMost: string;
  suggestions: string;
  enrollmentInterest: 'yes' | 'maybe' | 'no' | null;
  additionalComments: string;
  contactForFollowup: boolean;
}

interface DemoSurveyContentProps {
  id: string;
}

export default function DemoSurveyContent({ id }: DemoSurveyContentProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [registrationInfo, setRegistrationInfo] = useState<{
    name: string;
    slotDate: string;
    slotTime: string;
  } | null>(null);

  const [surveyData, setSurveyData] = useState<SurveyData>({
    overallRating: null,
    teachingRating: null,
    npsScore: null,
    likedMost: '',
    suggestions: '',
    enrollmentInterest: null,
    additionalComments: '',
    contactForFollowup: true,
  });

  useEffect(() => {
    fetchRegistrationInfo();
  }, [id]);

  const fetchRegistrationInfo = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/demo-class/survey/${id}`);
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          setError('Survey link is invalid or expired');
        } else if (data.alreadySubmitted) {
          setAlreadySubmitted(true);
        } else {
          setError(data.error || 'Failed to load survey');
        }
        return;
      }

      setRegistrationInfo(data.registration);
    } catch (err) {
      setError('Failed to load survey');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof SurveyData, value: unknown) => {
    setSurveyData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleSubmit = async () => {
    // Validation
    if (!surveyData.overallRating) {
      setError('Please rate your overall experience');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const response = await fetch(`/api/demo-class/survey/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          overall_rating: surveyData.overallRating,
          teaching_rating: surveyData.teachingRating,
          nps_score: surveyData.npsScore,
          liked_most: surveyData.likedMost,
          suggestions: surveyData.suggestions,
          enrollment_interest: surveyData.enrollmentInterest,
          additional_comments: surveyData.additionalComments,
          contact_for_followup: surveyData.contactForFollowup,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit survey');
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit survey');
    } finally {
      setSubmitting(false);
    }
  };

  const npsLabels = ['\u{1F61E}', '\u{1F610}', '\u{1F642}', '\u{1F60A}', '\u{1F929}'];

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
            Thank You!
          </Typography>

          <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
            Your feedback helps us improve our teaching and serve you better.
          </Typography>

          <Button variant="contained" size="large" href="/" sx={{ minHeight: 48 }}>
            Visit Our Website
          </Button>
        </Container>
      </Box>
    );
  }

  // Already Submitted Screen
  if (alreadySubmitted) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <Container maxWidth="sm" sx={{ py: { xs: 4, md: 8 }, textAlign: 'center' }}>
          <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
          <Typography variant="h5" fontWeight="bold" gutterBottom>
            You&apos;ve already submitted your feedback
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
            Thank you for sharing your thoughts with us!
          </Typography>
          <Button variant="contained" href="/">
            Visit Our Website
          </Button>
        </Container>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error && !registrationInfo) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <Container maxWidth="sm" sx={{ py: { xs: 4, md: 8 }, textAlign: 'center' }}>
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
          <Button variant="contained" href="/">
            Go to Homepage
          </Button>
        </Container>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'grey.50' }}>
      {/* Header */}
      <Box
        sx={{
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          py: { xs: 3, md: 4 },
          textAlign: 'center',
        }}
      >
        <Container maxWidth="sm">
          <Typography variant="h4" fontWeight="bold" gutterBottom sx={{ fontSize: { xs: '1.5rem', md: '2rem' } }}>
            How was your Demo Class?
          </Typography>
          {registrationInfo && (
            <Typography variant="body1" sx={{ opacity: 0.9 }}>
              {registrationInfo.slotDate} {'\u2022'} {registrationInfo.slotTime}
            </Typography>
          )}
        </Container>
      </Box>

      <Container maxWidth="sm" sx={{ py: { xs: 3, md: 4 } }}>
        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Card>
          <CardContent sx={{ p: { xs: 2, md: 3 } }}>
            <Stack spacing={4}>
              {/* Overall Rating */}
              <Box>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  Overall Experience
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                  <Rating
                    value={surveyData.overallRating}
                    onChange={(_, value) => handleChange('overallRating', value)}
                    size="large"
                    sx={{ fontSize: { xs: 40, md: 48 } }}
                    emptyIcon={<StarIcon style={{ opacity: 0.3 }} fontSize="inherit" />}
                  />
                </Box>
              </Box>

              {/* Teaching Rating */}
              <Box>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  Teaching Quality
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                  <Rating
                    value={surveyData.teachingRating}
                    onChange={(_, value) => handleChange('teachingRating', value)}
                    size="large"
                    sx={{ fontSize: { xs: 40, md: 48 } }}
                    emptyIcon={<StarIcon style={{ opacity: 0.3 }} fontSize="inherit" />}
                  />
                </Box>
              </Box>

              {/* NPS Score */}
              <Box>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  Would you recommend us to friends?
                </Typography>
                <Stack direction="row" spacing={2} justifyContent="center">
                  {npsLabels.map((label, index) => (
                    <Box
                      key={index}
                      onClick={() => handleChange('npsScore', index + 1)}
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        fontSize: 28,
                        bgcolor: surveyData.npsScore === index + 1 ? 'primary.main' : 'grey.100',
                        border: 2,
                        borderColor: surveyData.npsScore === index + 1 ? 'primary.main' : 'transparent',
                        transition: 'all 0.2s',
                        '&:hover': { bgcolor: 'grey.200' },
                      }}
                    >
                      {label}
                    </Box>
                  ))}
                </Stack>
              </Box>

              {/* What did you like most */}
              <Box>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  What did you like most?
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  placeholder="Share what you enjoyed about the class..."
                  value={surveyData.likedMost}
                  onChange={(e) => handleChange('likedMost', e.target.value)}
                  inputProps={{ style: { fontSize: 16 } }}
                />
              </Box>

              {/* Suggestions */}
              <Box>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  Any suggestions for improvement?
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  placeholder="Help us improve (optional)"
                  value={surveyData.suggestions}
                  onChange={(e) => handleChange('suggestions', e.target.value)}
                  inputProps={{ style: { fontSize: 16 } }}
                />
              </Box>

              {/* Enrollment Interest */}
              <Box>
                <FormControl component="fieldset">
                  <FormLabel component="legend" sx={{ fontWeight: 'bold', mb: 1 }}>
                    Interested in enrolling?
                  </FormLabel>
                  <RadioGroup
                    value={surveyData.enrollmentInterest || ''}
                    onChange={(e) => handleChange('enrollmentInterest', e.target.value)}
                  >
                    <FormControlLabel value="yes" control={<Radio />} label="Yes, definitely!" />
                    <FormControlLabel value="maybe" control={<Radio />} label="Maybe, need more info" />
                    <FormControlLabel value="no" control={<Radio />} label="Not right now" />
                  </RadioGroup>
                </FormControl>
              </Box>

              {/* Submit Button */}
              <Button
                variant="contained"
                size="large"
                fullWidth
                onClick={handleSubmit}
                disabled={submitting || !surveyData.overallRating}
                sx={{ minHeight: 56, fontSize: '1.1rem' }}
              >
                {submitting ? <CircularProgress size={24} color="inherit" /> : 'Submit Feedback'}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
