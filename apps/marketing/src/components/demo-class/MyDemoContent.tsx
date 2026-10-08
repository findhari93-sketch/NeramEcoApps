'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LoginModal,
  Skeleton,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import ButtonBase from '@mui/material/ButtonBase';
import { useFirebaseAuth } from '@neram/auth';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import {
  availableDemoDays,
  formatWindowRange,
  resolveDemoSchedule,
  DEFAULT_DEMO_SCHEDULE,
  type DemoWindow,
  type DemoWindowId,
} from '@neram/database/demo-schedule';
import type { PublicDemoRequest } from '@/lib/demo-request';
import DemoStatusCard, { type DemoPublicSettings } from './DemoStatusCard';
import { fetchMyDemo, updateMyDemo } from './demo-client';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';
const focusRing = { '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 } };

function Choice({ selected, onClick, children, disabled }: { selected: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <ButtonBase
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      sx={{
        minHeight: 48,
        px: 1.5,
        borderRadius: 2,
        border: 2,
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'primary.main' : 'background.paper',
        color: selected ? 'primary.contrastText' : 'text.primary',
        opacity: disabled ? 0.45 : 1,
        flexDirection: 'column',
        ...focusRing,
      }}
    >
      {children}
    </ButtonBase>
  );
}

export default function MyDemoContent() {
  const { user, loading: authLoading } = useFirebaseAuth();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [request, setRequest] = useState<PublicDemoRequest | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState<DemoPublicSettings>({
    schedule: DEFAULT_DEMO_SCHEDULE,
    drawingWhatsApp: '919176137043',
    callbackPromise: 'within 2 working hours',
  });
  const [login, setLogin] = useState(false);
  const [dialog, setDialog] = useState<'change' | 'cancel' | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [win, setWin] = useState<DemoWindow | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    fetch('/api/demo-class/settings')
      .then((r) => r.json())
      .then((d) => {
        if (d?.settings?.schedule) {
          setSettings({
            schedule: d.settings.schedule,
            drawingWhatsApp: d.settings.drawingWhatsApp || '919176137043',
            callbackPromise: d.settings.callbackPromise || 'within 2 working hours',
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoaded(true);
      return;
    }
    fetchMyDemo()
      .then((d) => setRequest(d.request))
      .finally(() => setLoaded(true));
  }, [user, authLoading]);

  const schedule = useMemo(() => resolveDemoSchedule(settings.schedule), [settings.schedule]);
  const days = useMemo(() => (now ? availableDemoDays(now, schedule) : []), [now, schedule]);
  const day = days.find((d) => d.date === date);

  const run = async (body: Parameters<typeof updateMyDemo>[0]) => {
    setBusy(true);
    setError(null);
    const r = await updateMyDemo(body);
    setBusy(false);
    if (r.ok) {
      setRequest(r.request);
      setDialog(null);
    } else {
      setError(r.message);
    }
  };

  const open = request && (request.status === 'pending' || request.status === 'contacted');
  const confirmed = request?.status === 'approved';

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '70vh', py: { xs: 3, md: 6 } }}>
      <Container maxWidth="sm" sx={{ px: 2 }}>
        <Button href="/demo-class" startIcon={<ArrowBackIcon />} sx={{ minHeight: 44, ml: -1, mb: 1 }}>
          Demo class
        </Button>
        <Typography variant="h4" component="h1" fontWeight={800} sx={{ fontSize: { xs: '1.6rem', md: '2rem' }, mb: 2 }}>
          My demo class
        </Typography>

        {!loaded || authLoading ? (
          <Box aria-busy>
            <Skeleton variant="rounded" height={220} />
          </Box>
        ) : !user ? (
          <Box sx={{ py: 3 }}>
            <Typography color="text.secondary">Sign in with the account you booked with to see your demo.</Typography>
            <Button variant="contained" size="large" onClick={() => setLogin(true)} sx={{ mt: 2, minHeight: 52 }}>
              Sign in
            </Button>
          </Box>
        ) : !request ? (
          <Box sx={{ py: 3 }}>
            <Typography color="text.secondary">You have not booked a demo yet.</Typography>
            <Button variant="contained" size="large" href="/demo-class" sx={{ mt: 2, minHeight: 52 }}>
              Book a free demo
            </Button>
          </Box>
        ) : (
          <DemoStatusCard
            request={request}
            settings={settings}
            origin=""
            actions={
              open ? (
                <>
                  <Button variant="outlined" onClick={() => { setDate(request.preferredDate); setWin(request.preferredWindow); setDialog('change'); }} sx={{ minHeight: 48 }}>
                    Change day or time
                  </Button>
                  <Button color="error" onClick={() => setDialog('cancel')} sx={{ minHeight: 48 }}>
                    Cancel request
                  </Button>
                </>
              ) : confirmed ? (
                <>
                  <Button
                    variant="outlined"
                    color="success"
                    startIcon={<WhatsAppIcon />}
                    href={`https://wa.me/919176137043?text=${encodeURIComponent(`Hi Neram, I need to move my demo class (${request.ref}).`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ minHeight: 48 }}
                  >
                    Need another time?
                  </Button>
                  <Button color="error" onClick={() => setDialog('cancel')} sx={{ minHeight: 48 }}>
                    Cancel demo
                  </Button>
                </>
              ) : (
                <Button variant="contained" href="/demo-class" sx={{ minHeight: 48 }}>
                  Book a new time
                </Button>
              )
            }
          />
        )}
      </Container>

      <Dialog open={dialog === 'change'} onClose={() => setDialog(null)} fullScreen={fullScreen} fullWidth maxWidth="sm" aria-labelledby="change-title">
        <DialogTitle id="change-title">Change day or time</DialogTitle>
        <DialogContent>
          <Box role="group" aria-label="Day" sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 1 }}>
            {days.map((d) => (
              <Choice key={d.date} selected={date === d.date && win !== 'anytime'} onClick={() => { setDate(d.date); if (win && win !== 'anytime' && !d.windows.includes(win as DemoWindowId)) setWin(null); if (win === 'anytime') setWin(null); }}>
                <Typography variant="caption" fontWeight={700} sx={{ color: 'inherit' }}>{d.label}</Typography>
                <Typography fontWeight={800} sx={{ color: 'inherit' }}>{d.sub}</Typography>
              </Choice>
            ))}
          </Box>
          {day && win !== 'anytime' && (
            <Box role="group" aria-label="Time of day" sx={{ display: 'grid', gap: 1, mt: 2 }}>
              {schedule.windows.map((w) => (
                <Choice key={w.id} selected={win === w.id} disabled={!day.windows.includes(w.id)} onClick={() => setWin(w.id)}>
                  <Typography fontWeight={800} sx={{ color: 'inherit' }}>{w.label}</Typography>
                  <Typography variant="caption" sx={{ color: 'inherit' }}>{formatWindowRange(w)}</Typography>
                </Choice>
              ))}
            </Box>
          )}
          <Box sx={{ mt: 2 }}>
            <Choice selected={win === 'anytime'} onClick={() => { setWin('anytime'); setDate(null); }}>
              <Typography fontWeight={700} sx={{ color: 'inherit' }}>Any time works, just call me</Typography>
            </Choice>
          </Box>
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialog(null)} sx={{ minHeight: 48 }}>Back</Button>
          <Button
            variant="contained"
            disabled={busy || !win || (win !== 'anytime' && !date)}
            onClick={() => win && run({ action: 'change_preference', date: win === 'anytime' ? null : date, window: win })}
            sx={{ minHeight: 48 }}
          >
            {busy ? 'Saving' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dialog === 'cancel'} onClose={() => setDialog(null)} fullWidth maxWidth="xs" aria-labelledby="cancel-title">
        <DialogTitle id="cancel-title">{confirmed ? 'Cancel your demo?' : 'Cancel your request?'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            You can book again any time. A short reason helps us improve.
          </Typography>
          <TextField label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth inputProps={{ maxLength: 200, style: { fontSize: 16 } }} />
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialog(null)} sx={{ minHeight: 48 }}>Keep it</Button>
          <Button color="error" variant="contained" disabled={busy} onClick={() => run({ action: 'cancel', reason })} sx={{ minHeight: 48 }}>
            {busy ? 'Cancelling' : 'Cancel'}
          </Button>
        </DialogActions>
      </Dialog>

      <LoginModal
        open={login}
        onClose={() => setLogin(false)}
        allowClose
        apiBaseUrl={APP_URL}
        onAuthenticated={() => setLogin(false)}
      />
    </Box>
  );
}
