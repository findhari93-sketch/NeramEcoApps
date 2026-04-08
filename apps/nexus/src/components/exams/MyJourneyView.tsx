'use client';

import { Box } from '@neram/ui';
import type { ExamAttemptWithDate } from '@/types/unified-exams';
import AttemptTimeline from './AttemptTimeline';

interface MyJourneyViewProps {
  attempts: ExamAttemptWithDate[];
  onPickDate: () => void;
  onMarkCompleted: (id: string) => void;
  onEnterScores: (id: string) => void;
  onDeleteDate?: (id: string, reason: string) => void;
  onEditDate?: (id: string) => void;
}

export default function MyJourneyView({ attempts, onPickDate, onMarkCompleted, onEnterScores, onDeleteDate, onEditDate }: MyJourneyViewProps) {
  return (
    <Box>
      <AttemptTimeline
        attempts={attempts}
        onPickDate={onPickDate}
        onMarkCompleted={onMarkCompleted}
        onEnterScores={onEnterScores}
        onDeleteDate={onDeleteDate}
        onEditDate={onEditDate}
      />
    </Box>
  );
}
