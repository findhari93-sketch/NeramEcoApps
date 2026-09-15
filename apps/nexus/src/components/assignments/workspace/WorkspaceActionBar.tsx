'use client';

/**
 * The one thing the student can do next, always in the same place: the last
 * row of the panel, just above the bottom nav on a phone.
 */
import { Box, Button, Typography } from '@neram/ui';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import type { PrimaryAction } from '@/lib/drawing-workspace-state';

export default function WorkspaceActionBar({
  action,
  onPrimary,
}: {
  action: PrimaryAction;
  onPrimary: () => void;
}) {
  return (
    <Box
      sx={{
        flexShrink: 0,
        borderTop: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        px: 2,
        // The report-a-problem button floats at the bottom right from tablet
        // width up; keep the button clear of it.
        pr: { xs: 2, sm: 10 },
        pt: 1,
        pb: 1,
      }}
    >
      <Button
        variant={action.variant}
        fullWidth
        startIcon={<BrushOutlinedIcon />}
        onClick={onPrimary}
        sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}
      >
        {action.label}
      </Button>
      {action.hint && (
        // On a phone the same line sits in the panel, where it does not take
        // height away from the feedback.
        <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' }, mt: 0.5, textAlign: 'center' }}>
          {action.hint}
        </Typography>
      )}
    </Box>
  );
}
