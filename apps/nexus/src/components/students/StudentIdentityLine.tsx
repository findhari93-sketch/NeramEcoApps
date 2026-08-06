'use client';

/**
 * A student's name, never on its own.
 *
 * The rule this component exists to enforce: wherever Nexus names a student, it
 * also says what state that student is in. A name alone invites a teacher to
 * act on stale information, and the two facts that most change what an action
 * MEANS are the study stage and whether the student is still participating.
 *
 * Dormant leads, deliberately, and for the same reason StudentRowChips gives:
 * a dormant chip changes what every other number beside it means. An attempt
 * count next to a dormant student is a historical fact, not a live one, and a
 * teacher about to chase them needs to know that before they read the number.
 *
 * The two chips are separate components, not one combined chip, because a
 * student is "Class 11" AND "Dormant": two facts about two different things.
 * See StudentStageChip for the full reasoning, and student-stage.ts for why the
 * axes are stored separately in the first place.
 *
 * This is a thin composition over what already exists rather than new chip work,
 * so a change to how a stage reads lands everywhere at once.
 */

import { Box, Typography, UserAvatar } from '@neram/ui';
import { stageKeyOf, type StageKey } from '@/lib/student-stage';
import { DormantChip, StudentStageChip, type ChipDensity } from './StudentStageChip';

export interface StudentIdentity {
  id: string;
  name: string | null;
  avatar_url?: string | null;
  /** nexus_enrollments.current_standard. Null renders as "Not set", never hidden. */
  current_standard?: string | null;
  participation_status?: 'active' | 'dormant' | string | null;
  dormant_since?: string | null;
  dormant_reason?: string | null;
}

export default function StudentIdentityLine({
  student,
  density = 'card',
  trailing,
  /**
   * Hide the stage chip when the surrounding screen is already scoped to one
   * stage, where repeating it on every row is noise. Dormant is NEVER hideable:
   * that is the whole point of the component.
   */
  showStage = true,
  onClickStage,
}: {
  student: StudentIdentity;
  density?: ChipDensity;
  trailing?: React.ReactNode;
  showStage?: boolean;
  onClickStage?: () => void;
}) {
  const dormant = student.participation_status === 'dormant';
  const stage: StageKey = stageKeyOf(student.current_standard);
  const name = student.name?.trim() || 'Unknown student';

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, width: '100%' }}>
      <UserAvatar
        name={name}
        src={student.avatar_url || undefined}
        size={density === 'compact' ? 24 : 30}
        // A dormant student's avatar is dimmed to match their chip, so the row
        // reads as paused at a glance on a phone where chips are small.
        sx={{ flexShrink: 0, opacity: dormant ? 0.6 : 1 }}
      />

      <Typography
        variant="body2"
        sx={{ fontWeight: 700, minWidth: 0, flexShrink: 1, color: dormant ? 'text.secondary' : 'text.primary' }}
        noWrap
      >
        {name}
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0, flexWrap: 'wrap' }}>
        {dormant && (
          <DormantChip since={student.dormant_since} reason={student.dormant_reason} density={density} />
        )}
        {showStage && <StudentStageChip stage={stage} density={density} onClick={onClickStage} />}
      </Box>

      {trailing && <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>{trailing}</Box>}
    </Box>
  );
}
