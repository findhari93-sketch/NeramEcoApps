'use client';

/**
 * What a student who enrolled with a direct link sees before their class
 * account exists: where they are (payment sent, payment checked, account made,
 * their 5 steps) and what happens next. Never the older onboarding, which
 * carried last year's WhatsApp group.
 */
import { useState } from 'react';
import { Alert, Box, Button, Paper, Typography } from '@neram/ui';
import { alpha } from '@mui/material/styles';
import CheckIcon from '@mui/icons-material/Check';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import RefreshIcon from '@mui/icons-material/Refresh';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';

export interface ClassSetupPendingData {
  ready: false;
  firstName: string;
  pending: { stage: 'checking' | 'account'; email: string | null };
}

const HELP_NUMBER = '916380194614';

type RowState = 'done' | 'now' | 'later';

function Row({ state, title, note }: { state: RowState; title: string; note?: string }) {
  return (
    <Box component="li" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, py: 1 }}>
      <Box
        aria-hidden
        sx={{
          flexShrink: 0,
          width: 32,
          height: 32,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          bgcolor: (t) =>
            state === 'done' ? t.palette.success.main : state === 'now' ? alpha(t.palette.primary.main, 0.12) : 'transparent',
          color: state === 'done' ? 'common.white' : state === 'now' ? 'primary.main' : 'text.disabled',
        }}
      >
        {state === 'done' ? (
          <CheckIcon fontSize="small" />
        ) : state === 'now' ? (
          <HourglassTopIcon fontSize="small" />
        ) : (
          <RadioButtonUncheckedIcon fontSize="small" />
        )}
      </Box>
      <Box sx={{ minWidth: 0, pt: 0.5 }}>
        <Typography sx={{ fontWeight: state === 'now' ? 700 : 600, fontSize: 16, lineHeight: 1.4 }} color={state === 'later' ? 'text.secondary' : 'text.primary'}>
          {title}
          <Box component="span" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
            {state === 'done' ? ', done' : state === 'now' ? ', happening now' : ', next'}
          </Box>
        </Typography>
        {note && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {note}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export default function ClassSetupPending({
  initial,
  onRefresh,
}: {
  initial: ClassSetupPendingData;
  /** 'ready' when the account exists and the page has switched to the guide. */
  onRefresh: () => Promise<'ready' | ClassSetupPendingData | null>;
}) {
  const [data, setData] = useState(initial);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const checkingPayment = data.pending.stage === 'checking';
  const first = data.firstName || 'there';

  const check = async () => {
    setChecking(true);
    setNote(null);
    const fresh = await onRefresh();
    setChecking(false);
    if (fresh === 'ready') return;
    if (!fresh) return setNote('Could not check right now. Try again in a moment.');
    setData(fresh);
    setNote(fresh.pending.stage === 'checking' ? 'Still checking your payment.' : 'Your account is still being made.');
  };

  const helpUrl = `https://wa.me/${HELP_NUMBER}?text=${encodeURIComponent(
    `Hi, I'm ${data.firstName || 'a new student'}. I enrolled and I'm waiting for my class account.`,
  )}`;

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', px: 2, py: { xs: 2, sm: 3 } }}>
      <Typography component="h1" variant="h5" fontWeight={800}>
        Hi {first}, you&apos;re almost in
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
        {checkingPayment
          ? 'We are checking your payment. This usually takes a few hours.'
          : 'Your payment is verified. We are making your Neram class account.'}
      </Typography>

      <Paper variant="outlined" sx={{ mt: 2.5, px: 2, py: 1, borderRadius: 3 }}>
        <Box component="ol" aria-label="Where you are" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          <Row state="done" title="Payment sent" />
          <Row state={checkingPayment ? 'now' : 'done'} title="Payment checked" />
          <Row
            state={checkingPayment ? 'later' : 'now'}
            title="Class account ready"
            note={
              checkingPayment
                ? undefined
                : data.pending.email
                  ? `We will email ${data.pending.email} when it is ready.`
                  : 'We will tell you when it is ready.'
            }
          />
          <Row state="later" title="Your 5 setup steps" note="WhatsApp group, Authenticator, Teams, sign in, Nexus. They appear on this page." />
        </Box>
      </Paper>

      {note && (
        <Alert severity="info" role="status" sx={{ mt: 2 }}>
          {note}
        </Alert>
      )}

      <Box sx={{ mt: 2.5, display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        <Button
          variant="contained"
          onClick={check}
          disabled={checking}
          startIcon={<RefreshIcon />}
          sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}
        >
          {checking ? 'Checking' : 'Check again'}
        </Button>
        <Button
          variant="outlined"
          color="success"
          href={helpUrl}
          target="_blank"
          rel="noopener noreferrer"
          startIcon={<WhatsAppIcon />}
          sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
        >
          Message us
        </Button>
      </Box>
    </Box>
  );
}
