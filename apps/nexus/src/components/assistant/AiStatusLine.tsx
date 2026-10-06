'use client';

import Link from 'next/link';
import { Box, Button, Typography } from '@neram/ui';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import type { AiStatus } from './client';
import { stableHover } from './stableHover';

/** Whether this student has AI answers, why not, and the way back. Nothing until it loads. */
export default function AiStatusLine({ status }: { status: AiStatus | null }) {
  if (!status) return null;
  return (
    <Box
      role="status"
      sx={{
        display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 0.5, flexShrink: 0,
        borderBottom: 1, borderColor: 'divider', bgcolor: status.on ? 'transparent' : 'action.hover',
      }}
    >
      <AutoAwesomeOutlinedIcon aria-hidden sx={{ fontSize: 16, flexShrink: 0, color: status.on ? 'primary.main' : 'text.secondary' }} />
      <Typography variant="body2" sx={{ flex: 1, minWidth: 0, lineHeight: 1.4, fontSize: '0.8125rem' }}>{status.sentence}</Typography>
      {status.link && (
        <Button component={Link} href={status.link.url} variant="outlined" size="small" sx={{ ...stableHover, minHeight: 40, flexShrink: 0, textTransform: 'none', fontWeight: 700 }}>
          {status.link.label}
        </Button>
      )}
    </Box>
  );
}
