'use client';

import { Box, Chip, Typography } from '@neram/ui';
import { QB_EXAM_SHORT_LABELS, type NexusQBQuestionSource, type QBExamType } from '@neram/database';

interface RepeatBadgesProps {
  sources: NexusQBQuestionSource[];
  onSourceClick?: (source: NexusQBQuestionSource) => void;
}

/** "JEE" for Paper 2A as it always read, "JEE P2B" so a B.Planning copy is told apart. */
function examBadge(examType: string): string {
  if (examType === 'JEE_PAPER_2') return 'JEE';
  return QB_EXAM_SHORT_LABELS[examType as QBExamType] ?? examType;
}

function formatSource(source: NexusQBQuestionSource): string {
  const examLabel = examBadge(source.exam_type);
  const session = source.session ? ` S${source.session}` : '';
  return `${examLabel} ${source.year}${session}`;
}

export default function RepeatBadges({ sources, onSourceClick }: RepeatBadgesProps) {
  if (!sources || sources.length === 0) return null;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
      <Typography
        variant="caption"
        sx={{ color: 'text.secondary', mr: 0.5, whiteSpace: 'nowrap' }}
      >
        Also appeared in:
      </Typography>
      {sources.map((source) => (
        <Chip
          key={source.id}
          label={formatSource(source)}
          size="small"
          variant="outlined"
          clickable={!!onSourceClick}
          onClick={onSourceClick ? () => onSourceClick(source) : undefined}
          sx={{
            fontSize: '0.65rem',
            height: 20,
            color: 'text.secondary',
            borderColor: 'divider',
            cursor: onSourceClick ? 'pointer' : 'default',
            '&:hover': onSourceClick
              ? { borderColor: 'primary.main', color: 'primary.main' }
              : {},
          }}
        />
      ))}
    </Box>
  );
}
