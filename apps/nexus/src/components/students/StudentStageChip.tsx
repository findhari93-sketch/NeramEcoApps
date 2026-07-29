'use client';

import { Chip, Tooltip, alpha, useTheme } from '@neram/ui';
import {
  DORMANT_EXPLAINER,
  DORMANT_LABEL,
  STAGE_LABEL,
  STAGE_TOOLTIP,
  dormantColor,
  stageColor,
  type StageKey,
} from '@/lib/student-stage';
import { DormantIcon, stageIconFor } from './StageGlyph';

/**
 * The two classification chips.
 *
 * They are deliberately SEPARATE components rather than one combined chip. A
 * student is "Class 11" AND "Dormant": two facts about two different things, and
 * folding them into a single chip is exactly the conflation the whole feature
 * exists to prevent.
 *
 * Colour is never the only signal: every state carries an icon, a label and a
 * tooltip, the same rule EmailDomainFlag documents.
 *
 * NOTE ON COLOUR: these use explicit `bgcolor: alpha(HEX, .14) / color: HEX`
 * rather than a MUI `color="..."` prop, and that is not an oversight. The
 * MuiChip overrides in packages/ui/src/theme/theme.ts resolve against the BASE
 * semanticColors, not the Nexus palette in variants.ts, so `<Chip
 * color="warning">` renders a different hue from theme.palette.warning.main.
 * Do not "simplify" this back to a colour prop.
 */

/** Chip geometry per row density, matching the three existing chip rows. */
const DENSITY = {
  compact: { height: 18, fontSize: '0.62rem', iconSize: '0.78rem' },
  card: { height: 20, fontSize: '0.68rem', iconSize: '0.85rem' },
  detailed: { height: 20, fontSize: '0.7rem', iconSize: '0.88rem' },
} as const;

export type ChipDensity = keyof typeof DENSITY;

export function StudentStageChip({
  stage,
  density = 'card',
  onClick,
}: {
  stage: StageKey;
  density?: ChipDensity;
  onClick?: () => void;
}) {
  const theme = useTheme();
  const geo = DENSITY[density];
  const color = stageColor(stage, theme.palette.mode === 'dark' ? 'dark' : 'light');
  const Icon = stageIconFor(stage);
  const label = STAGE_LABEL[stage];
  const tooltip = STAGE_TOOLTIP[stage];

  return (
    <Tooltip title={tooltip} arrow enterTouchDelay={0} leaveTouchDelay={4000}>
      <Chip
        size="small"
        icon={<Icon sx={{ fontSize: geo.iconSize, color: `${color} !important` }} />}
        label={label}
        onClick={onClick}
        aria-label={`${label}: ${tooltip}`}
        sx={{
          height: geo.height,
          fontSize: geo.fontSize,
          fontWeight: 700,
          flexShrink: 0,
          cursor: onClick ? 'pointer' : 'help',
          bgcolor: alpha(color, 0.14),
          color,
          '& .MuiChip-label': { px: 0.75 },
          '& .MuiChip-icon': { ml: 0.5, mr: -0.25 },
        }}
      />
    </Tooltip>
  );
}

export function DormantChip({
  since,
  reason,
  density = 'card',
  onClick,
}: {
  since?: string | null;
  reason?: string | null;
  density?: ChipDensity;
  onClick?: () => void;
}) {
  const theme = useTheme();
  const geo = DENSITY[density];
  const color = dormantColor(theme.palette.mode === 'dark' ? 'dark' : 'light');

  // Every part of the tooltip is optional except the consequences, which are
  // rendered from the one shared constant so this chip, the classify drawer and
  // the empty states can never end up promising different things.
  const paused = since
    ? `Paused ${new Date(since).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}. `
    : '';
  const why = reason ? `Reason: ${reason}. ` : '';
  const tooltip = `${paused}${why}${DORMANT_EXPLAINER}`;

  return (
    <Tooltip title={tooltip} arrow enterTouchDelay={0} leaveTouchDelay={6000}>
      <Chip
        size="small"
        icon={<DormantIcon sx={{ fontSize: geo.iconSize, color: `${color} !important` }} />}
        label={DORMANT_LABEL}
        onClick={onClick}
        aria-label={`${DORMANT_LABEL}: ${tooltip}`}
        sx={{
          height: geo.height,
          fontSize: geo.fontSize,
          fontWeight: 700,
          flexShrink: 0,
          cursor: onClick ? 'pointer' : 'help',
          bgcolor: alpha(color, 0.18),
          color: theme.palette.mode === 'dark' ? color : '#475569',
          border: `1px dashed ${alpha(color, 0.7)}`,
          '& .MuiChip-label': { px: 0.75 },
          '& .MuiChip-icon': { ml: 0.5, mr: -0.25 },
        }}
      />
    </Tooltip>
  );
}
