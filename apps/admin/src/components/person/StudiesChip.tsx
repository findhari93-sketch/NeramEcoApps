'use client';

/**
 * The class chip on a person's page, beside the language chip: "Class 12",
 * "Break year, finished 2025", or "Class" when nobody has said.
 *
 * On these pages the big avatar opens the photo, so this chip is where staff
 * set the class. It opens the same Class section the avatar's quick editor
 * shows, and saves the same way (PATCH /api/crm/users/[id]/studies).
 */
import { useState } from 'react';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import BoltIcon from '@mui/icons-material/Bolt';
import { Alert, Chip, Popover, Snackbar } from '@neram/ui';
import { BREAK_YEAR_COLOR, STANDARD_LABEL, isBreakYear, type PersonFacts } from '@/lib/person-avatar';
import { StudiesSection } from './PersonQuickEditor';
import { usePersonEdits } from './usePersonEdits';

export function studiesChipLabel(facts: Partial<PersonFacts> | null | undefined): string {
  const label = facts?.currentStandard ? STANDARD_LABEL[facts.currentStandard] : null;
  if (!label) return 'Class';
  if (isBreakYear(facts) && facts?.twelfthPassedYear) return `${label}, finished ${facts.twelfthPassedYear}`;
  return label;
}

export default function StudiesChip({ userId }: { userId: string }) {
  const { facts, saving, error, clearError, saveStudies } = usePersonEdits(userId);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const breakYear = isBreakYear(facts);
  const fromForm = facts?.studySource === 'application' || facts?.studySource === 'demo';

  return (
    <>
      <Chip
        size="small"
        variant={breakYear ? 'filled' : 'outlined'}
        disabled={!facts || saving}
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="dialog"
        aria-label={`Class: ${studiesChipLabel(facts)}. Change`}
        data-testid="person-studies-chip"
        icon={breakYear ? <BoltIcon sx={{ fontSize: 16 }} /> : <SchoolOutlinedIcon sx={{ fontSize: 16 }} />}
        label={studiesChipLabel(facts)}
        sx={{
          height: 28,
          fontWeight: 600,
          cursor: 'pointer',
          // Sits in a row of 28px status chips, but takes a 44px tall hit area.
          position: 'relative',
          overflow: 'visible',
          '&::before': { content: '""', position: 'absolute', inset: '-8px 0' },
          ...(breakYear ? { bgcolor: BREAK_YEAR_COLOR, color: '#fff', '& .MuiChip-icon': { color: '#fff' } } : {}),
          // The student's own word on a form, not confirmed yet: dashed, as a guessed language is.
          ...(fromForm && !breakYear ? { borderStyle: 'dashed', color: 'text.secondary' } : {}),
          '&:hover': breakYear ? { bgcolor: '#9A3412' } : undefined,
        }}
      />

      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { width: 340, maxWidth: 'calc(100vw - 32px)', p: 2, borderRadius: 2 } } }}
      >
        <StudiesSection facts={facts} disabled={saving || !facts} onSave={(patch) => void saveStudies(patch)} />
      </Popover>

      <Snackbar
        open={!!error}
        autoHideDuration={5000}
        onClose={clearError}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" variant="filled" onClose={clearError}>
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}
