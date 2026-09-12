'use client';

import { useMemo, useState } from 'react';
import {
  Box, Fab, IconButton, Menu, MenuItem, ListItemIcon, ListItemText, Switch, Typography, useMediaQuery, useTheme,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import RhythmCard from './RhythmCard';
import SketchGrid, { type GridSketch } from './SketchGrid';
import ThenAndNowCard from './ThenAndNowCard';
import type { SketchbookPayload } from '@/lib/sketchbook-payload';
import { istDate, weekStart, daysBetween } from '@/lib/sketchbook-rhythm';

interface SketchbookViewProps {
  payload: SketchbookPayload | null;
  loading: boolean;
  mode: 'own' | 'teacher';
  hrefFor: (s: GridSketch) => string;
  month: string;
  onMonthChange: (month: string) => void;
  onAdd?: () => void;
  onOptOutChange?: (optOut: boolean) => Promise<void>;
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The sketchbook home, shared by the student's own page and the teacher's peek. */
export default function SketchbookView({
  payload, loading, mode, hrefFor, month, onMonthChange, onAdd, onOptOutChange,
}: SketchbookViewProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [menuEl, setMenuEl] = useState<null | HTMLElement>(null);
  const [savingOptOut, setSavingOptOut] = useState(false);

  const todayIndex = useMemo(() => {
    const today = istDate(new Date());
    return daysBetween(weekStart(today), today);
  }, []);

  const thisMonth = istDate(new Date()).slice(0, 7);
  const canGoNewer = month < thisMonth;

  return (
    <Box>
      <RhythmCard rhythm={payload?.rhythm ?? null} loading={loading} todayIndex={todayIndex} />
      {payload?.thenAndNow && <ThenAndNowCard first={payload.thenAndNow.first} latest={payload.thenAndNow.latest} />}

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, minHeight: 48 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton aria-label="Older month" onClick={() => onMonthChange(shiftMonth(month, -1))} sx={{ width: 48, height: 48 }}>
            <Box component="span" aria-hidden sx={{ fontSize: 20 }}>{'‹'}</Box>
          </IconButton>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {monthLabel(month)}
            {payload && !loading && (
              <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                {payload.sketches.length} {payload.sketches.length === 1 ? 'sketch' : 'sketches'}, {payload.practiceDaysThisMonth} practice {payload.practiceDaysThisMonth === 1 ? 'day' : 'days'}
              </Typography>
            )}
          </Typography>
          <IconButton aria-label="Newer month" disabled={!canGoNewer} onClick={() => onMonthChange(shiftMonth(month, 1))} sx={{ width: 48, height: 48 }}>
            <Box component="span" aria-hidden sx={{ fontSize: 20 }}>{'›'}</Box>
          </IconButton>
        </Box>
        {mode === 'own' && onOptOutChange && (
          <>
            <IconButton aria-label="Sketchbook options" onClick={(e) => setMenuEl(e.currentTarget)} sx={{ width: 48, height: 48 }}>
              <MoreVertIcon />
            </IconButton>
            <Menu anchorEl={menuEl} open={!!menuEl} onClose={() => setMenuEl(null)}>
              <MenuItem
                disabled={savingOptOut || !payload}
                onClick={async () => {
                  if (!payload) return;
                  setSavingOptOut(true);
                  try { await onOptOutChange(!payload.featureOptOut); } finally { setSavingOptOut(false); }
                }}
                sx={{ minHeight: 48 }}
              >
                <ListItemIcon><VisibilityOffOutlinedIcon /></ListItemIcon>
                <ListItemText primary="Do not feature my sketches" secondary="Teachers can still see them." />
                <Switch edge="end" checked={!!payload?.featureOptOut} inputProps={{ 'aria-label': 'Do not feature my sketches' }} />
              </MenuItem>
            </Menu>
          </>
        )}
      </Box>

      <SketchGrid
        sketches={payload?.sketches ?? []}
        hrefFor={hrefFor}
        loading={loading}
        emptyTitle={mode === 'own' ? 'Your sketchbook is empty' : 'No sketches this month'}
        emptyDescription={mode === 'own' ? 'Draw anything for ten minutes and add it here. Small sketches count.' : 'Try an older month, or check back after the next class.'}
      />

      {mode === 'own' && onAdd && (
        <Fab
          color="primary"
          variant={isDesktop ? 'extended' : 'circular'}
          aria-label="Add a sketch"
          onClick={onAdd}
          sx={{ position: 'fixed', right: 16, bottom: { xs: 'calc(72px + env(safe-area-inset-bottom))', md: 24 }, minWidth: 56, minHeight: 56 }}
        >
          <AddIcon sx={{ mr: isDesktop ? 1 : 0 }} />
          {isDesktop ? 'Add a sketch' : null}
        </Fab>
      )}
    </Box>
  );
}
