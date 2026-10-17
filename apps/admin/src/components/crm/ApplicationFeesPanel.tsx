'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from '@neram/ui';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import SendIcon from '@mui/icons-material/Send';
import EditIcon from '@mui/icons-material/Edit';
import AddCardIcon from '@mui/icons-material/AddCard';
import ApplicationAndFeesDialog, { type PrefillPaymentLine } from '@/components/students/ApplicationAndFeesDialog';
import FeeReportReviewDialog, { type FeeReport } from '@/components/students/FeeReportReviewDialog';
import { checkStatusColor, checkStatusLabel } from '@/components/students/fee-labels';

interface ApplicationFeesPanelProps {
  userId: string;
  studentName?: string | null;
  /** 'empty': the student has no application yet. */
  variant: 'empty' | 'full';
  /** lead_profiles.final_fee is set on the application shown. */
  hasFee: boolean;
  onChanged: () => void;
  /** The older details-only form, kept for leads who have no fee yet. */
  onDetailsOnly?: () => void;
}

interface PanelState {
  latestCheck: { status: string } | null;
  openReport: (FeeReport & { created_at?: string }) | null;
  hasFee: boolean;
}

/**
 * The fee side of the CRM Application section: open the Application and fees
 * form, send it to the student to check, and review a fee report from them.
 * `?open=fees` (from Nexus) opens the form once on arrival.
 */
export default function ApplicationFeesPanel({
  userId,
  studentName,
  variant,
  hasFee,
  onChanged,
  onDetailsOnly,
}: ApplicationFeesPanelProps) {
  const searchParams = useSearchParams();
  const autoOpened = useRef(false);
  // The CRM page reloads (and this panel may remount) when told something
  // changed, so that waits until the form closes and staff have read the result.
  const savedWhileOpen = useRef(false);
  const [state, setState] = useState<PanelState | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [prefill, setPrefill] = useState<PrefillPaymentLine[] | undefined>(undefined);
  const [resolvesId, setResolvesId] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ text: string; severity: 'success' | 'info' | 'error' } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/students/application-fees?userId=${encodeURIComponent(userId)}`);
      if (!res.ok) return;
      const body = await res.json();
      setState({
        latestCheck: body.latestCheck,
        openReport: body.openReport
          ? { id: body.openReport.id, items: body.openReport.items || [], note: body.openReport.note, createdAt: body.openReport.created_at }
          : null,
        hasFee: Boolean(body.fees?.hasFee),
      });
    } catch {
      // The panel still offers the form; only the status line is missing.
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (autoOpened.current) return;
    if (searchParams.get('open') === 'fees') {
      autoOpened.current = true;
      setDialogOpen(true);
    }
  }, [searchParams]);

  const feeKnown = state ? state.hasFee : hasFee;

  const openForm = (lines?: PrefillPaymentLine[], reportId?: string | null) => {
    setPrefill(lines);
    setResolvesId(reportId ?? null);
    setDialogOpen(true);
  };

  const sendCheck = async () => {
    setSending(true);
    setNotice(null);
    try {
      const res = await fetch('/api/students/record-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not send.');
      setNotice({ text: body.message, severity: body.delivered ? 'success' : 'info' });
      await load();
    } catch (e: any) {
      setNotice({ text: e?.message || 'Could not send.', severity: 'error' });
    } finally {
      setSending(false);
    }
  };

  const dialogs = (
    <>
      <ApplicationAndFeesDialog
        userId={userId}
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setPrefill(undefined);
          setResolvesId(null);
          if (savedWhileOpen.current) {
            savedWhileOpen.current = false;
            onChanged();
          }
        }}
        onSaved={() => {
          savedWhileOpen.current = true;
          void load();
        }}
        prefillPaymentLines={prefill}
        resolvesCorrectionId={resolvesId}
      />
      <FeeReportReviewDialog
        open={reviewOpen}
        report={state?.openReport ?? null}
        studentName={studentName}
        onClose={() => setReviewOpen(false)}
        onAccept={(lines, reportId) => {
          setReviewOpen(false);
          openForm(lines, reportId);
        }}
        onRejected={(message) => {
          setReviewOpen(false);
          setNotice({ text: message, severity: 'success' });
          void load();
        }}
      />
    </>
  );

  if (variant === 'empty') {
    return (
      <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
        <Button
          variant="contained"
          startIcon={<AddCardIcon />}
          onClick={() => openForm()}
          sx={{ textTransform: 'none', fontWeight: 600, boxShadow: 'none', minHeight: 44, px: 3 }}
        >
          Fill in form and fees
        </Button>
        {onDetailsOnly && (
          <Button size="small" onClick={onDetailsOnly} sx={{ textTransform: 'none', minHeight: 36 }}>
            Details only, no fees yet
          </Button>
        )}
        {dialogs}
      </Box>
    );
  }

  return (
    <Box sx={{ px: 1.5, pb: 1 }}>
      {state?.openReport && (
        <Alert
          severity="warning"
          sx={{ mb: 1.5, borderRadius: 0.75 }}
          action={
            <Button color="inherit" size="small" onClick={() => setReviewOpen(true)} sx={{ fontWeight: 700, minHeight: 36 }}>
              Review
            </Button>
          }
        >
          The student says their fees are wrong.
        </Alert>
      )}
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Button
          variant={feeKnown ? 'outlined' : 'contained'}
          size="small"
          startIcon={feeKnown ? <EditIcon sx={{ fontSize: 16 }} /> : <AddCardIcon sx={{ fontSize: 16 }} />}
          onClick={() => openForm()}
          sx={{ textTransform: 'none', fontWeight: 600, minHeight: 36, boxShadow: 'none' }}
        >
          {feeKnown ? 'Edit fees' : 'Add fee details'}
        </Button>
        {!feeKnown && (
          <Chip
            icon={<WarningAmberIcon />}
            label="No fee set"
            color="warning"
            variant="outlined"
            size="small"
            sx={{ fontWeight: 600 }}
          />
        )}
        {feeKnown && (
          <Button
            size="small"
            startIcon={sending ? <CircularProgress size={14} color="inherit" /> : <SendIcon sx={{ fontSize: 16 }} />}
            onClick={sendCheck}
            disabled={sending}
            sx={{ textTransform: 'none', fontWeight: 600, minHeight: 36 }}
          >
            {state?.latestCheck ? 'Send to student to check again' : 'Send to student to check'}
          </Button>
        )}
        {state && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, ml: { md: 'auto' } }}>
            <Typography variant="caption" color="text.secondary">
              Student check:
            </Typography>
            <Chip
              size="small"
              label={checkStatusLabel(state.latestCheck?.status)}
              color={checkStatusColor(state.latestCheck?.status)}
              variant="outlined"
              sx={{ fontWeight: 600 }}
            />
          </Box>
        )}
      </Stack>
      {notice && (
        <Alert severity={notice.severity} sx={{ mt: 1.5, borderRadius: 0.75 }} onClose={() => setNotice(null)}>
          {notice.text}
        </Alert>
      )}
      {dialogs}
    </Box>
  );
}
