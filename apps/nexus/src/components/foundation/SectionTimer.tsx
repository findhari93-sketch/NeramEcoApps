'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  LinearProgress,
  Button,
  alpha,
  useTheme,
} from '@neram/ui';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import type { NexusFoundationSectionWithQuiz } from '@neram/database/types';

interface SectionTimerProps {
  sections: NexusFoundationSectionWithQuiz[];
  currentSectionIndex: number;
  onSectionEnd: (sectionIndex: number) => void;
  isActive: boolean;
}

export default function SectionTimer({
  sections,
  currentSectionIndex,
  onSectionEnd,
  isActive,
}: SectionTimerProps) {
  const theme = useTheme();
  const section = sections[currentSectionIndex];
  const duration = section
    ? section.end_timestamp_seconds - section.start_timestamp_seconds
    : 0;

  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const triggeredRef = useRef(false);

  // Reset when section changes
  useEffect(() => {
    setElapsed(0);
    triggeredRef.current = false;
  }, [currentSectionIndex]);

  // Pause timer when tab is hidden (anti-gaming)
  useEffect(() => {
    const handleVisibility = () => {
      setPaused(document.visibilityState === 'hidden');
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Timer tick
  useEffect(() => {
    if (!isActive || paused || duration <= 0 || triggeredRef.current) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        if (next >= duration && !triggeredRef.current) {
          triggeredRef.current = true;
          // Defer the callback to avoid setState-during-render
          setTimeout(() => onSectionEnd(currentSectionIndex), 0);
        }
        return next;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, paused, duration, currentSectionIndex, onSectionEnd]);

  const handleTakeQuizNow = useCallback(() => {
    if (!triggeredRef.current) {
      triggeredRef.current = true;
      onSectionEnd(currentSectionIndex);
    }
  }, [currentSectionIndex, onSectionEnd]);

  if (!section || duration <= 0) return null;

  const progress = Math.min((elapsed / duration) * 100, 100);
  const remaining = Math.max(duration - elapsed, 0);
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const passed = section.quiz_attempt?.passed;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 1.5,
        borderRadius: 2,
        bgcolor: passed
          ? alpha(theme.palette.success.main, 0.06)
          : alpha(theme.palette.primary.main, 0.04),
        border: `1px solid ${passed ? alpha(theme.palette.success.main, 0.2) : theme.palette.divider}`,
      }}
    >
      <TimerOutlinedIcon
        sx={{
          fontSize: '1.2rem',
          color: passed ? 'success.main' : paused ? 'text.disabled' : 'primary.main',
        }}
      />

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.7rem' }}>
            {passed ? 'Section Complete' : paused ? 'Timer Paused' : 'Section Timer'}
          </Typography>
          {!passed && (
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                fontSize: '0.75rem',
                color: paused ? 'text.disabled' : 'primary.main',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {mins}:{secs.toString().padStart(2, '0')}
            </Typography>
          )}
        </Box>
        <LinearProgress
          variant="determinate"
          value={passed ? 100 : progress}
          sx={{
            height: 4,
            borderRadius: 2,
            bgcolor: alpha(passed ? theme.palette.success.main : theme.palette.primary.main, 0.1),
            '& .MuiLinearProgress-bar': {
              borderRadius: 2,
              bgcolor: passed ? 'success.main' : undefined,
            },
          }}
        />
      </Box>

      {!passed && !triggeredRef.current && elapsed > 10 && (
        <Button
          size="small"
          variant="outlined"
          startIcon={<PlayArrowIcon sx={{ fontSize: '1rem !important' }} />}
          onClick={handleTakeQuizNow}
          sx={{
            fontSize: '0.7rem',
            fontWeight: 700,
            textTransform: 'none',
            borderRadius: 2,
            px: 1.5,
            py: 0.5,
            minWidth: 'auto',
            whiteSpace: 'nowrap',
          }}
        >
          Take Quiz
        </Button>
      )}
    </Box>
  );
}
