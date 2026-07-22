'use client';

/**
 * Renders a student's grade the way the assignment is scored: a read-only 1-5 star
 * row when evaluation_type is 'stars', else a "value / max" marks chip. One place so
 * the student list, student detail, and drawing panel all read identically.
 */
import { Box, Chip, Rating, Typography, alpha } from '@neram/ui';
import type { NexusAssignmentEvaluationType } from '@neram/database/types';
import { RATING_LABELS } from '@/lib/drawing-prompt-templates';

interface GradeDisplayProps {
  evaluationType: NexusAssignmentEvaluationType;
  /** Awarded grade: 1-5 for stars, or the numeric mark for 'marks'. Null hides the display. */
  value: number | null;
  maxMarks: number;
  size?: 'small' | 'medium';
  /** Show the star label (e.g. "Very Good") next to the stars. */
  showStarLabel?: boolean;
}

export default function GradeDisplay({
  evaluationType,
  value,
  maxMarks,
  size = 'small',
  showStarLabel = false,
}: GradeDisplayProps) {
  if (value == null) return null;

  if (evaluationType === 'stars') {
    return (
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
        <Rating value={value} max={5} readOnly size={size} />
        {showStarLabel && RATING_LABELS[Math.round(value)] && (
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            {RATING_LABELS[Math.round(value)]}
          </Typography>
        )}
      </Box>
    );
  }

  return (
    <Chip
      label={`${value} / ${maxMarks}`}
      size={size}
      sx={{
        fontWeight: 700,
        bgcolor: alpha('#2E7D32', 0.12),
        color: '#1B5E20',
      }}
    />
  );
}
