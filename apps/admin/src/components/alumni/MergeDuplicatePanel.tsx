'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  AlertTitle,
  CircularProgress,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
} from '@neram/ui';
import useMediaQuery from '@mui/material/useMediaQuery';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import { SectionCard } from './uiPrimitives';
import { ACCENT, INK, MUTED, LINE } from './theme';

interface MergeDuplicatePanelProps {
  userId: string;
  adminId: string | null;
  /** Called after a successful merge so the parent can re-fetch (the loser id is gone). */
  onMerged?: () => void;
}

/** One labelled value in the compare grid. */
function Cell({ label, value, strong }: { label: string; value: any; strong?: boolean }) {
  return (
    <Box sx={{ mb: 0.75 }}>
      <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, color: MUTED }}>{label}</Typography>
      <Typography variant="caption" sx={{ color: INK, fontWeight: strong ? 700 : 400, wordBreak: 'break-word' }}>
        {value || <span style={{ color: '#94A3B8' }}>—</span>}
      </Typography>
    </Box>
  );
}

/**
 * Shows up only when a duplicate record is detected for this user, and offers a
 * reviewed merge (keeps the @neramclasses.com identity, folds the Gmail into
 * personal_email, repoints every reference, hard-deletes the leftover row).
 */
export default function MergeDuplicatePanel({ userId, adminId, onMerged }: MergeDuplicatePanelProps) {
  const fullScreen = useMediaQuery('(max-width:599px)');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [merging, setMerging] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/alumni/${userId}/duplicate`, { cache: 'no-store' });
      setData(await res.json());
    } catch {
      setData({ hasDuplicate: false });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !data?.hasDuplicate) return null;

  const { preview, winnerId, loserId } = data;
  const { winner, loser, afterMerge, warnings, referenceCounts } = preview;
  const blocked = warnings?.some((w: string) => w.toLowerCase().includes('refused'));

  const runMerge = async () => {
    if (!adminId) {
      setError('Admin session not ready, try again in a moment.');
      return;
    }
    setMerging(true);
    setError('');
    try {
      const res = await fetch(`/api/crm/alumni/${userId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId, loserId }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || 'Merge failed');
      setResult(out);
      onMerged?.();
    } catch (e: any) {
      setError(e?.message || 'Merge failed');
    } finally {
      setMerging(false);
    }
  };

  return (
    <SectionCard
      title="Possible duplicate"
      action={
        <Button
          size="small"
          variant="outlined"
          color="warning"
          startIcon={<MergeTypeIcon sx={{ fontSize: 18 }} />}
          onClick={() => {
            setResult(null);
            setError('');
            setOpen(true);
          }}
          sx={{ textTransform: 'none', borderRadius: 1.5 }}
        >
          Review & merge
        </Button>
      }
    >
      <Typography variant="body2" sx={{ color: MUTED }}>
        This student has a second record (their personal {loser?.email?.includes('@') ? 'email' : ''} account holds the
        Microsoft link). Merge them into one, keeping the <strong>@neramclasses.com</strong> identity.
      </Typography>

      <Dialog open={open} onClose={() => !merging && setOpen(false)} maxWidth="sm" fullWidth fullScreen={fullScreen}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <MergeTypeIcon sx={{ color: ACCENT }} />
          <Box>
            <Typography variant="h6" fontWeight={700}>
              Merge duplicate records
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Keeps one record. The other is permanently deleted after its data moves over.
            </Typography>
          </Box>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          {result ? (
            <Alert severity="success">
              <AlertTitle>Merged</AlertTitle>
              The records were merged into one. {result.summary?.length || 0} table(s) repointed. The duplicate row was
              deleted.
            </Alert>
          ) : (
            <>
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}
              {warnings?.map((w: string, i: number) => (
                <Alert key={i} severity={w.toLowerCase().includes('refused') ? 'error' : 'warning'} sx={{ mb: 1 }}>
                  {w}
                </Alert>
              ))}

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.5, mt: 1 }}>
                <Box sx={{ border: '1px solid', borderColor: LINE, borderRadius: 1, p: 1 }}>
                  <Chip label="KEEP" size="small" color="success" sx={{ height: 18, fontSize: 9, mb: 0.5 }} />
                  <Cell label="EMAIL" value={winner.email} strong />
                  <Cell label="MS OID" value={winner.ms_oid} />
                  <Cell label="FIREBASE" value={winner.firebase_uid} />
                  <Cell label="PHONE" value={winner.phone} />
                </Box>
                <Box sx={{ border: '1px solid', borderColor: LINE, borderRadius: 1, p: 1, opacity: 0.7 }}>
                  <Chip label="DELETE" size="small" color="default" sx={{ height: 18, fontSize: 9, mb: 0.5 }} />
                  <Cell label="EMAIL" value={loser.email} />
                  <Cell label="MS OID" value={loser.ms_oid} />
                  <Cell label="FIREBASE" value={loser.firebase_uid} />
                  <Cell label="PHONE" value={loser.phone} />
                </Box>
                <Box sx={{ border: '1px solid', borderColor: ACCENT, borderRadius: 1, p: 1, bgcolor: 'rgba(180,83,9,0.05)' }}>
                  <Chip label="AFTER" size="small" color="warning" sx={{ height: 18, fontSize: 9, mb: 0.5 }} />
                  <Cell label="EMAIL" value={afterMerge.email} strong />
                  <Cell label="PERSONAL" value={afterMerge.personal_email} />
                  <Cell label="MS OID" value={afterMerge.ms_oid} />
                  <Cell label="PHONE" value={afterMerge.phone} />
                </Box>
              </Box>

              {referenceCounts?.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: MUTED }}>
                    DATA THAT WILL MOVE
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', color: MUTED, wordBreak: 'break-word' }}>
                    {referenceCounts.map((r: any) => `${r.rows} ${r.table}`).join(' · ')}
                  </Typography>
                </Box>
              )}
            </>
          )}
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2, gap: 1 }}>
          {result ? (
            <Button variant="contained" onClick={() => setOpen(false)} sx={{ textTransform: 'none' }}>
              Close
            </Button>
          ) : (
            <>
              <Button onClick={() => setOpen(false)} disabled={merging} sx={{ textTransform: 'none' }}>
                Cancel
              </Button>
              <Button
                variant="contained"
                color="warning"
                onClick={runMerge}
                disabled={merging || blocked}
                startIcon={merging ? <CircularProgress size={16} color="inherit" /> : <MergeTypeIcon sx={{ fontSize: 18 }} />}
                sx={{ textTransform: 'none', minWidth: 160 }}
              >
                {merging ? 'Merging...' : 'Merge records'}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </SectionCard>
  );
}
