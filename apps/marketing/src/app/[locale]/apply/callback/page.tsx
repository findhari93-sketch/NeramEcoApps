'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Stack,
  Chip,
  TextField,
  Paper,
} from '@neram/ui';
import { LoginModal } from '@neram/ui';
import { useFirebaseAuth, getFirebaseAuth } from '@neram/auth';
import { useTranslations } from 'next-intl';
import PhoneIcon from '@mui/icons-material/Phone';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import VerifiedIcon from '@mui/icons-material/Verified';
import AccessTimeIcon from '@mui/icons-material/AccessTime';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';

interface UserProfile {
  id: string;
  name: string | null;
  first_name: string | null;
  email: string | null;
  phone: string | null;
  phone_verified: boolean;
}

type TimeSlot = 'morning' | 'afternoon' | 'evening';

export default function CallbackPage() {
  const t = useTranslations('callback');
  const router = useRouter();
  const { user, loading: authLoading } = useFirebaseAuth();

  // Profile state
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // Form state
  const [preferredSlot, setPreferredSlot] = useState<TimeSlot | null>(null);
  const [notes, setNotes] = useState('');

  // UI state
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [phoneOnly, setPhoneOnly] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Fetch user profile from Supabase (via app API)
  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setProfileLoading(false);
        return;
      }

      const idToken = await currentUser.getIdToken();
      const response = await fetch(`${APP_URL}/api/profile`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (response.ok) {
        const { user: profileData } = await response.json();
        setProfile(profileData);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setProfileLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      fetchProfile();
    }
  }, [authLoading, fetchProfile]);

  const isPhoneVerified = profile?.phone_verified || false;
  const userName = profile?.first_name || profile?.name || user?.name || '';
  const userPhone = (profile?.phone || user?.phone || '').replace(/^\+91/, '');

  // Submit callback request
  const handleSubmit = async () => {
    if (!user || !isPhoneVerified) return;

    setSubmitting(true);
    setError(null);

    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Not authenticated');

      const idToken = await currentUser.getIdToken();

      const response = await fetch('/api/callback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          name: userName,
          phone: userPhone,
          email: profile?.email || user?.email || undefined,
          preferred_slot: preferredSlot || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 400 && data.error?.includes('already requested')) {
          setError(t('errorDuplicate'));
        } else {
          setError(data.error || t('errorGeneric'));
        }
        return;
      }

      setSuccess(true);
    } catch (err) {
      console.error('Callback request error:', err);
      setError(t('errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  // Handle auth completion
  const handleAuthenticated = async () => {
    setShowLoginModal(false);
    setProfileLoading(true);
    // Re-fetch profile after auth to get phone_verified status
    await fetchProfile();
  };

  // Handle "Request Callback" button click
  const handleRequestClick = () => {
    if (!user) {
      // Not logged in: show full login modal
      setPhoneOnly(false);
      setShowLoginModal(true);
      return;
    }

    if (!isPhoneVerified) {
      // Logged in but phone not verified: show phone-only modal
      setPhoneOnly(true);
      setShowLoginModal(true);
      return;
    }

    // Phone verified: submit directly
    handleSubmit();
  };

  const isLoading = authLoading || profileLoading;

  // Loading state
  if (isLoading) {
    return (
      <Box>
        <HeroSection title={t('title')} subtitle={t('subtitle')} />
        <Box sx={{ py: 8, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      </Box>
    );
  }

  // Success state
  if (success) {
    return (
      <Box>
        <HeroSection title={t('title')} subtitle={t('subtitle')} />
        <Box sx={{ py: { xs: 4, md: 8 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="sm">
            <Paper
              elevation={0}
              sx={{
                p: { xs: 3, md: 5 },
                textAlign: 'center',
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'success.light',
              }}
            >
              <CheckCircleOutlineIcon
                sx={{ fontSize: 72, color: 'success.main', mb: 2 }}
              />
              <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
                {t('successTitle')}
              </Typography>
              <Typography
                variant="body1"
                color="text.secondary"
                sx={{ mb: 1, fontSize: '1.1rem' }}
              >
                {t('successMessage')}
              </Typography>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1,
                  mb: 4,
                  mt: 2,
                }}
              >
                <AccessTimeIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">
                  {t('successExpectedTime')}
                </Typography>
              </Box>

              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                justifyContent="center"
              >
                <Button
                  variant="outlined"
                  onClick={() => router.push('/')}
                  sx={{ minHeight: 48 }}
                >
                  {t('backToHome')}
                </Button>
                <Button
                  variant="contained"
                  onClick={() => router.push('/apply')}
                  sx={{ minHeight: 48 }}
                >
                  {t('applyNow')}
                </Button>
              </Stack>
            </Paper>
          </Container>
        </Box>
      </Box>
    );
  }

  // Main form state
  return (
    <Box>
      <HeroSection title={t('title')} subtitle={t('subtitle')} />

      <Box sx={{ py: { xs: 4, md: 8 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="sm">
          <Paper
            elevation={0}
            sx={{
              p: { xs: 3, md: 4 },
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            {/* Hero text */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
              <PhoneIcon sx={{ fontSize: 28, color: 'primary.main' }} />
              <Typography variant="body1" color="text.secondary">
                {t('heroText')}
              </Typography>
            </Box>

            {/* Error alert */}
            {error && (
              <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            {/* Not logged in state */}
            {!user && (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                  {t('loginFirst')}
                </Typography>
                <Button
                  variant="contained"
                  size="large"
                  onClick={handleRequestClick}
                  sx={{ minHeight: 48, px: 4 }}
                >
                  {t('loginButton')}
                </Button>
              </Box>
            )}

            {/* Logged in but phone not verified */}
            {user && !isPhoneVerified && (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                  {t('verifyFirst')}
                </Typography>
                <Button
                  variant="contained"
                  size="large"
                  onClick={handleRequestClick}
                  sx={{ minHeight: 48, px: 4 }}
                >
                  {t('verifyButton')}
                </Button>
              </Box>
            )}

            {/* Phone verified - show form */}
            {user && isPhoneVerified && (
              <Stack spacing={3}>
                {/* Pre-filled name & phone (read-only) */}
                <Stack spacing={2}>
                  <TextField
                    label={t('yourName')}
                    value={userName}
                    InputProps={{ readOnly: true }}
                    fullWidth
                    size="medium"
                  />
                  <TextField
                    label={t('yourPhone')}
                    value={userPhone}
                    InputProps={{
                      readOnly: true,
                      endAdornment: (
                        <Chip
                          icon={<VerifiedIcon sx={{ fontSize: 16 }} />}
                          label={t('phoneVerified')}
                          size="small"
                          color="success"
                          variant="outlined"
                        />
                      ),
                    }}
                    fullWidth
                    size="medium"
                  />
                </Stack>

                {/* Preferred time slot */}
                <Box>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 1.5 }}
                  >
                    {t('preferredTime')}
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {(['morning', 'afternoon', 'evening'] as TimeSlot[]).map(
                      (slot) => (
                        <Chip
                          key={slot}
                          label={t(slot)}
                          onClick={() =>
                            setPreferredSlot(
                              preferredSlot === slot ? null : slot
                            )
                          }
                          color={preferredSlot === slot ? 'primary' : 'default'}
                          variant={preferredSlot === slot ? 'filled' : 'outlined'}
                          sx={{ minHeight: 40 }}
                        />
                      )
                    )}
                  </Stack>
                </Box>

                {/* Notes */}
                <TextField
                  label={t('notes')}
                  placeholder={t('notesPlaceholder')}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  multiline
                  rows={3}
                  fullWidth
                />

                {/* Submit button */}
                <Button
                  variant="contained"
                  size="large"
                  onClick={handleSubmit}
                  disabled={submitting}
                  startIcon={
                    submitting ? (
                      <CircularProgress size={20} color="inherit" />
                    ) : (
                      <PhoneIcon />
                    )
                  }
                  sx={{ minHeight: 52, fontSize: '1.1rem' }}
                >
                  {submitting ? t('submitting') : t('requestCallback')}
                </Button>
              </Stack>
            )}
          </Paper>
        </Container>
      </Box>

      {/* Login/Phone Verification Modal */}
      <LoginModal
        open={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        allowClose={true}
        onAuthenticated={handleAuthenticated}
        apiBaseUrl={APP_URL}
        phoneOnly={phoneOnly}
      />
    </Box>
  );
}

// Reusable hero section
function HeroSection({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <Box
      sx={{
        bgcolor: 'primary.main',
        color: 'primary.contrastText',
        py: { xs: 4, md: 6 },
      }}
    >
      <Container maxWidth="lg">
        <Typography
          variant="h3"
          component="h1"
          gutterBottom
          sx={{ fontWeight: 700 }}
        >
          {title}
        </Typography>
        <Typography variant="h6" sx={{ maxWidth: '700px', opacity: 0.9 }}>
          {subtitle}
        </Typography>
      </Container>
    </Box>
  );
}
