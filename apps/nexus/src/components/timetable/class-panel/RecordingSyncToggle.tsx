'use client';

import { useEffect, useState } from 'react';
import { Box, Switch, Typography } from '@neram/ui';
import { SECTION_LABEL_SX } from '../timetable-theme';
import type { ClassCardData } from '../ClassCard';

interface RecordingSyncToggleProps {
  cls: ClassCardData;
  getToken: () => Promise<string | null>;
  onNotify: (message: string, severity?: 'success' | 'error' | 'warning') => void;
  onChanged?: () => void;
}

/**
 * Whether the recording attaches itself after the class, or the teacher will.
 *
 * Owns its own state and its own PATCH because it is the only writable field
 * left on a future class that is not a whole dialog. Was rail-only, so a
 * teacher working in Month could not reach it at all.
 */
export default function RecordingSyncToggle({
  cls,
  getToken,
  onNotify,
  onChanged,
}: RecordingSyncToggleProps) {
  const [autoSync, setAutoSync] = useState(true);

  useEffect(() => {
    setAutoSync((cls as unknown as { auto_sync_recording?: boolean }).auto_sync_recording !== false);
  }, [cls]);

  const toggle = async (next: boolean) => {
    setAutoSync(next); // optimistic: the switch should not lag the tap
    try {
      const token = await getToken();
      const res = await fetch('/api/timetable', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: cls.id,
          classroom_id: cls.classroom?.id,
          auto_sync_recording: next,
        }),
      });
      if (!res.ok) {
        setAutoSync(!next);
        onNotify('Could not change the recording setting', 'error');
      } else {
        onChanged?.();
      }
    } catch {
      setAutoSync(!next);
      onNotify('Could not change the recording setting', 'error');
    }
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
      <Box>
        <Typography sx={SECTION_LABEL_SX}>Recording</Typography>
        <Typography variant="caption" color="text.secondary">
          {autoSync ? 'Auto-sync after class' : 'Attach it yourself later'}
        </Typography>
      </Box>
      <Switch
        checked={autoSync}
        onChange={(e) => toggle(e.target.checked)}
        inputProps={{ 'aria-label': 'Auto-sync the recording after class' }}
      />
    </Box>
  );
}
