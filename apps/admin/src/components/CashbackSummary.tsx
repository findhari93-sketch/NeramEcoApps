'use client';

import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Chip,
  Button,
  Divider,
  Stack,
  Alert,
} from '@neram/ui';
import YouTubeIcon from '@mui/icons-material/YouTube';
import InstagramIcon from '@mui/icons-material/Instagram';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';
import CancelIcon from '@mui/icons-material/Cancel';

interface CashbackClaim {
  id: string;
  cashbackType: 'youtube_subscription' | 'instagram_follow' | 'direct_payment';
  amount: number;
  status: 'pending' | 'verified' | 'processed' | 'rejected';
  youtubeChannelSubscribed?: boolean;
  instagramUsername?: string;
  cashbackPhone: string;
}

interface CashbackSummaryProps {
  claims: CashbackClaim[];
  onVerify: (claimId: string, status: 'verified' | 'rejected') => void;
  onProcess: (claimId: string) => void;
  isEnrolled: boolean;
}

export default function CashbackSummary({
  claims,
  onVerify,
  onProcess,
  isEnrolled,
}: CashbackSummaryProps) {
  const getIcon = (type: string) => {
    switch (type) {
      case 'youtube_subscription':
        return <YouTubeIcon sx={{ color: '#FF0000' }} />;
      case 'instagram_follow':
        return <InstagramIcon sx={{ color: '#E4405F' }} />;
      case 'direct_payment':
        return <AccountBalanceWalletIcon sx={{ color: '#4CAF50' }} />;
      default:
        return null;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'youtube_subscription':
        return 'YouTube Subscription';
      case 'instagram_follow':
        return 'Instagram Follow';
      case 'direct_payment':
        return 'Direct Payment Bonus';
      default:
        return type;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'verified':
        return <CheckCircleIcon color="success" fontSize="small" />;
      case 'processed':
        return <CheckCircleIcon color="primary" fontSize="small" />;
      case 'rejected':
        return <CancelIcon color="error" fontSize="small" />;
      default:
        return <PendingIcon color="warning" fontSize="small" />;
    }
  };

  const getStatusColor = (status: string): 'success' | 'warning' | 'error' | 'info' => {
    switch (status) {
      case 'verified':
        return 'success';
      case 'processed':
        return 'info';
      case 'rejected':
        return 'error';
      default:
        return 'warning';
    }
  };

  const totalEligible = claims
    .filter((c) => c.status !== 'rejected')
    .reduce((sum, c) => sum + c.amount, 0);

  const totalProcessed = claims
    .filter((c) => c.status === 'processed')
    .reduce((sum, c) => sum + c.amount, 0);

  if (claims.length === 0) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Cashback Claims
        </Typography>
        <Alert severity="info">
          This student has no cashback claims.
        </Alert>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          Cashback Claims
        </Typography>
        <Chip
          label={`Total: Rs. ${totalEligible}`}
          color="primary"
          sx={{ fontWeight: 600 }}
        />
      </Box>

      <Divider sx={{ mb: 3 }} />

      <Stack spacing={2}>
        {claims.map((claim) => (
          <Paper
            key={claim.id}
            sx={{
              p: 2,
              border: '1px solid',
              borderColor: claim.status === 'processed' ? 'success.light' : 'grey.300',
            }}
          >
            <Grid container spacing={2} alignItems="center">
              <Grid item>
                {getIcon(claim.cashbackType)}
              </Grid>

              <Grid item xs>
                <Typography variant="subtitle2">
                  {getTypeLabel(claim.cashbackType)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {claim.cashbackType === 'instagram_follow' && claim.instagramUsername && (
                    <>@{claim.instagramUsername} • </>
                  )}
                  Transfer to: {claim.cashbackPhone}
                </Typography>
              </Grid>

              <Grid item>
                <Typography variant="h6" color="success.main">
                  Rs. {claim.amount}
                </Typography>
              </Grid>

              <Grid item>
                <Chip
                  icon={getStatusIcon(claim.status)}
                  label={claim.status.toUpperCase()}
                  color={getStatusColor(claim.status)}
                  size="small"
                />
              </Grid>

              <Grid item>
                {claim.status === 'pending' && (
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      color="success"
                      onClick={() => onVerify(claim.id, 'verified')}
                    >
                      Verify
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      onClick={() => onVerify(claim.id, 'rejected')}
                    >
                      Reject
                    </Button>
                  </Stack>
                )}

                {claim.status === 'verified' && isEnrolled && (
                  <Button
                    size="small"
                    variant="contained"
                    color="success"
                    onClick={() => onProcess(claim.id)}
                  >
                    Mark Processed
                  </Button>
                )}
              </Grid>
            </Grid>
          </Paper>
        ))}
      </Stack>

      <Divider sx={{ my: 3 }} />

      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="body2" color="text.secondary">
            Total Eligible
          </Typography>
          <Typography variant="h6">
            Rs. {totalEligible}
          </Typography>
        </Box>
        <Box>
          <Typography variant="body2" color="text.secondary">
            Processed
          </Typography>
          <Typography variant="h6" color="success.main">
            Rs. {totalProcessed}
          </Typography>
        </Box>
        <Box>
          <Typography variant="body2" color="text.secondary">
            Pending
          </Typography>
          <Typography variant="h6" color="warning.main">
            Rs. {totalEligible - totalProcessed}
          </Typography>
        </Box>
      </Box>

      {!isEnrolled && totalEligible > 0 && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          Cashback can only be processed after the student completes enrollment and payment.
        </Alert>
      )}
    </Paper>
  );
}
