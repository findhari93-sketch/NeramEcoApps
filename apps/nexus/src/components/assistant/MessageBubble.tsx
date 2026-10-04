'use client';

import Link from 'next/link';
import { Box, Button, Paper, Skeleton, Typography, alpha, useMediaQuery, useTheme } from '@neram/ui';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import type { AssistantMessage } from './AssistantProvider';
import { stableHover } from './stableHover';
import ModeChip from './ModeChip';

export default function MessageBubble({ message, label = 'Neram Assistant is thinking' }: { message: AssistantMessage; label?: string }) {
  const theme = useTheme();
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)');
  const mine = message.role === 'user';
  if (message.pending) {
    // Under reduced motion the skeleton holds still; the status label still says why.
    const animation = reduce ? false : 'pulse';
    return (
      <Box role="status" sx={{ display: 'flex', justifyContent: 'flex-start', px: 2, py: 0.5 }} aria-label={label}>
        <Paper elevation={0} sx={{ p: 1.5, borderRadius: 3, width: '70%', bgcolor: alpha(theme.palette.primary.main, 0.06) }}>
          <Skeleton animation={animation} width="90%" /><Skeleton animation={animation} width="75%" /><Skeleton animation={animation} width="40%" />
        </Paper>
      </Box>
    );
  }
  const links = message.envelope?.links || [];
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', px: 2, py: 0.5 }}>
      <Paper
        elevation={0}
        sx={{
          p: 1.5, borderRadius: 3, maxWidth: '85%', minWidth: 0,
          bgcolor: mine ? 'primary.main' : alpha(theme.palette.primary.main, 0.06),
          color: mine ? 'primary.contrastText' : 'text.primary',
        }}
      >
        {!mine && message.envelope?.llm && <ModeChip mode={message.envelope.mode} />}
        <Typography variant="body1" sx={{ whiteSpace: 'pre-line', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{message.text}</Typography>
        {links.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5 }}>
            {links.map((l) => (
              <Button key={l.url} component={Link} href={l.url} variant="outlined" size="medium" endIcon={<ArrowForwardRoundedIcon />} sx={{ ...stableHover, minHeight: 48, textTransform: 'none', fontWeight: 700 }}>
                {l.label}
              </Button>
            ))}
          </Box>
        )}
      </Paper>
      {message.failed && <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>Not sent</Typography>}
    </Box>
  );
}
