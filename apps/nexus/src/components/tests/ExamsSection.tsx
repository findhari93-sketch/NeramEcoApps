'use client';

/**
 * Model tests, on their own. An exam behaves nothing like a class test
 * underneath (a hard window instead of a soft deadline, "Absent" instead of
 * "Overdue", a rank that only appears once results are published), so it gets
 * its own card rather than sitting inside "All class tests" pretending the
 * rules are the same.
 *
 * Deliberately absent when the classroom has no exams: an empty "Exams" card
 * on every classroom that never runs one would be permanent noise, not a
 * useful empty state.
 */

import { Box } from '@neram/ui';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import StudentTestCard, { type StudentTest } from './StudentTestCard';
import TestsSection from './TestsSection';

export default function ExamsSection({
  exams,
  onStart,
  onReschedule,
}: {
  exams: StudentTest[];
  onStart: (t: StudentTest) => void;
  /** Opt-in: see StudentTestCard's onReschedule. Omit and no card offers it. */
  onReschedule?: (t: StudentTest) => void;
}) {
  if (exams.length === 0) return null;

  return (
    <TestsSection
      icon={<EventAvailableOutlinedIcon />}
      title="Exams"
      subtitle="Model tests with a fixed start and end time. Rank appears once results are out."
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {exams.map((t) => (
          <StudentTestCard
            key={`${t.id}-${t.placement_id}`}
            test={t}
            onStart={onStart}
            onReschedule={onReschedule}
            emphasis={t.status === 'open' || t.status === 'upcoming'}
          />
        ))}
      </Box>
    </TestsSection>
  );
}
