'use client';

import { Box, Typography, Stack, Button, Chip } from '@neram/ui';
import Link from 'next/link';
import type { QBAccessInfo } from '@neram/database';

interface ContributionPromptProps {
  accessInfo: QBAccessInfo;
}

export default function ContributionPrompt({ accessInfo }: ContributionPromptProps) {
  if (accessInfo.accessLevel !== 'blur_contribute') return null;

  const score = accessInfo.stats?.contribution_score || 0;

  return (
    <Box
      sx={{
        p: 2,
        mb: 2,
        borderRadius: 1,
        bgcolor: 'warning.50',
        border: '1px solid',
        borderColor: 'warning.200',
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="body1" fontWeight={700}>
          Help rebuild NATA questions
        </Typography>
        {score > 0 && (
          <Chip
            label={`${score} pts`}
            size="small"
            color="warning"
            sx={{ height: 22, fontSize: '0.75rem' }}
          />
        )}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Since NATA never releases official questions, this bank depends on students like you.
        Contribute to unlock more questions — each contribution point unlocks 2 more views.
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Button
          component={Link}
          href="/tools/nata/question-bank/new"
          variant="contained"
          size="small"
          sx={{ minHeight: 36 }}
        >
          Post a Question (+5)
        </Button>
        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
          Improvements +3 | Sessions +2 | Comments +1
        </Typography>
      </Stack>
    </Box>
  );
}
