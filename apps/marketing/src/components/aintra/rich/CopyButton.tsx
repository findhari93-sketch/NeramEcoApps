'use client';

import { useEffect, useState } from 'react';
import { Box, IconButton, Tooltip } from '@neram/ui';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { copyText } from '@/lib/aintra/rich/plain';

/** A 44px copy button that confirms with a tick and a polite screen reader message. */
export default function CopyButton({ getText, label = 'Copy' }: { getText: () => string; label?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);

  return (
    <>
      <Tooltip title={copied ? 'Copied' : label}>
        <IconButton
          aria-label={label}
          onClick={async () => setCopied(await copyText(getText()))}
          sx={{ width: 44, height: 44, color: copied ? 'success.main' : 'text.secondary' }}
        >
          {copied ? <CheckRoundedIcon sx={{ fontSize: 20 }} /> : <ContentCopyRoundedIcon sx={{ fontSize: 18 }} />}
        </IconButton>
      </Tooltip>
      <Box component="span" role="status" aria-live="polite" sx={visuallyHidden}>
        {copied ? 'Copied to clipboard' : ''}
      </Box>
    </>
  );
}

/**
 * Off screen but readable by screen readers. Uses 1px, never `width: 1`: in MUI
 * sx that means 100%, which once scrolled a whole page sideways.
 */
export const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  p: 0,
  m: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;
