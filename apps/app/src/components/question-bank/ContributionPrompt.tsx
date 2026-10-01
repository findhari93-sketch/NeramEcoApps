'use client';

import { Box, Typography, Stack, Button, Chip } from '@neram/ui';
import { alpha } from '@mui/material/styles';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
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
        bgcolor: (theme) => alpha(theme.palette.warning.main, theme.palette.mode === 'light' ? 0.08 : 0.14),
        border: '1px solid',
        borderColor: (theme) => alpha(theme.palette.warning.main, 0.4),
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="body1" component="h2" fontWeight={700}>
          Help rebuild NATA questions
        </Typography>
        {score > 0 && (
          <Chip
            label={`${score} pts`}
            size="small"
            color="warning"
            variant="outlined"
            sx={{ height: 24, fontSize: '0.75rem' }}
          />
        )}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Since NATA never releases official questions, this bank depends on students like you.
        Contribute to unlock more questions: each contribution point unlocks 2 more views.
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Button
          component={Link}
          href="/tools/nata/question-bank/new"
          variant="contained"
          startIcon={<AddRoundedIcon />}
          sx={{ minHeight: 44 }}
        >
          Post a question (5 points)
        </Button>
        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
          Improvements earn 3 points, sessions 2, comments 1.
        </Typography>
      </Stack>
    </Box>
  );
}
