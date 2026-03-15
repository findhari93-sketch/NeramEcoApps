'use client';

import { Box, Chip } from '@neram/ui';
import type { NexusQBQuestionSource } from '@neram/database/src/types';

interface SourceBadgesProps {
  sources: NexusQBQuestionSource[];
}

function formatSource(source: NexusQBQuestionSource): string {
  const examLabel = source.exam_type === 'JEE_PAPER_2' ? 'JEE' : 'NATA';
  const session = source.session ? ` S${source.session}` : '';
  return `${examLabel} ${source.year}${session}`;
}

function getSourceColor(examType: string): string {
  return examType === 'JEE_PAPER_2' ? '#2563EB' : '#7C3AED';
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
