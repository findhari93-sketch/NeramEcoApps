'use client';

import { Box, Checkbox, Paper, alpha, type SxProps, type Theme } from '@neram/ui';

/**
 * The clickable container every student row shares, plus the select-mode
 * checkbox.
 *
 * Select mode changes what a tap MEANS, from "open this student" to "add them to
 * the selection". On a phone there is no hover to hint at that, so the checkbox
 * is permanently visible whenever select mode is on rather than revealed on
 * hover, and the row carries aria-selected so the change is announced too.
 */
export default function StudentRowShell({
  selectMode = false,
  selected = false,
  onToggleSelect,
  onOpen,
  dormant = false,
  sx,
  children,
}: {
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onOpen: () => void;
  dormant?: boolean;
  sx?: SxProps<Theme>;
  children: React.ReactNode;
}) {
  const handleClick = () => {
    if (selectMode) onToggleSelect?.();
    else onOpen();
  };

  return (
    <Paper
      variant="outlined"
      onClick={handleClick}
      role={selectMode ? 'option' : 'button'}
      aria-selected={selectMode ? selected : undefined}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      sx={{
        cursor: 'pointer',
        borderRadius: 2,
        transition: 'background-color .2s, border-color .2s, box-shadow .2s',
        // A dormant row is deliberately quieter than the rest of the list.
        ...(dormant && { bgcolor: (t: Theme) => alpha(t.palette.action.disabled, 0.04) }),
        ...(selected && {
          borderColor: 'primary.main',
          bgcolor: (t: Theme) => alpha(t.palette.primary.main, 0.08),
        }),
        '&:hover': {
          backgroundColor: 'action.hover',
          borderColor: (t: Theme) => alpha(t.palette.primary.main, 0.4),
        },
        '&:active': { backgroundColor: 'action.selected' },
        ...sx,
      }}
    >
      {selectMode && (
        <Box onClick={(e) => e.stopPropagation()} sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <Checkbox
            checked={selected}
            onChange={() => onToggleSelect?.()}
            inputProps={{ 'aria-label': 'Select student' }}
            sx={{ p: 1 }}
          />
        </Box>
      )}
      {children}
    </Paper>
  );
}
