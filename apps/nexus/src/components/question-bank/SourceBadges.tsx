'use client';

import { Box, Chip } from '@neram/ui';
import { QB_EXAM_SHORT_LABELS, type NexusQBQuestionSource, type QBExamType } from '@neram/database';
import { shortSession } from '@/lib/qb-paper-number';

interface SourceBadgesProps {
  sources: NexusQBQuestionSource[];
}

/** "JEE" for Paper 2A as it always read, "JEE P2B" so a B.Planning copy is told apart. */
function examBadge(examType: string): string {
  if (examType === 'JEE_PAPER_2') return 'JEE';
  return QB_EXAM_SHORT_LABELS[examType as QBExamType] ?? examType;
}

function formatSource(source: NexusQBQuestionSource): string {
  const examLabel = examBadge(source.exam_type);
  const session = shortSession(source.session);
  return `${examLabel} ${source.year}${session}`;
}

function getSourceColor(examType: string): string {
  if (examType === 'JEE_PAPER_2') return '#4F46E5';
  if (examType === 'JEE_PAPER_2B') return '#0F766E';
  return '#7C3AED';
}

export default function SourceBadges({ sources }: SourceBadgesProps) {
  if (!sources || sources.length === 0) return null;

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {sources.map((source) => (
        <Chip
          key={source.id}
          label={formatSource(source)}
          size="small"
          variant="outlined"
          sx={{
            borderColor: getSourceColor(source.exam_type),
            color: getSourceColor(source.exam_type),
            fontWeight: 600,
            fontSize: '0.7rem',
            height: 24,
          }}
        />
      ))}
    </Box>
  );
}
