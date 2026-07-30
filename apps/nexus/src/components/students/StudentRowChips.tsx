'use client';

import { Box, Chip } from '@neram/ui';
import { expectedYearForStage } from '@neram/database';
import EmailDomainFlag from './EmailDomainFlag';
import ExamYearChip from './ExamYearChip';
import { DormantChip, StudentStageChip, type ChipDensity } from './StudentStageChip';
import { stageKeyOf } from '@/lib/student-stage';
import type { EmailDomainStatus } from '@/lib/classroom-email';

/**
 * The one chip row for a student, at any density.
 *
 * The three renderers on the students screen each used to carry their own copy
 * of this, at three different heights (18 vs 20) and three different font sizes
 * (0.62 vs 0.68 vs 0.70rem). Adding the stage and dormant chips to three
 * divergent copies would have guaranteed they drifted apart within a month, so
 * the density became a prop instead.
 *
 * Order is fixed and meaningful, most-decision-changing first:
 *   dormant -> stage -> exam year -> section -> email problem
 *
 * Dormant leads because it changes what every other chip MEANS: an attendance
 * figure next to a dormant chip is a historical fact, not a live one.
 */
export interface StudentRowChipsProps {
  studyStage?: string | null;
  participationStatus?: string | null;
  dormantSince?: string | null;
  dormantReason?: string | null;
  examBatch?: string | null;
  /** Per-student pair_status from the API. 'mismatch' turns the year chip amber. */
  pairStatus?: string | null;
  /** The current cohort code, so the mismatch tooltip can name the expected year. */
  currentBatch?: string | null;
  batchName?: string | null;
  emailStatus: EmailDomainStatus;
  awaitingMicrosoft?: boolean;
  density?: ChipDensity;
  /** Compact rows hide the classroom section to keep the name readable. */
  showSection?: boolean;
}

export default function StudentRowChips({
  studyStage,
  participationStatus,
  dormantSince,
  dormantReason,
  examBatch,
  pairStatus,
  currentBatch,
  batchName,
  emailStatus,
  awaitingMicrosoft = false,
  density = 'card',
  showSection = true,
}: StudentRowChipsProps) {
  const dormant = participationStatus === 'dormant';
  const stage = stageKeyOf(studyStage);
  const geo = density === 'compact' ? { height: 18, fontSize: '0.62rem' } : { height: 20, fontSize: density === 'card' ? '0.68rem' : '0.7rem' };

  return (
    <>
      {dormant && (
        <DormantChip since={dormantSince} reason={dormantReason} density={density} />
      )}
      <StudentStageChip stage={stage} density={density} />
      <ExamYearChip
        academicYear={examBatch}
        pairStatus={pairStatus}
        studyStage={studyStage}
        expectedYear={currentBatch ? expectedYearForStage(stage, currentBatch) : null}
        density={density}
      />
      {showSection && batchName && (
        <Chip label={batchName} size="small" variant="outlined" sx={{ ...geo, flexShrink: 0 }} />
      )}
      <EmailDomainFlag status={emailStatus} awaitingMicrosoft={awaitingMicrosoft} />
    </>
  );
}

/** The same set wrapped in a flex row, for layouts that want it self-contained. */
export function StudentChipRow(props: StudentRowChipsProps) {
  return (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
      <StudentRowChips {...props} />
    </Box>
  );
}
