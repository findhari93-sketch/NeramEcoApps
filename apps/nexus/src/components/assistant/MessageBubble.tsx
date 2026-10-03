'use client';

import Link from 'next/link';
import { Box, Button, Paper, Skeleton, Typography, alpha, useTheme } from '@neram/ui';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import type { AssistantMessage } from './AssistantProvider';

export default function MessageBubble({ message }: { message: AssistantMessage }) {
  const theme = useTheme();
  const mine = message.role === 'user';
  if (message.pending) {
    return (
      <Box role="status" sx={{ display: 'flex', justifyContent: 'flex-start', px: 2, py: 0.5 }} aria-label="Neram Assistant is thinking">
        <Paper elevation={0} sx={{ p: 1.5, borderRadius: 3, width: '70%', bgcolor: alpha(theme.palette.primary.main, 0.06) }}>
          <Skeleton width="90%" /><Skeleton width="75%" /><Skeleton width="40%" />
        </Paper>
      </Box>
    );
  }
  const links = message.envelope?.links || [];
  return (
    <Box sx={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', px: 2, py: 0.5 }}>
      <Paper
        elevation={0}
        sx={{
          p: 1.5, borderRadius: 3, maxWidth: '85%', minWidth: 0,
          bgcolor: mine ? 'primary.main' : alpha(theme.palette.primary.main, 0.06),
          color: mine ? 'primary.contrastText' : 'text.primary',
        }}
      >
        <Typography variant="body1" sx={{ whiteSpace: 'pre-line', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{message.text}</Typography>
        {links.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5 }}>
            {links.map((l) => (
              <Button key={l.url} component={Link} href={l.url} variant="outlined" size="medium" endIcon={<ArrowForwardRoundedIcon />} sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700 }}>
                {l.label}
              </Button>
            ))}
          </Box>
        )}
      </Paper>
    </Box>
  );
}
