'use client';

import { useState } from 'react';
import { Box, Link, Typography } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

/**
 * Opens a payment screenshot from the private 'payment-proofs' bucket.
 *
 * The stored value is never a working link (the bucket is private), so a click
 * asks /api/payment-proof for a fresh 10-minute signed URL and opens it. The
 * tab is opened before the fetch so popup blockers leave it alone; the Admin
 * page itself never navigates.
 */
export default function ProofLink({ stored, label = 'View screenshot' }: { stored: string | null | undefined; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!stored) return null;

  const open = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    // 'noopener' in the features makes window.open return null, so it is set by hand.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    try {
      const res = await fetch(`/api/payment-proof?src=${encodeURIComponent(stored)}`, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.url) throw new Error(body?.error || 'Could not open the screenshot.');
      if (tab) tab.location.href = body.url;
      else throw new Error('Your browser blocked the new tab. Allow pop-ups for Admin and try again.');
    } catch (e: any) {
      tab?.close();
      setError(e?.message || 'Could not open the screenshot.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box component="span" sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <Link
        component="button"
        type="button"
        onClick={open}
        disabled={busy}
        underline="hover"
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minHeight: 36, px: 0.5, font: 'inherit', fontSize: 14, cursor: busy ? 'progress' : 'pointer' }}
      >
        {busy ? 'Opening…' : label} <OpenInNewIcon sx={{ fontSize: 16 }} aria-hidden />
      </Link>
      {error && (
        <Typography role="alert" variant="caption" color="error.main">
          {error}
        </Typography>
      )}
    </Box>
  );
}
