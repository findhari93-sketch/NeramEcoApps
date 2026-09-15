'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
  useMediaQuery,
} from '@neram/ui';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import StarIcon from '@mui/icons-material/Star';
import StarOutlineIcon from '@mui/icons-material/StarOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { InspirationCard } from '@/lib/inspiration-present';
import { HIDDEN_REASON_LABEL } from '@/lib/inspiration-rules';
import { deleteExemplarItem, patchItem } from './inspiration-api';

export interface InspirationCurationBarProps {
  card: InspirationCard;
  base: string;
  onChanged: () => void;
}

const actionSx = { minHeight: 44 } as const;

/**
 * Teacher controls on a drawing. Every change is reversible here except deleting
 * an exemplar. "Hide all from this student" turns the student's drawing sharing
 * off (the same switch as their own opt-out); only an admin turns it back on.
 */
export default function InspirationCurationBar({ card, base, onChanged }: InspirationCurationBarProps) {
  const { getToken } = useNexusAuthContext();
  const router = useRouter();
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const staff = card.staff!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<'author' | 'delete' | null>(null);
  const [title, setTitle] = useState(staff.titleOverride ?? '');
  const [brief, setBrief] = useState(card.brief ?? '');

  const run = async (action: () => Promise<unknown>, { refresh = true }: { refresh?: boolean } = {}) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      if (refresh) onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the change');
    } finally {
      setBusy(false);
    }
  };

  // Showing an opted-out student's own drawing would override their choice.
  const authorOptedOut = staff.hiddenReason === HIDDEN_REASON_LABEL.opted_out;
  const optOutHelpId = `inspiration-opt-out-help-${card.id}`;

  const status = staff.visible
    ? staff.curation === 'shown'
      ? 'Shown to students (a teacher added it)'
      : 'Shown to students'
    : staff.hiddenReason ?? 'Not shown to students';

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="subtitle2" component="h2">
        Teacher controls
      </Typography>
      <Typography variant="body2" color="text.secondary" aria-live="polite">
        {status}
      </Typography>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {staff.visible ? (
          <Button variant="outlined" color="inherit" startIcon={<VisibilityOffOutlinedIcon />} disabled={busy} onClick={() => run(() => patchItem(getToken, card.id, { curation: 'hidden' }))} sx={actionSx}>
            Hide from students
          </Button>
        ) : (
          <Button
            // Outlined when refused: a disabled contained primary still reads as pressable in the shared theme.
            variant={authorOptedOut ? 'outlined' : 'contained'}
            startIcon={<VisibilityOutlinedIcon />}
            disabled={busy || authorOptedOut}
            aria-describedby={authorOptedOut ? optOutHelpId : undefined}
            onClick={() => run(() => patchItem(getToken, card.id, { curation: 'shown' }))}
            sx={actionSx}
          >
            Show to students
          </Button>
        )}
        {staff.curation !== 'auto' && (
          <Button color="inherit" startIcon={<RestartAltIcon />} disabled={busy} onClick={() => run(() => patchItem(getToken, card.id, { curation: 'auto' }))} sx={actionSx}>
            Use the automatic rule
          </Button>
        )}
        <Button variant="outlined" color="inherit" startIcon={card.featured ? <StarIcon /> : <StarOutlineIcon />} disabled={busy} onClick={() => run(() => patchItem(getToken, card.id, { is_featured: !card.featured }))} sx={actionSx}>
          {card.featured ? 'Unfeature' : 'Feature'}
        </Button>
        <Button
          variant="outlined"
          color="inherit"
          startIcon={<EditOutlinedIcon />}
          onClick={() => {
            setTitle(staff.titleOverride ?? '');
            setBrief(card.brief ?? '');
            setEditing(true);
          }}
          sx={actionSx}
        >
          Edit title and brief
        </Button>
        {staff.submissionId && (
          <Button component={Link} href={`/teacher/drawing-reviews/${staff.submissionId}`} color="inherit" startIcon={<RateReviewOutlinedIcon />} sx={actionSx}>
            Open review
          </Button>
        )}
        {card.kind !== 'exemplar' && staff.authorId && (
          <Button color="inherit" startIcon={<PersonOffOutlinedIcon />} onClick={() => setConfirm('author')} sx={actionSx}>
            Hide all from this student
          </Button>
        )}
        {card.kind === 'exemplar' && (
          <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={() => setConfirm('delete')} sx={actionSx}>
            Delete exemplar
          </Button>
        )}
      </Box>

      {!staff.visible && authorOptedOut && (
        // Visible text, not a tooltip: a disabled button cannot take focus or hover.
        <Typography id={optOutHelpId} variant="body2" color="text.secondary">
          This student chose not to share their drawings.
        </Typography>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      <Dialog
        open={editing}
        onClose={() => setEditing(false)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="inspiration-edit-title"
        transitionDuration={reduceMotion ? 0 : undefined}
      >
        <DialogTitle id="inspiration-edit-title">Edit title and brief</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} inputProps={{ maxLength: 120 }} helperText="Leave empty to use the drawing type" fullWidth />
          <TextField label="Brief" value={brief} onChange={(e) => setBrief(e.target.value)} inputProps={{ maxLength: 600 }} helperText="Use the words a student would search for" multiline minRows={3} fullWidth />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditing(false)} sx={actionSx}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={busy}
            sx={actionSx}
            onClick={() =>
              run(async () => {
                await patchItem(getToken, card.id, {
                  title_override: title,
                  // Only send the brief when it changed, so a synced brief keeps following its question.
                  ...(brief !== (card.brief ?? '') ? { brief_override: brief } : {}),
                });
                setEditing(false);
              })
            }
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        aria-labelledby="inspiration-confirm-title"
        transitionDuration={reduceMotion ? 0 : undefined}
      >
        <DialogTitle id="inspiration-confirm-title">
          {confirm === 'delete' ? 'Delete this exemplar?' : "Stop showing this student's drawings?"}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {confirm === 'delete'
              ? 'Students stop seeing it, and anyone who saved it loses it. This cannot be undone.'
              : 'Their own drawings are hidden from students. References made from their work stay, credited Neram reference. An admin can turn sharing back on.'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirm(null)} sx={actionSx}>
            Cancel
          </Button>
          <Button
            color={confirm === 'delete' ? 'error' : 'primary'}
            variant="contained"
            disabled={busy}
            sx={actionSx}
            onClick={() =>
              confirm === 'delete'
                ? run(
                    async () => {
                      await deleteExemplarItem(getToken, card.id);
                      router.push(base);
                    },
                    { refresh: false },
                  )
                : run(async () => {
                    await patchItem(getToken, card.id, { hide_all_by_author: true });
                    setConfirm(null);
                  })
            }
          >
            {confirm === 'delete' ? 'Delete' : 'Stop showing'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
