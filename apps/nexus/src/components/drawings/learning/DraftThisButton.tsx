'use client';

/**
 * "Draft this": ask the model for a draft of one drawing.
 *
 * It asks the estimate endpoint first, which spends nothing, and shows its
 * answer as it stands. While evaluation is switched off, or the brief has no
 * wording or reference sheets yet, the button stays disabled with the reason
 * in words. Only when a draft is genuinely allowed does it enable, and even
 * then it confirms the estimated cost before anything is spent, because this
 * is the one control on the review screen that costs money.
 */

import { useEffect, useRef, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@neram/ui';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';

interface Estimate {
  allowed: boolean;
  ready: boolean;
  message?: string | null;
  reason?: string | null;
  costInr?: number | null;
  seconds?: number;
}

interface Props {
  submissionId: string;
  getToken: () => Promise<string | null>;
  onDrafted: () => void;
}

function whyNot(e: Estimate): string {
  if (!e.ready) return 'Drafts need this brief tagged, with its band wording written and five reference sheets set.';
  return e.message || 'AI drafting is switched off.';
}

export default function DraftThisButton({ submissionId, getToken, onDrafted }: Props) {
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await tokenRef.current();
        const res = await fetch(`/api/drawing/evaluations/estimate?submission_id=${submissionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        if (!cancelled) setEstimate(body);
      } catch {
        if (!cancelled) setEstimate({ allowed: false, ready: false, message: 'AI drafting is not available here.' });
      }
    })();
    return () => { cancelled = true; };
  }, [submissionId]);

  const draft = async () => {
    setBusy(true);
    setError(null);
    try {
      const token = await tokenRef.current();
      const res = await fetch('/api/drawing/evaluations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: submissionId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'The draft did not come back');
      setConfirming(false);
      onDrafted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The draft did not come back');
    } finally {
      setBusy(false);
    }
  };

  if (!estimate) return null;
  const enabled = estimate.allowed && estimate.ready;

  return (
    <Box sx={{ mb: 1 }} data-testid="draft-this">
      <Button
        size="small"
        variant="outlined"
        startIcon={<AutoAwesomeOutlinedIcon sx={{ fontSize: 18 }} />}
        disabled={!enabled}
        onClick={() => setConfirming(true)}
        sx={{ minHeight: 40, textTransform: 'none' }}
      >
        Draft this
      </Button>
      {!enabled && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, lineHeight: 1.4 }}>
          {whyNot(estimate)}
        </Typography>
      )}

      <Dialog open={confirming} onClose={() => !busy && setConfirming(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Draft this drawing?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            The model scores it against this brief&apos;s five reference sheets.
            {estimate.costInr != null ? ` About ₹${estimate.costInr.toFixed(2)},` : ''}
            {estimate.seconds ? ` roughly ${estimate.seconds} seconds.` : ''} Nothing reaches the student: the draft only fills in this screen.
          </Typography>
          {error && <Typography variant="body2" color="error" role="alert" sx={{ mt: 1 }}>{error}</Typography>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)} disabled={busy} sx={{ minHeight: 44 }}>Cancel</Button>
          <Button variant="contained" onClick={draft} disabled={busy} sx={{ minHeight: 44 }}>
            {busy ? 'Drafting' : 'Draft it'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
