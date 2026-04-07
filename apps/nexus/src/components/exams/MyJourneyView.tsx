'use client';

import { Box } from '@neram/ui';
import type { ExamAttemptWithDate } from '@/types/unified-exams';
import AttemptTimeline from './AttemptTimeline';

interface MyJourneyViewProps {
  attempts: ExamAttemptWithDate[];
  onPickDate: () => void;
  onMarkCompleted: (id: string) => void;
  onEnterScores: (id: string) => void;
}

export default function MyJourneyView({ attempts, onPickDate, onMarkCompleted, onEnterScores }: MyJourneyViewProps) {
  return (
    <Box>
      <AttemptTimeline
        attempts={attempts}
        onPickDate={onPickDate}
        onMarkCompleted={onMarkCompleted}
        onEnterScores={onEnterScores}
      />
    </Box>
  );
}
