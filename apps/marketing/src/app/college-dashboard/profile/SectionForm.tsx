'use client';

import { useMemo, useState } from 'react';
import { Alert, Box, Button, Stack } from '@mui/material';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import type { SectionDef } from '@/lib/college-dashboard/content-sections';
import SectionFields, { fromForm, startValues, type SectionValues } from '@/components/college-content/SectionFields';
import { formatDay } from '../ui';

export interface SectionState {
  live: Record<string, unknown>;
  pending: { payload: Record<string, unknown>; submitted_at: string; submitted_by_name: string | null } | null;
  last_decision: { status: 'approved' | 'rejected'; review_note: string | null; reviewed_at: string | null } | null;
  approved_at: string | null;
}

type Values = SectionValues;

interface Props {
  def: SectionDef;
  state: SectionState;
  readOnly: boolean;
  upload: (file: File) => Promise<{ url: string }>;
  onSubmit: (values: Values) => Promise<{ ok: boolean; error?: string; fields?: Record<string, string> }>;
  onWithdraw: () => Promise<void>;
  /** Success note kept by the page across the reload that follows a send. */
  notice?: string | null;
}

export default function SectionForm({ def, state, readOnly, upload, onSubmit, onWithdraw, notice }: Props) {
  const start = useMemo(() => startValues(def, state.live, state.pending?.payload), [def, state]);
  const [values, setValues] = useState<Values>(start);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const change = (patch: Values) => {
    setValues((cur) => ({ ...cur, ...patch }));
    setErrors((cur) => ({ ...cur, ...Object.fromEntries(Object.keys(patch).map((k) => [k, ''])) }));
    setMessage(null);
  };

  const dirty = JSON.stringify(values) !== JSON.stringify(start);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await onSubmit(fromForm(def, values));
    setBusy(false);
    if (!res.ok) {
      setErrors(res.fields ?? {});
      setMessage({ tone: 'error', text: res.error ?? 'Could not send. Please try again.' });
    }
  };

  return (
    <Box component="form" noValidate onSubmit={submit}>
      {state.pending && (
        <Alert
          severity="warning"
          icon={<HourglassTopIcon />}
          sx={{ mb: 2 }}
          action={
            !readOnly && (
              <Button color="inherit" onClick={() => void onWithdraw()} sx={{ minHeight: 40, textTransform: 'none' }}>
                Withdraw
              </Button>
            )
          }
        >
          Sent for review on {formatDay(state.pending.submitted_at)}
          {state.pending.submitted_by_name ? ` by ${state.pending.submitted_by_name}` : ''}. The form shows what you sent. Sending again replaces it.
        </Alert>
      )}
      {!state.pending && state.last_decision?.status === 'rejected' && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Your last change was not approved{state.last_decision.review_note ? `: ${state.last_decision.review_note}` : '.'} Fix it below and send again.
        </Alert>
      )}

      <SectionFields def={def} values={values} errors={errors} onChange={change} disabled={busy} readOnly={readOnly} upload={upload} />

      {notice && !message && !dirty && (
        <Alert severity="success" sx={{ mt: 2 }} role="status">
          {notice}
        </Alert>
      )}
      {message && (
        <Alert severity={message.tone} sx={{ mt: 2 }} role={message.tone === 'error' ? 'alert' : 'status'}>
          {message.text}
        </Alert>
      )}

      {!readOnly && (
        <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ mt: 2 }}>
          {dirty && (
            <Button onClick={() => { setValues(start); setErrors({}); setMessage(null); }} disabled={busy} sx={{ minHeight: 44 }}>
              Undo changes
            </Button>
          )}
          <Button type="submit" variant="contained" disabled={busy || !dirty} sx={{ minHeight: 44, fontWeight: 700 }}>
            {busy ? 'Sending' : 'Send for review'}
          </Button>
        </Stack>
      )}
    </Box>
  );
}
