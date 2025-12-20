'use client';

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Grid,
  Paper,
  Button,
  TextField,
  Alert,
  Chip,
  CircularProgress,
  FormControlLabel,
  Checkbox,
  Stack,
} from '@neram/ui';
import YouTubeIcon from '@mui/icons-material/YouTube';
import InstagramIcon from '@mui/icons-material/Instagram';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import type { UseApplicationFormReturn } from '../hooks/useApplicationForm';

interface Step4Props {
  form: UseApplicationFormReturn;
  errors: Record<string, string>;
}

export default function Step4Cashback({ form, errors }: Step4Props) {
  const { formData, updateField, verifyYouTubeSubscription } = form;
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const handleVerifyYouTube = async () => {
    setVerifying(true);
    setVerifyError(null);

    try {
      // Open YouTube channel in new tab for subscription
      window.open('https://www.youtube.com/@neramclasses', '_blank');

      // Wait a bit then verify
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const isSubscribed = await verifyYouTubeSubscription();
      if (!isSubscribed) {
        setVerifyError('Please subscribe to our YouTube channel first, then try verifying again.');
      }
    } catch {
      setVerifyError('Failed to verify subscription. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const handleInstagramFollow = () => {
    window.open('https://www.instagram.com/neramclasses/', '_blank');
    updateField('instagramFollowed', true);
  };

  const totalCashback =
    (formData.youtubeVerified ? 50 : 0) +
    (formData.instagramFollowed && formData.instagramUsername ? 50 : 0);

  return (
    <Box>
      <Typography variant="h6" gutterBottom sx={{ mb: 1 }}>
        Cashback Offers
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Earn up to Rs. 200 cashback on your enrollment!
      </Typography>

      <Grid container spacing={3}>
        {/* YouTube Subscription */}
        <Grid item xs={12} md={6}>
          <Paper
            sx={{
              p: 3,
              height: '100%',
              border: '2px solid',
              borderColor: formData.youtubeVerified ? 'success.main' : 'grey.300',
              position: 'relative',
            }}
          >
            {formData.youtubeVerified && (
              <Chip
                label="Verified"
                color="success"
                size="small"
                icon={<CheckCircleIcon />}
                sx={{ position: 'absolute', top: 12, right: 12 }}
              />
            )}

            <Stack spacing={2}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <YouTubeIcon sx={{ color: '#FF0000', fontSize: 32 }} />
                <Box>
                  <Typography variant="subtitle1" fontWeight={600}>
                    Subscribe to YouTube
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Get Rs. 50 cashback
                  </Typography>
                </Box>
              </Box>

              <Typography variant="body2">
                Subscribe to our YouTube channel for free NATA preparation videos and earn Rs. 50 cashback!
              </Typography>

              {!formData.youtubeVerified ? (
                <Button
                  variant="contained"
                  color="error"
                  startIcon={verifying ? <CircularProgress size={16} color="inherit" /> : <YouTubeIcon />}
                  onClick={handleVerifyYouTube}
                  disabled={verifying}
                  fullWidth
                >
                  {verifying ? 'Verifying...' : 'Subscribe & Verify'}
                </Button>
              ) : (
                <Alert severity="success" sx={{ py: 0.5 }}>
                  Subscription verified! Rs. 50 cashback earned.
                </Alert>
              )}

              {verifyError && (
                <Alert severity="warning" sx={{ py: 0.5 }}>
                  {verifyError}
                </Alert>
              )}
            </Stack>
          </Paper>
        </Grid>

        {/* Instagram Follow */}
        <Grid item xs={12} md={6}>
          <Paper
            sx={{
              p: 3,
              height: '100%',
              border: '2px solid',
              borderColor: formData.instagramFollowed && formData.instagramUsername ? 'success.main' : 'grey.300',
              position: 'relative',
            }}
          >
            {formData.instagramFollowed && formData.instagramUsername && (
              <Chip
                label="Claimed"
                color="success"
                size="small"
                icon={<CheckCircleIcon />}
                sx={{ position: 'absolute', top: 12, right: 12 }}
              />
            )}

            <Stack spacing={2}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <InstagramIcon sx={{ color: '#E4405F', fontSize: 32 }} />
                <Box>
                  <Typography variant="subtitle1" fontWeight={600}>
                    Follow on Instagram
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Get Rs. 50 cashback
                  </Typography>
                </Box>
              </Box>

              <Typography variant="body2">
                Follow us on Instagram for updates, tips, and creative inspiration. Earn Rs. 50 cashback!
              </Typography>

              <Button
                variant="contained"
                sx={{
                  bgcolor: 'linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)',
                  background: 'linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)',
                }}
                startIcon={<InstagramIcon />}
                onClick={handleInstagramFollow}
                fullWidth
              >
                Follow @neramclasses
              </Button>

              {formData.instagramFollowed && (
                <TextField
                  fullWidth
                  size="small"
                  label="Your Instagram Username"
                  value={formData.instagramUsername}
                  onChange={(e) => updateField('instagramUsername', e.target.value.replace('@', ''))}
                  error={!!errors.instagramUsername}
                  helperText={errors.instagramUsername || 'Enter without @ symbol'}
                  placeholder="yourusername"
                  InputProps={{
                    startAdornment: <Typography color="text.secondary" sx={{ mr: 0.5 }}>@</Typography>,
                  }}
                />
              )}
            </Stack>
          </Paper>
        </Grid>

        {/* Direct Payment Info */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3, bgcolor: 'grey.50' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <AccountBalanceWalletIcon sx={{ color: 'success.main', fontSize: 28 }} />
              <Box>
                <Typography variant="subtitle1" fontWeight={600}>
                  Direct Payment Bonus
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Additional Rs. 100 cashback
                </Typography>
              </Box>
            </Box>

            <Typography variant="body2">
              Pay via UPI or Bank Transfer instead of online payment gateway to earn an
              <strong> additional Rs. 100 cashback</strong>! This option will be available at the payment step.
            </Typography>
          </Paper>
        </Grid>

        {/* Phone Number for Cashback */}
        {(formData.youtubeVerified || (formData.instagramFollowed && formData.instagramUsername)) && (
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Phone Number for Cashback Transfer"
              value={formData.cashbackPhoneNumber}
              onChange={(e) => updateField('cashbackPhoneNumber', e.target.value.replace(/\D/g, '').slice(0, 10))}
              error={!!errors.cashbackPhoneNumber}
              helperText={errors.cashbackPhoneNumber || 'Cashback will be transferred to this UPI/Paytm number after enrollment'}
              placeholder="Same as mobile or different"
              inputProps={{ maxLength: 10 }}
            />
          </Grid>
        )}

        {/* Cashback Summary */}
        {totalCashback > 0 && (
          <Grid item xs={12}>
            <Alert
              severity="success"
              icon={<AccountBalanceWalletIcon />}
              sx={{
                '& .MuiAlert-message': {
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: '100%'
                }
              }}
            >
              <Typography>
                Total Cashback Earned So Far
              </Typography>
              <Chip
                label={`Rs. ${totalCashback}`}
                color="success"
                sx={{ fontWeight: 700 }}
              />
            </Alert>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}
