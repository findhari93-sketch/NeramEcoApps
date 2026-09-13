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
 */

import { Box, Button, Skeleton, Stack, Typography, alpha } from '@neram/ui';
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
}

export default function TriageBandCards({ counts, selected, onSelect, onOpenFastLane, loading, failed, checking = 0 }: Props) {
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
    </Box>
  );
}
