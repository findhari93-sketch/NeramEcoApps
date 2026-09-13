'use client';

/**
 * Three counts that are also the filters: Flagged, Needs a look, Looks routine.
 *
 * Tapping a card narrows the roster to that band and tapping it again shows
 * everyone, the same way the stat cards work elsewhere in Nexus. Colour is
 * never the only signal: each band has its own icon and its name in words.
 *
 * LOOKS ROUTINE opens a fast lane, not a release. Nothing has read those sheets
 * yet, so the quickest honest thing is to walk them one after another.
 *
 * Once AI drafts exist, routine sheets with a sure draft can be approved
 * unread, but only after the shadow comparison says the drafts grade like the
 * teacher. Until then the button stays disabled with that reason in words.
 */

import { useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Skeleton, Stack, Typography, alpha } from '@neram/ui';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import type { TriageBand } from '@/lib/drawing-triage';
import { BAND_LABEL } from '@/lib/drawing-triage';

export const BAND_TONE: Record<TriageBand, { fg: string; bg: string; Icon: typeof FlagOutlinedIcon }> = {
  flagged: { fg: '#B91C1C', bg: '#DC2626', Icon: FlagOutlinedIcon },
  needs_look: { fg: '#9A4A00', bg: '#EF6C00', Icon: VisibilityOutlinedIcon },
  routine: { fg: '#1B5E20', bg: '#2E7D32', Icon: TaskAltOutlinedIcon },
};

const ORDER: TriageBand[] = ['flagged', 'needs_look', 'routine'];

interface Props {
  counts: Record<TriageBand, number>;
  selected: TriageBand | null;
  onSelect: (band: TriageBand | null) => void;
  onOpenFastLane: () => void;
  loading?: boolean;
  failed?: boolean;
  checking?: number;
  routineDrafts?: number;
  unreadGate?: { ready: boolean; reason: string } | null;
  /** Resolves with a sentence to show, once the approved drafts are held. */
  onApproveDrafts?: () => Promise<string>;
}

export default function TriageBandCards({
  counts, selected, onSelect, onOpenFastLane, loading, failed, checking = 0, routineDrafts = 0, unreadGate = null, onApproveDrafts,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approveNote, setApproveNote] = useState<string | null>(null);

  if (failed) {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        Could not sort these drawings just now. The list below still works.
      </Typography>
    );
  }

  return (
    <Box sx={{ mb: 1.5 }} data-testid="triage-bands">
      <Box
        role="group"
        aria-label="Filter drawings by what they need"
        sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}
      >
        {ORDER.map((band) => {
          const tone = BAND_TONE[band];
          const on = selected === band;
          const Icon = tone.Icon;
          if (loading) {
            return <Skeleton key={band} variant="rounded" height={68} sx={{ borderRadius: 2 }} />;
          }
          return (
            <Box
              key={band}
              component="button"
              type="button"
              aria-pressed={on}
              aria-label={`${BAND_LABEL[band]}: ${counts[band]}. ${on ? 'Showing only these. Tap to show everyone.' : 'Tap to show only these.'}`}
              onClick={() => onSelect(on ? null : band)}
              sx={{
                all: 'unset',
                boxSizing: 'border-box',
                cursor: 'pointer',
                minHeight: 68,
                p: 1.25,
                borderRadius: 2,
                border: '1.5px solid',
                borderColor: on ? tone.bg : 'divider',
                bgcolor: on ? alpha(tone.bg, 0.08) : 'background.paper',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: 0.25,
                transition: 'border-color 150ms ease, background-color 150ms ease',
                '&:hover': { borderColor: tone.bg },
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              }}
            >
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <Icon aria-hidden sx={{ fontSize: 18, color: tone.fg }} />
                <Typography component="span" sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: 'text.primary' }}>
                  {counts[band]}
                </Typography>
              </Stack>
              <Typography component="span" sx={{ fontSize: 13, fontWeight: 600, color: tone.fg, lineHeight: 1.25 }}>
                {BAND_LABEL[band]}
              </Typography>
            </Box>
          );
        })}
      </Box>

      {!loading && (counts.routine > 0 || checking > 0) && (
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 0.5 }}>
          {counts.routine > 0 && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<BoltOutlinedIcon sx={{ fontSize: 18 }} />}
              onClick={onOpenFastLane}
              sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}
            >
              Open the fast lane ({counts.routine})
            </Button>
          )}
          <Typography variant="caption" color="text.secondary" aria-live="polite" sx={{ flex: 1, minWidth: 160 }}>
            {checking > 0
              ? `Checking ${checking} ${checking === 1 ? 'photo' : 'photos'} for blur and blank sheets.`
              : 'One after another. J and K move, Enter completes.'}
          </Typography>
        </Stack>
      )}

      {!loading && routineDrafts > 0 && onApproveDrafts && (
        <Box sx={{ mt: 1 }} data-testid="approve-drafts">
          <Button
            size="small"
            variant="contained"
            disabled={!unreadGate?.ready || approving}
            onClick={() => setConfirming(true)}
            sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}
          >
            Approve {routineDrafts} {routineDrafts === 1 ? 'draft' : 'drafts'} unread
          </Button>
          <Typography variant="caption" color="text.secondary" aria-live="polite" sx={{ display: 'block', mt: 0.5, lineHeight: 1.4 }}>
            {approveNote ?? unreadGate?.reason ?? ''}
          </Typography>
          <Dialog open={confirming} onClose={() => !approving && setConfirming(false)} maxWidth="xs" fullWidth>
            <DialogTitle>Approve {routineDrafts} drafts without opening them?</DialogTitle>
            <DialogContent>
              <Typography variant="body2">
                Only drafts sure of every criterion are approved; the rest stay for you. Nothing is sent: approved drafts wait in Hand back until you hand them back.
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirming(false)} disabled={approving} sx={{ minHeight: 44 }}>Cancel</Button>
              <Button
                variant="contained"
                disabled={approving}
                sx={{ minHeight: 44 }}
                onClick={async () => {
                  setApproving(true);
                  try {
                    setApproveNote(await onApproveDrafts());
                    setConfirming(false);
                  } catch (e) {
                    setApproveNote(e instanceof Error ? e.message : 'Nothing was approved.');
                    setConfirming(false);
                  } finally {
                    setApproving(false);
                  }
                }}
              >
                {approving ? 'Approving' : 'Approve and hold'}
              </Button>
            </DialogActions>
          </Dialog>
        </Box>
      )}
    </Box>
  );
}
