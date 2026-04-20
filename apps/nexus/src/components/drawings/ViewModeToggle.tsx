'use client';

import { IconButton, Tooltip } from '@neram/ui';
import ViewComfyOutlinedIcon from '@mui/icons-material/ViewComfyOutlined';
import ViewCompactOutlinedIcon from '@mui/icons-material/ViewCompactOutlined';
import type { DrawingViewMode } from '@/hooks/useDrawingViewMode';

interface Props {
  mode: DrawingViewMode;
  onChange: (mode: DrawingViewMode) => void;
}

/**
 * Single-button toggle between comfortable (default) and compact layouts.
 * Lives in the toolbar slot previously occupied by the Teacher Refs Only switch.
 */
export default function ViewModeToggle({ mode, onChange }: Props) {
  const next: DrawingViewMode = mode === 'comfortable' ? 'compact' : 'comfortable';
  const label = `Switch to ${next} view`;
  return (
    <Tooltip title={label}>
      <IconButton
        onClick={() => onChange(next)}
        size="small"
        aria-label={label}
        sx={{ width: 40, height: 40 }}
      >
        {mode === 'comfortable' ? (
          <ViewCompactOutlinedIcon fontSize="small" />
        ) : (
          <ViewComfyOutlinedIcon fontSize="small" />
        )}
      </IconButton>
    </Tooltip>
  );
}
