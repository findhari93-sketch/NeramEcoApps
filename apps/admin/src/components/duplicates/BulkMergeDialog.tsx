'use client';

import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@neram/ui';
import { RELATION_LABELS, UNDO_WINDOW_DAYS } from '@neram/database/duplicate-evidence';
import { formatPhoneForDisplay } from '@neram/database/phone';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import { FOCUS_RING, TARGET_44 } from '@/components/ops/OpsUi';
import type { CandidatePerson, QueuePair } from './types';

const SHOWN = 8;

function who(p: CandidatePerson | null): string {
  if (!p) return 'a record';
  return p.name && p.name !== 'User' ? p.name : formatPhoneForDisplay(p.phone) || p.email || 'an unnamed record';
}

/**
 * One confirmation for many merges: which pairs, and how each is merged (the
 * same person, or a parent folded into a student). Undo stays possible.
 */
export default function BulkMergeDialog({
  pairs,
  open,
  busy,
  onCancel,
  onConfirm,
}: {
  pairs: QueuePair[];
  open: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const n = pairs.length;
  const family = pairs.filter((p) => p.relation_guess && p.relation_guess !== 'self').length;
  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel} maxWidth="sm" fullWidth aria-labelledby="bulk-merge-title">
      <DialogTitle id="bulk-merge-title" sx={{ fontWeight: 700 }}>
        Merge {n} {n === 1 ? 'pair' : 'pairs'}?
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Each pair becomes one record.
          {family > 0
            ? ` In ${family} of them the other record is a parent or family number, so the student keeps their own details and the family number is saved on them.`
            : ''}{' '}
          You can undo any of these for {UNDO_WINDOW_DAYS} days.
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.5 }}>
          {pairs.slice(0, SHOWN).map((p) => (
            <Typography component="li" variant="body2" key={p.id}>
              {who(p.a)} and {who(p.b)}
              <Typography component="span" variant="caption" color="text.secondary">
                {' '}({RELATION_LABELS[p.relation_guess || 'unknown'].toLowerCase()})
              </Typography>
            </Typography>
          ))}
          {n > SHOWN && (
            <Typography component="li" variant="body2" color="text.secondary">
              and {n - SHOWN} more
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={onCancel} disabled={busy} sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={onConfirm}
          disabled={busy || n === 0}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <MergeTypeIcon />}
          sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none' }}
        >
          {busy ? 'Merging' : `Merge ${n}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
