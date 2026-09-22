'use client';

import { Box, Button, IconButton, Paper, Typography } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import SelectAllIcon from '@mui/icons-material/SelectAll';
import { BOTTOM_NAV_HEIGHT } from '@/lib/shell-chrome';
import { MAX_STUDENT_TEST_QUESTIONS } from '@/lib/test-limits';

interface SelectionBarProps {
  /** `rail`: the foot of the laptop rail. `fixed`: pinned above the phone's bottom nav. */
  variant: 'rail' | 'fixed';
  count: number;
  onSelectAll: () => void;
  onCancel: () => void;
  onCreate: () => void;
}

/**
 * Building a test: how many are picked, and what to do with them.
 *
 * Replaces a "Select" button and a "+ Test" button that did overlapping things
 * (+ Test opened a dialog that could not create anything until Select had been
 * pressed first). The phone version used to sit at `bottom: 56`, which put it
 * behind the 64px bottom nav between 600 and 899px and under its top edge on a
 * phone; it now clears the nav and the home indicator.
 */
export default function SelectionBar({ variant, count, onSelectAll, onCancel, onCreate }: SelectionBarProps) {
  const inner = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, maxWidth: 760, mx: 'auto', width: '100%' }}>
      <IconButton onClick={onCancel} aria-label="Stop selecting" sx={{ width: 44, height: 44, flexShrink: 0 }}>
        <CloseIcon />
      </IconButton>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }} aria-live="polite">
          {count} selected
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'block' } }}>
          Up to {MAX_STUDENT_TEST_QUESTIONS}
        </Typography>
      </Box>
      <Button
        variant="text"
        onClick={onSelectAll}
        startIcon={<SelectAllIcon />}
        sx={{
          minHeight: 44,
          textTransform: 'none',
          fontWeight: 600,
          flexShrink: 0,
          // A 375px phone has room for the words or the icon, not both.
          '& .MuiButton-startIcon': { display: { xs: 'none', sm: 'inherit' } },
        }}
      >
        Select all
      </Button>
      <Button
        variant="contained"
        onClick={onCreate}
        disabled={count === 0}
        sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700, flexShrink: 0 }}
      >
        Create test
      </Button>
    </Box>
  );

  if (variant === 'rail') {
    return (
      <Box sx={{ flexShrink: 0, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', px: 1, py: 1 }}>
        {inner}
      </Box>
    );
  }

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
        zIndex: (theme) => theme.zIndex.appBar + 1,
        borderTop: '1px solid',
        borderColor: 'divider',
        borderRadius: 0,
        px: 1,
        py: 1,
      }}
    >
      {inner}
    </Paper>
  );
}
