'use client';

import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import type { SvgIconComponent } from '@mui/icons-material';
import { STAGE_ICON, type StageIconKey, type StageKey } from '@/lib/student-stage';

/**
 * The icon key -> component mapping.
 *
 * It lives here rather than in student-stage.ts so that module stays JSX-free
 * and importable from route handlers, exactly like staff-capabilities.ts. The
 * tokens name an icon; this file is the only place that knows what an icon IS.
 */
const ICONS: Record<StageIconKey, SvgIconComponent> = {
  bolt: BoltOutlinedIcon,
  flag: FlagOutlinedIcon,
  schedule: ScheduleOutlinedIcon,
  school: SchoolOutlinedIcon,
  help: HelpOutlineOutlinedIcon,
};

export function stageIconFor(stage: StageKey): SvgIconComponent {
  return ICONS[STAGE_ICON[stage]];
}

// Explicitly annotated: without it TypeScript tries to name MUI's
// OverridableComponent type through a pnpm-hashed path and refuses.
export const DormantIcon: SvgIconComponent = PauseCircleOutlineIcon;
