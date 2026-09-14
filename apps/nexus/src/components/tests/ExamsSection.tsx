'use client';

/**
 * Model tests, on their own.
 *
 * An exam behaves nothing like a class test underneath (a hard window instead
 * of a soft deadline, a rank that only appears once results are published, one
 * sitting instead of unlimited retries), so it gets its own section rather than
 * sitting inside "All class tests" pretending the rules are the same.
 *
 * Deliberately absent when the classroom has no exams: an empty Exams block on
 * every classroom that never runs one is permanent noise, not an empty state.
 *
 * No subtitle. It used to carry "Model tests with a fixed start and end time.
 * Rank appears once results are out.", which is a manual, reprinted on every
 * load, above cards that now say the same thing about themselves and only when
 * it is true of that card.
 */

import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import StudentTestCard, { type StudentTest } from './StudentTestCard';
import TestsSection from './TestsSection';
import TestCardGrid from './TestCardGrid';
import type { TestCardHandlers } from './ClassTestsTab';

export default function ExamsSection({ exams, ...handlers }: { exams: StudentTest[] } & TestCardHandlers) {
  if (exams.length === 0) return null;

  return (
    <TestsSection icon={<EventAvailableOutlinedIcon />} title="Exams" count={exams.length}>
      <TestCardGrid>
        {exams.map((t) => (
          <StudentTestCard
            key={`${t.id}-${t.placement_id}`}
            test={t}
            // Filled button on the ones a student can act on right now, outlined
            // on the rest, so a scroll through six exams has one obvious target.
            emphasis={t.card ? ['open', 'reopened'].includes(t.card.state) : t.status === 'open'}
            {...handlers}
          />
        ))}
      </TestCardGrid>
    </TestsSection>
  );
}
