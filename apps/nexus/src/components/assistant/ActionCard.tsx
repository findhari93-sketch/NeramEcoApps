'use client';

import { useEffect, useState } from 'react';
import { Box, Button, Paper, Typography } from '@neram/ui';
import type { ActionProposal } from './client';

/** Minutes until expiry. An unreadable time counts as expired, so Confirm is never live on a card that says Expired. */
function minutesLeft(expiresAt: string): number {
  const at = Date.parse(expiresAt);
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, Math.ceil((at - Date.now()) / 60_000));
}

/** The one place a write is approved. Every field visible, three equal-weight buttons. */
export default function ActionCard({ action, busy, onConfirm, onEdit, onCancel }: {
  action: ActionProposal; busy: boolean; onConfirm: () => void; onEdit: () => void; onCancel: () => void;
}) {
  const [left, setLeft] = useState(() => minutesLeft(action.expiresAt));
  useEffect(() => {
    setLeft(minutesLeft(action.expiresAt));
    const t = setInterval(() => setLeft(minutesLeft(action.expiresAt)), 30_000);
    return () => clearInterval(t);
  }, [action.expiresAt]);
  return (
    <Paper elevation={0} role="group" aria-label="Confirm this action" sx={{ mx: 2, my: 1, p: 2, borderRadius: 3, border: (t) => `1px solid ${t.palette.divider}` }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>{action.summary}</Typography>
      <Box component="dl" sx={{ m: 0, mb: 1.5, display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 2, rowGap: 0.5 }}>
        {action.fields.map((f) => (
          <Box key={f.label} sx={{ display: 'contents' }}>
            <Typography component="dt" variant="body2" color="text.secondary">{f.label}</Typography>
            <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>{f.value}</Typography>
          </Box>
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        {left > 0 ? `Expires in ${left} min` : 'Expired. Ask me again and I will set it up fresh.'}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button variant="contained" onClick={onConfirm} disabled={busy || left === 0} sx={{ minHeight: 48, flex: 1, textTransform: 'none', fontWeight: 700 }}>Confirm</Button>
        <Button variant="text" onClick={onEdit} disabled={busy} sx={{ minHeight: 48, textTransform: 'none' }}>Edit</Button>
        <Button variant="outlined" onClick={onCancel} disabled={busy} sx={{ minHeight: 48, textTransform: 'none' }}>Cancel</Button>
      </Box>
    </Paper>
  );
}
