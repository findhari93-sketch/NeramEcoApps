'use client';

import { useCallback, useEffect, useState } from 'react';
import { Box, ToggleButton, ToggleButtonGroup } from '@neram/ui';
import GridViewIcon from '@mui/icons-material/GridViewOutlined';
import ViewListIcon from '@mui/icons-material/ViewListOutlined';

export type PracticeView = 'grid' | 'list';

const KEY = 'nexus.qb.practice-view';

/**
 * Grid or list, remembered on this device.
 *
 * Read in an effect, never in a useState initialiser: the server render has no
 * storage, and reading it during the first client render is a hydration
 * mismatch (#418/#423, PERF-0001). Storage can also throw (private windows,
 * blocked site data), so every access is guarded and the default stands.
 */
export function usePracticeView(defaultView: PracticeView): [PracticeView, (v: PracticeView) => void] {
  const [view, setView] = useState<PracticeView>(defaultView);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY);
      if (saved === 'grid' || saved === 'list') setView(saved);
    } catch {
      // Keep the default.
    }
  }, []);
  const choose = useCallback((v: PracticeView) => {
    setView(v);
    try {
      window.localStorage.setItem(KEY, v);
    } catch {
      // Remembering is a convenience; the choice still applies now.
    }
  }, []);
  return [view, choose];
}

interface ViewToggleProps {
  value: PracticeView;
  onChange: (v: PracticeView) => void;
}

export default function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <ToggleButtonGroup
      value={value}
      exclusive
      size="small"
      aria-label="Show questions as"
      onChange={(_e, v) => {
        if (v) onChange(v as PracticeView);
      }}
      sx={{
        '& .MuiToggleButton-root': {
          minHeight: 44,
          minWidth: 44,
          px: 1.25,
          gap: 0.5,
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '0.8125rem',
          '&.Mui-selected': { bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' } },
        },
      }}
    >
      {/* Words from sm up; on a phone the icons alone keep this on the chip row. */}
      <ToggleButton value="grid" aria-label="Number grid">
        <GridViewIcon aria-hidden sx={{ fontSize: 18 }} />
        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
          Grid
        </Box>
      </ToggleButton>
      <ToggleButton value="list" aria-label="List with previews">
        <ViewListIcon aria-hidden sx={{ fontSize: 18 }} />
        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
          List
        </Box>
      </ToggleButton>
    </ToggleButtonGroup>
  );
}
