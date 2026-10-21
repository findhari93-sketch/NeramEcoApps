'use client';

import { useState } from 'react';
import { Box, Button, Typography } from '@neram/ui';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';

/** A value to paste somewhere else (the connector URL), with a copy button. */
export default function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the text is selectable anyway.
    }
  };
  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1, alignItems: { sm: 'center' } }}>
      <Typography
        component="code"
        aria-label={label}
        sx={{
          flex: 1,
          minWidth: 0,
          px: 1.5,
          py: 1.25,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '0.9375rem',
          overflowWrap: 'anywhere',
          userSelect: 'all',
        }}
      >
        {value}
      </Typography>
      <Button
        variant="contained"
        onClick={copy}
        startIcon={copied ? <CheckRoundedIcon /> : <ContentCopyRoundedIcon />}
        sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700, flexShrink: 0 }}
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </Box>
  );
}
