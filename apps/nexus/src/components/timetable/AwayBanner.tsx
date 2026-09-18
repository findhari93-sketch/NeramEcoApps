'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, CircularProgress, Typography } from '@neram/ui';
import { useAuthSWR } from '@/lib/nexus-swr';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { covers, type AwayWindow } from '@/lib/away-windows';

interface AwayResponse {
  today: string;
  windows: Array<AwayWindow & { summary: string }>;
}

/**
 * "You are marked away until 20 Oct", with one tap to undo it.
 *
 * The reason this exists at all: a student can now declare a fortnight from the
 * decline sheet, and a declaration you cannot see or take back is a trap. It
 * would be quietly explaining every absence for weeks after they came back, and
 * the student would have no way of knowing, which is worse than never having
 * offered the feature.
 *
 * Renders nothing at all when no window covers today, so it costs a mounted
 * component and one cached request on every other day of the year.
 */
export default function AwayBanner({ onChanged }: { onChanged?: () => void }) {
  const { tokenReady } = useNexusAuthContext();
  const [ending, setEnding] = useState(false);
  const { data, mutate } = useAuthSWR<AwayResponse>(
    tokenReady ? '/api/student/away-windows' : null,
  );

  const active = data?.windows?.find((w) => covers(w, data.today));
  if (!active) return null;

  const endIt = async () => {
    setEnding(true);
    try {
      const res = await fetch(`/api/student/away-windows/${active.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      if (res.ok) {
        await mutate();
        onChanged?.();
      }
    } finally {
      setEnding(false);
    }
  };

  return (
    <Alert
      severity="info"
      // Never `error` or `warning`. Telling us in advance is the thing we want
      // students to do, and colouring it as a problem would tell them off for it.
      icon={false}
      sx={{ borderRadius: 2, mb: 2, alignItems: 'center' }}
      action={
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button
            onClick={endIt}
            disabled={ending}
            size="small"
            variant="outlined"
            sx={{ textTransform: 'none', minHeight: 44, fontWeight: 700, whiteSpace: 'nowrap' }}
            startIcon={ending ? <CircularProgress size={14} color="inherit" /> : undefined}
          >
            {ending ? 'Saving' : 'I am back'}
          </Button>
          <Button
            component={Link}
            href="/student/planned-absence"
            size="small"
            sx={{ textTransform: 'none', minHeight: 44, fontWeight: 700, whiteSpace: 'nowrap' }}
          >
            Change
          </Button>
        </Box>
      }
    >
      <Typography sx={{ fontWeight: 700, fontSize: '0.875rem' }}>{active.summary}</Typography>
      <Typography variant="caption" color="text.secondary">
        Your teacher can see this, and these classes will not count as unexplained.
      </Typography>
    </Alert>
  );
}
