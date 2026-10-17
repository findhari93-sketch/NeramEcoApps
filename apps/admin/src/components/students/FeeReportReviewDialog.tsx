'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  TextField,
  Typography,
} from '@neram/ui';
import { formatDueDate, formatRupees, paymentMethodLabel } from '@neram/database/fee-plan';
import type { PrefillPaymentLine } from './ApplicationAndFeesDialog';

export interface FeeReport {
  id: string;
  items: { amount: number; paidOn: string; method: string; reference?: string | null }[];
  note: string;
  createdAt?: string | null;
}

interface FeeReportReviewDialogProps {
  open: boolean;
  report: FeeReport | null;
  studentName?: string | null;
  onClose: () => void;
  /** "Accept and update fees": open the form with these lines and the report id. */
  onAccept: (lines: PrefillPaymentLine[], reportId: string) => void;
  /** After a reject is saved. */
  onRejected: (message: string) => void;
}

/**
 * A student's "Something is wrong" with their fees: what they say they paid and
 * why. Accepting opens the Application and fees form with their payments filled
 * in (money is written by one writer). Rejecting needs a note the student reads.
 */
export default function FeeReportReviewDialog({ open, report, studentName, onClose, onAccept, onRejected }: FeeReportReviewDialogProps) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [noteTouched, setNoteTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setRejecting(false);
    setNote('');
    setNoteTouched(false);
    setError('');
  }, [open, report?.id]);

  const noteError = noteTouched && !note.trim() ? 'Tell the student why.' : '';

  const reject = async () => {
    if (!report) return;
    setNoteTouched(true);
    if (!note.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/students/record-check/corrections/${report.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', note: note.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not save.');
      onRejected(body.message || 'Rejected.');
    } catch (e: any) {
      setError(e?.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 1.5 } }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: 18, pb: 1 }}>
        Fee report{studentName ? ` from ${studentName}` : ''}
      </DialogTitle>
      <DialogContent>
        {report ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {report.createdAt && (
              <Typography variant="caption" color="text.secondary">
                Sent on {formatDueDate(report.createdAt.slice(0, 10))}
              </Typography>
            )}
            <Box>
              <Typography variant="body2" fontWeight={600} gutterBottom>
                What they say
              </Typography>
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1, whiteSpace: 'pre-wrap', fontSize: 14 }}>
                {report.note}
              </Paper>
            </Box>
            <Box>
              <Typography variant="body2" fontWeight={600} gutterBottom>
                What they say they paid
              </Typography>
              {report.items.length ? (
                <Paper variant="outlined" sx={{ borderRadius: 1 }}>
                  {report.items.map((item, i) => (
                    <Box
                      key={i}
                      sx={{ display: 'flex', gap: 2, px: 1.5, py: 1, borderTop: i ? '1px solid' : 'none', borderColor: 'grey.100', fontSize: 14 }}
                    >
                      <Box sx={{ minWidth: 100 }}>{formatDueDate(item.paidOn)}</Box>
                      <Box sx={{ minWidth: 90, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatRupees(item.amount)}</Box>
                      <Box sx={{ flex: 1 }}>{paymentMethodLabel(item.method)}</Box>
                      {item.reference && <Box sx={{ color: 'text.secondary' }}>Ref {item.reference}</Box>}
                    </Box>
                  ))}
                </Paper>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No payments listed. The problem is in the note.
                </Typography>
              )}
            </Box>
            {rejecting && (
              <TextField
                label="Why are you rejecting it?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onBlur={() => setNoteTouched(true)}
                error={Boolean(noteError)}
                helperText={noteError || 'The student reads this on their Check your details page.'}
                multiline
                minRows={3}
                fullWidth
                required
                autoFocus
                inputProps={{ maxLength: 1000 }}
              />
            )}
            {error && <Alert severity="error">{error}</Alert>}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            This report is no longer open.
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: 'none', minHeight: 44 }}>
          Cancel
        </Button>
        {report && !rejecting && (
          <Button color="error" variant="outlined" onClick={() => setRejecting(true)} sx={{ textTransform: 'none', fontWeight: 600, minHeight: 44 }}>
            Reject
          </Button>
        )}
        {report && rejecting && (
          <Button
            color="error"
            variant="contained"
            onClick={reject}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ textTransform: 'none', fontWeight: 600, minHeight: 44, boxShadow: 'none' }}
          >
            {saving ? 'Rejecting' : 'Reject and tell the student'}
          </Button>
        )}
        {report && !rejecting && (
          <Button
            variant="contained"
            onClick={() =>
              onAccept(
                report.items.map((i) => ({ amount: i.amount, paidOn: i.paidOn, method: i.method, reference: i.reference ?? null })),
                report.id,
              )
            }
            sx={{ textTransform: 'none', fontWeight: 600, minHeight: 44, boxShadow: 'none' }}
          >
            Accept and update fees
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
