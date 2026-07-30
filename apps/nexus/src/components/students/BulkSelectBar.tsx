'use client';

import { Box, Button, Typography, useTheme } from '@neram/ui';

/**
 * The selection footer, shown only while select mode is on.
 *
 * Fixed to the bottom rather than sticky inside the list: with 19 students to
 * classify the manager scrolls a lot, and an action bar that scrolls away is an
 * action bar they have to hunt for. `env(safe-area-inset-bottom)` keeps it clear
 * of the iOS home indicator.
 */
export default function BulkSelectBar({
  selectedCount,
  visibleCount,
  canClassify,
  canSetDormancy = false,
  onSelectAll,
  onClear,
  onSetStage,
  onMarkDormant,
  onReactivate,
  showReactivate = false,
}: {
  selectedCount: number;
  visibleCount: number;
  /** Covers "Set class and exam year". Any teaching staff hold this. */
  canClassify: boolean;
  /**
   * Covers "Mark dormant" and "Bring back" only. Manager and admin. Kept separate
   * from canClassify so a teacher gets the class button live and the dormancy
   * button disabled, rather than all-or-nothing.
   */
  canSetDormancy?: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onSetStage: () => void;
  onMarkDormant: () => void;
  onReactivate: () => void;
  /** The dormant segment offers "Bring back" instead of "Mark dormant". */
  showReactivate?: boolean;
}) {
  const theme = useTheme();
  const none = selectedCount === 0;

  return (
    <Box
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1200,
        px: 2,
        pt: 1.5,
        pb: 'calc(12px + env(safe-area-inset-bottom))',
        bgcolor: 'background.paper',
        borderTop: `1px solid ${theme.palette.divider}`,
        boxShadow: '0 -4px 20px rgba(0,0,0,0.10)',
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'stretch', sm: 'center' },
        gap: 1,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
          {selectedCount} selected
        </Typography>
        <Button size="small" onClick={onSelectAll} sx={{ minHeight: 36 }}>
          Select all ({visibleCount})
        </Button>
        <Button size="small" onClick={onClear} disabled={none} sx={{ minHeight: 36 }}>
          Clear
        </Button>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
        {/* Hidden rather than disabled for a teacher: a permanently greyed control
            reads as a bug, and dormancy is not something they will ever gain here. */}
        {canSetDormancy && (
          <Button
            variant="outlined"
            onClick={showReactivate ? onReactivate : onMarkDormant}
            disabled={none}
            color={showReactivate ? 'success' : 'warning'}
            sx={{ minHeight: 44, flex: { xs: 1, sm: 'none' }, fontWeight: 700 }}
          >
            {showReactivate ? 'Bring back' : 'Mark dormant'}
          </Button>
        )}
        <Button
          variant="contained"
          onClick={onSetStage}
          disabled={none || !canClassify}
          sx={{ minHeight: 44, flex: { xs: 1, sm: 'none' }, fontWeight: 700 }}
        >
          Set stage
        </Button>
      </Box>
    </Box>
  );
}
