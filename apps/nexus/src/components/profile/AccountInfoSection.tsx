'use client';

import { useState } from 'react';
import { Box, Typography, Paper, IconButton, Tooltip } from '@neram/ui';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import EmailIcon from '@mui/icons-material/Email';
import FingerprintIcon from '@mui/icons-material/Fingerprint';

interface AccountInfoSectionProps {
  email: string | null;
  userId: string;
}

export default function AccountInfoSection({ email, userId }: AccountInfoSectionProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(userId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = userId;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Paper
      elevation={0}
      sx={{ p: { xs: 2.5, sm: 3 }, mb: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}
    >
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2, fontWeight: 600, letterSpacing: 0.5 }}>
        Account
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {/* Email */}
        {email && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <EmailIcon sx={{ color: 'text.secondary', fontSize: 18 }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">Microsoft Account</Typography>
              <Typography
                variant="body2"
                sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {email}
              </Typography>
            </Box>
          </Box>
        )}

        {/* User ID */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <FingerprintIcon sx={{ color: 'text.secondary', fontSize: 18 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary">User ID (for support)</Typography>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 500,
                fontFamily: 'monospace',
                fontSize: 12,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {userId}
            </Typography>
          </Box>
          <Tooltip title={copied ? 'Copied!' : 'Copy ID'}>
            <IconButton
              size="small"
              onClick={handleCopy}
              sx={{ color: copied ? 'success.main' : 'text.secondary' }}
            >
              {copied ? <CheckIcon sx={{ fontSize: 16 }} /> : <ContentCopyIcon sx={{ fontSize: 16 }} />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    </Paper>
  );
}
