'use client';

import { Chip, Tooltip, alpha, useTheme } from '@neram/ui';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import {
  STAGE_LABEL,
  examYearDescription,
  pairMismatchColor,
  pairMismatchTooltip,
  stageKeyOf,
  type StageKey,
} from '@/lib/student-stage';
import type { ChipDensity } from './StudentStageChip';

/**
 * The exam-year cohort as a chip.
 *
 * Two things were wrong with the plain pill this replaces. It rendered
 * `<Chip color="primary">` and painted grey anyway, because the MuiChip `filled`
 * slot in packages/ui/src/theme/theme.ts wins over `colorPrimary`. And it showed a
 * bare '2026-27' with no tooltip and no accessible name, which tells a screen
 * reader nothing and a new teacher barely more.
 *
 * When the year disagrees with the class it turns amber and says what it expected,
 * because that pairing is the whole reason this feature exists.
 */
export interface ExamYearChipProps {
  academicYear?: string | null;
  /** From the API's per-student pair_status. Only 'mismatch' changes the look. */
  pairStatus?: string | null;
  /** The class it disagrees with, for the tooltip copy. */
  studyStage?: string | null;
  /** expectedYearForStage(stage, currentBatch), so the tooltip names a real fix. */
  expectedYear?: string | null;
  density?: ChipDensity;
  onClick?: () => void;
}

export default function ExamYearChip({
  academicYear,
  pairStatus,
  studyStage,
  expectedYear,
  density = 'card',
  onClick,
}: ExamYearChipProps) {
  const theme = useTheme();
  const mode = theme.palette.mode === 'dark' ? 'dark' : 'light';
  if (!academicYear) return null;

  const mismatch = pairStatus === 'mismatch';
  const stage: StageKey = stageKeyOf(studyStage);

  const geo =
    density === 'compact'
      ? { height: 18, fontSize: '0.62rem' }
      : { height: 20, fontSize: density === 'card' ? '0.68rem' : '0.7rem' };

  const colour = mismatch ? pairMismatchColor(mode) : theme.palette.text.secondary;

  const description = examYearDescription(academicYear);
  const tooltip = mismatch
    ? pairMismatchTooltip(STAGE_LABEL[stage], academicYear, expectedYear)
    : description;

  return (
    <Tooltip title={tooltip} enterTouchDelay={0}>
      <Chip
        label={academicYear}
        size="small"
        icon={
          mismatch ? (
            <WarningAmberOutlinedIcon sx={{ fontSize: geo.fontSize, color: `${colour} !important` }} />
          ) : undefined
        }
        onClick={onClick}
        // MUI Tooltip otherwise makes the tooltip text the accessible name, which
        // overrides the visible '2026-27' and fails WCAG 2.5.3 Label in Name. Lead
        // with what is on screen, then explain it.
        aria-label={mismatch ? `${academicYear}, needs checking. ${tooltip}` : description}
        sx={{
          ...geo,
          flexShrink: 0,
          fontFamily: 'monospace',
          fontWeight: mismatch ? 700 : 500,
          // Explicit hexes, never <Chip color="...">. See STAGE_COLOR in
          // lib/student-stage.ts for why the color prop cannot be trusted here.
          bgcolor: mismatch ? alpha(colour, 0.14) : alpha(theme.palette.text.primary, 0.06),
          color: colour,
          border: mismatch ? `1px solid ${alpha(colour, 0.4)}` : '1px solid transparent',
          cursor: onClick ? 'pointer' : 'default',
          '& .MuiChip-label': { px: 0.6 },
          '& .MuiChip-icon': { ml: 0.4, mr: -0.2 },
        }}
      />
    </Tooltip>
  );
}
