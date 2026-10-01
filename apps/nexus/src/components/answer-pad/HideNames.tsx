'use client';

/**
 * Names on the teacher's console are for the teacher. A teacher who shares the
 * whole screen instead of one window would show them to the class, so every
 * list of names has an eye to hide them, remembered on this device.
 */

import { useCallback, useEffect, useState } from 'react';
import { IconButton, Tooltip } from '@neram/ui';
import VisibilityOffRounded from '@mui/icons-material/VisibilityOffRounded';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';

const KEY = 'pad-hide-names';
const EVENT = 'pad-hide-names-change';

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** One setting for every list on the console: hiding one hides them all. */
export function useHideNames(): [boolean, (hidden: boolean) => void] {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    setHidden(read());
    const sync = () => setHidden(read());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  const update = useCallback((next: boolean) => {
    setHidden(next);
    try {
      localStorage.setItem(KEY, next ? '1' : '0');
    } catch {
      // Blocked storage: the choice lasts for this visit.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [hidden, update];
}

export function HideNamesButton({ hidden, onChange }: { hidden: boolean; onChange: (hidden: boolean) => void }) {
  const label = hidden ? 'Show names' : 'Hide names, for sharing your whole screen';
  return (
    <Tooltip title={label}>
      <IconButton aria-label={hidden ? 'Show names' : 'Hide names'} aria-pressed={hidden} onClick={() => onChange(!hidden)} sx={{ width: 44, height: 44, flexShrink: 0 }}>
        {hidden ? <VisibilityOffRounded fontSize="small" /> : <VisibilityRounded fontSize="small" />}
      </IconButton>
    </Tooltip>
  );
}
