'use client';

import { Box, Typography, Button, Stack } from '@neram/ui';
import Link from 'next/link';

interface BlurredContentProps {
  children: React.ReactNode;
  isBlurred: boolean;
  contributionScore?: number;
}

export default function BlurredContent({
  children,
  isBlurred,
  contributionScore = 0,
}: BlurredContentProps) {
  if (!isBlurred) return <>{children}</>;

  return (
    <Box sx={{ position: 'relative' }}>
      {/* Blurred content */}
      <Box
        sx={{
          filter: 'blur(6px)',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      >
        {children}
      </Box>

      {/* Overlay */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'rgba(255,255,255,0.7)',
          borderRadius: 1,
        }}
      >
        <Stack alignItems="center" spacing={1.5} sx={{ maxWidth: 300, textAlign: 'center', p: 2 }}>
          <Typography variant="body1" fontWeight={700}>
            Contribute to unlock
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Share questions you remember from your NATA exam to unlock more content.
            {contributionScore > 0 && ` You have ${contributionScore} contribution points.`}
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              component={Link}
              href="/tools/nata/question-bank/new"
              variant="contained"
              size="small"
              sx={{ minHeight: 36 }}
            >
              Post a Question (+5)
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Post questions (+5), suggest improvements (+3), report sessions (+2), or comment (+1)
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}
