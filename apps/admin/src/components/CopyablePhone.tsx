'use client';

import { useState } from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';

interface CopyablePhoneProps {
  phone: string | null | undefined;
  /** Fallback text when phone is empty */
  fallback?: string;
  /** Typography variant */
  variant?: 'body1' | 'body2' | 'caption';
  /** Use monospace font */
  mono?: boolean;
  /** Additional sx on the text */
  textSx?: Record<string, unknown>;
  /** Hide copy icon until hover (for tight table cells) */
  showOnHover?: boolean;
  /** Prevent text wrapping */
  noWrap?: boolean;
}

export default function CopyablePhone({
  phone,
  fallback = '-',
  variant = 'body2',
  mono = false,
  textSx = {},
  showOnHover = false,
  noWrap = false,
}: CopyablePhoneProps) {
  const [copied, setCopied] = useState(false);

  if (!phone) {
    return (
      <Typography variant={variant} color="text.secondary" noWrap={noWrap}>
        {fallback}
      </Typography>
    );
  }

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.25,
        ...(showOnHover && {
          '& .copy-btn': { opacity: 0, transition: 'opacity 150ms' },
          '&:hover .copy-btn': { opacity: 1 },
        }),
      }}
    >
      <Typography
        variant={variant}
        noWrap={noWrap}
        sx={{
          ...(mono && { fontFamily: 'monospace', fontSize: 13 }),
          ...textSx,
        }}
      >
        {phone}
      </Typography>
      <Tooltip title={copied ? 'Copied!' : 'Copy number'} placement="top" arrow>
        <IconButton
          className="copy-btn"
          size="small"
          onClick={handleCopy}
          sx={{ p: 0.25, ml: 0.25, color: copied ? 'success.main' : 'action.active' }}
        >
          {copied ? (
            <CheckIcon sx={{ fontSize: 14 }} />
          ) : (
            <ContentCopyIcon sx={{ fontSize: 14 }} />
          )}
        </IconButton>
      </Tooltip>
    </Box>
  );
}
