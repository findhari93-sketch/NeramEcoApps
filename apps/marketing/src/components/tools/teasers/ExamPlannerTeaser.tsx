'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Paper,
  Typography,
} from '@neram/ui';
import Link from 'next/link';

const NATA_EXAM_DATE = new Date('2026-04-12T09:00:00+05:30');

export default function ExamPlannerTeaser() {
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    const now = new Date();
    const diff = NATA_EXAM_DATE.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    setDaysLeft(days);
  }, []);

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 3, sm: 4 },
        border: '1px solid #E0E0E0',
        borderRadius: 2,
      }}
    >
      <Typography
        component="h2"
        sx={{ fontWeight: 700, fontSize: { xs: '1.25rem', sm: '1.5rem' }, mb: 2 }}
      >
        NATA 2026 Countdown
      </Typography>

      <Box
        sx={{
          p: 3,
          mb: 3,
          bgcolor: '#E8F5E9',
          borderRadius: 2,
          textAlign: 'center',
        }}
      >
        {daysLeft === null ? (
          <Typography sx={{ fontSize: '1rem', color: 'text.secondary' }}>
            Calculating...
          </Typography>
        ) : daysLeft > 0 ? (
          <>
            <Typography
              sx={{
                fontSize: { xs: '2.5rem', sm: '3rem' },
                fontWeight: 800,
                color: 'primary.main',
                lineHeight: 1,
                mb: 1,
              }}
            >
              {daysLeft}
            </Typography>
            <Typography
              sx={{ fontSize: { xs: '1rem', sm: '1.1rem' }, fontWeight: 600, color: 'text.primary' }}
            >
              days until NATA 2026 exam
            </Typography>
            <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', mt: 1 }}>
              Exam date: 12 April 2026, 9:00 AM IST
            </Typography>
          </>
        ) : (
          <Typography
            sx={{ fontSize: { xs: '1rem', sm: '1.1rem' }, fontWeight: 600, color: 'text.primary' }}
          >
            NATA 2026 exam has taken place. Check results and counseling dates.
          </Typography>
        )}
      </Box>

      <Button
        component={Link}
        href="https://app.neramclasses.com/tools/nata/exam-planner"
        variant="contained"
        fullWidth
        sx={{
          minHeight: 48,
          fontWeight: 700,
          fontSize: '1rem',
        }}
      >
        Get a personalized study plan
      </Button>
    </Paper>
  );
}
