'use client';

import { useEffect, useState } from 'react';
import { Box, Button, Drawer, ToggleButton, ToggleButtonGroup, Typography, Alert } from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { setWeeklyGoal } from './sketchbook-api';

interface WeeklyGoalSheetProps {
  open: boolean;
  onClose: () => void;
  classroomId: string;
  goal: number;
  onSaved: (goal: number) => void;
}

export default function WeeklyGoalSheet({ open, onClose, classroomId, goal, onSaved }: WeeklyGoalSheetProps) {
  const { getToken } = useNexusAuthContext();
  const [value, setValue] = useState(goal);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setValue(goal); setError(''); } }, [open, goal]);

  return (
    <Drawer anchor="bottom" open={open} onClose={busy ? undefined : onClose}
      PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, p: 2, pb: 'calc(16px + env(safe-area-inset-bottom))' } }}>
      <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mb: 2 }} aria-hidden />
      <Typography variant="h6">Weekly goal</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Practice days a week for this class. Applies from this week. Past weeks keep their goal.
      </Typography>
      <ToggleButtonGroup exclusive value={value} onChange={(_, v) => { if (v) setValue(v); }} aria-label="Practice days a week" fullWidth sx={{ mb: 2 }}>
        {[1, 2, 3, 4, 5, 6, 7].map((n) => <ToggleButton key={n} value={n} sx={{ minHeight: 48 }} aria-label={`${n} days`}>{n}</ToggleButton>)}
      </ToggleButtonGroup>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Button onClick={onClose} disabled={busy} sx={{ minHeight: 48 }}>Cancel</Button>
        <Button variant="contained" disabled={busy || value === goal} sx={{ minHeight: 48 }}
          onClick={async () => {
            setBusy(true); setError('');
            try { const r = await setWeeklyGoal(getToken, classroomId, value); onSaved(r.goal); onClose(); }
            catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); } finally { setBusy(false); }
          }}>
          {busy ? 'Saving...' : 'Save'}
        </Button>
      </Box>
    </Drawer>
  );
}
