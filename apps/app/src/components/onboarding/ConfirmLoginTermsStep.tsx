// @ts-nocheck
'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Checkbox,
  FormControlLabel,
} from '@neram/ui';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

interface ConfirmLoginTermsStepProps {
  onConfirm: () => void;
  isCompleted: boolean;
  disabled?: boolean;
}

export default function ConfirmLoginTermsStep({
  onConfirm,
  isCompleted,
  disabled,
}: ConfirmLoginTermsStepProps) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);

  if (isCompleted) {
    return (
      <Box sx={{ mt: 1, p: 1.5, borderRadius: 1.5, bgcolor: 'success.50', border: '1px solid', borderColor: 'success.light' }}>
        <Typography variant="body2" color="success.dark" fontWeight={600}>
          Login confirmed & terms accepted
        </Typography>
      </Box>
    );
  }

  const canConfirm = loggedIn && agreedTerms;

  return (
    <Box sx={{ mt: 1.5 }}>
      <FormControlLabel
        control={
          <Checkbox
            checked={loggedIn}
            onChange={(e) => setLoggedIn(e.target.checked)}
            disabled={disabled}
            sx={{ '& .MuiSvgIcon-root': { fontSize: 22 } }}
          />
        }
        label={
          <Typography variant="body2">
            I have logged into Microsoft Teams and Microsoft Authenticator with the credentials provided above.
          </Typography>
        }
        sx={{ alignItems: 'flex-start', mb: 1, '& .MuiFormControlLabel-label': { pt: 0.5 } }}
      />

      <FormControlLabel
        control={
          <Checkbox
            checked={agreedTerms}
            onChange={(e) => setAgreedTerms(e.target.checked)}
            disabled={disabled}
            sx={{ '& .MuiSvgIcon-root': { fontSize: 22 } }}
          />
        }
        label={
          <Typography variant="body2">
            I understand that sharing my credentials is strictly prohibited and may result in{' '}
            <Typography component="span" variant="body2" fontWeight={700} color="error.main">
              account deactivation with no fee refund
            </Typography>
            .
          </Typography>
        }
        sx={{ alignItems: 'flex-start', mb: 2, '& .MuiFormControlLabel-label': { pt: 0.5 } }}
      />

      <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: 'warning.50', border: '1px solid', borderColor: 'warning.light', mb: 2 }}>
        <Box display="flex" alignItems="center" gap={0.75} mb={0.5}>
          <WarningAmberIcon sx={{ fontSize: 16, color: 'warning.main' }} />
          <Typography variant="caption" fontWeight={700} color="warning.dark">
            Important
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">
          Your credentials are personal and confidential. If found shared with anyone, your account will be permanently deactivated and fees will not be refunded.
        </Typography>
      </Box>

      <Button
        variant="contained"
        size="small"
        onClick={onConfirm}
        disabled={!canConfirm || disabled}
        sx={{
          borderRadius: 1, textTransform: 'none', fontWeight: 600,
          fontSize: '0.85rem', minHeight: 44,
        }}
      >
        Confirm & Continue
      </Button>
    </Box>
  );
}
