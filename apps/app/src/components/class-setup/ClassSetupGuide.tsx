'use client';

/**
 * "Let's get you into class": the five steps a newly enrolled student does
 * once, on their phone, without anyone from the office walking them through it.
 *
 *   1. Join the batch WhatsApp group
 *   2. Install Microsoft Authenticator
 *   3. Install Microsoft Teams
 *   4. Sign in with the Neram login and choose their own password
 *   5. Open Nexus and add their photo
 *
 * Signed in only (the Google account or phone they enrolled with), so the login
 * and start password are seen by the student and nobody they forward a link to.
 * One step is open at a time; every step can be opened in any order. Steps 4
 * and 5 tick themselves (Microsoft says the password changed, Nexus has a photo);
 * the install steps are ticked by the student.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Collapse,
  IconButton,
  LinearProgress,
  Paper,
  Skeleton,
  Tooltip,
  Typography,
  useCopyToClipboard,
} from '@neram/ui';
import useMediaQuery from '@mui/material/useMediaQuery';
import { alpha } from '@mui/material/styles';
import CheckIcon from '@mui/icons-material/Check';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import SecurityIcon from '@mui/icons-material/Security';
import VideoCallIcon from '@mui/icons-material/VideoCall';
import LoginIcon from '@mui/icons-material/Login';
import SchoolIcon from '@mui/icons-material/School';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CelebrationIcon from '@mui/icons-material/Celebration';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import { getFirebaseAuth } from '@neram/auth';
import {
  DEVICE_NAMES,
  chromeIntentUrl,
  detectDevice,
  isInAppBrowser,
  isPhone,
  otherStoreLinks,
  storeLinkFor,
  type AppKey,
  type Device,
} from './device';

type StepKey = 'whatsapp' | 'authenticator' | 'teams' | 'signin' | 'nexus';
const ORDER: StepKey[] = ['whatsapp', 'authenticator', 'teams', 'signin', 'nexus'];

export interface ClassSetupData {
  ready: true;
  firstName: string;
  upn: string;
  password: string | null;
  passwordChanged: boolean;
  passwordFromOffice: boolean;
  whatsappGroupUrl: string | null;
  nexusUrl: string;
  photoStatus: string | null;
  done: Record<StepKey, boolean>;
  count: number;
  total: number;
}

const HELP_NUMBER = '916380194614';
const TEAMS_WEB = 'https://teams.microsoft.com';

const TITLES: Record<StepKey, { title: string; why: string; icon: React.ReactNode }> = {
  whatsapp: { title: 'Join your batch WhatsApp group', why: 'Class times, notices and quick help.', icon: <WhatsAppIcon /> },
  authenticator: { title: 'Install Microsoft Authenticator', why: 'Keeps your class account safe.', icon: <SecurityIcon /> },
  teams: { title: 'Install Microsoft Teams', why: 'Where your live classes happen.', icon: <VideoCallIcon /> },
  signin: { title: 'Sign in and choose your password', why: 'Your Neram login for Teams and Nexus.', icon: <LoginIcon /> },
  nexus: { title: 'Open Nexus and add your photo', why: 'Classes, homework and recordings.', icon: <SchoolIcon /> },
};

async function idToken(): Promise<string | null> {
  const auth = getFirebaseAuth();
  try {
    await (auth as any).authStateReady?.();
  } catch {
    /* older SDKs: fall through to currentUser */
  }
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}

// ── Small pieces ─────────────────────────────────────────────────────────────

function HowTo({ steps, reduceMotion }: { steps: string[]; reduceMotion: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Box sx={{ mt: 1.5 }}>
      <Button
        size="small"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        endIcon={<ExpandMoreIcon sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: reduceMotion ? 'none' : 'transform 200ms' }} />}
        sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600, px: 1 }}
      >
        Show me how
      </Button>
      <Collapse in={open} timeout={reduceMotion ? 0 : 'auto'}>
        <Box component="ol" sx={{ m: 0, mt: 1, pl: 0, listStyle: 'none', display: 'grid', gap: 1 }}>
          {steps.map((text, i) => (
            <Box component="li" key={i} sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
              <Box
                aria-hidden
                sx={{
                  flexShrink: 0,
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  bgcolor: (t) => alpha(t.palette.primary.main, 0.1),
                  color: 'primary.main',
                  fontWeight: 700,
                  fontSize: 14,
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {i + 1}
              </Box>
              <Typography variant="body2" sx={{ pt: '2px' }}>
                {text}
              </Typography>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

function CopyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const { copied, copy } = useCopyToClipboard(2000);
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: 1.5,
        borderRadius: 2,
        bgcolor: (t) => alpha(t.palette.primary.main, 0.05),
        border: 1,
        borderColor: (t) => alpha(t.palette.primary.main, 0.2),
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {label}
        </Typography>
        <Typography
          sx={{ fontSize: 17, fontWeight: 700, wordBreak: 'break-all', fontFamily: mono ? 'ui-monospace, Menlo, Consolas, monospace' : undefined }}
        >
          {value}
        </Typography>
      </Box>
      <Tooltip title={copied ? 'Copied' : `Copy ${label.toLowerCase()}`}>
        <IconButton onClick={() => copy(value)} aria-label={`Copy ${label.toLowerCase()}`} sx={{ width: 48, height: 48 }}>
          {copied ? <CheckIcon color="success" /> : <ContentCopyIcon />}
        </IconButton>
      </Tooltip>
    </Box>
  );
}

function StoreButton({ app, device }: { app: AppKey; device: Device }) {
  const link = storeLinkFor(app, device);
  if (!link) return null;
  return (
    <Button
      variant="contained"
      size="large"
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      endIcon={<OpenInNewIcon />}
      fullWidth
      sx={{ minHeight: 52, fontWeight: 700, textTransform: 'none', fontSize: 16 }}
    >
      {link.label}
    </Button>
  );
}

function OtherDevices({ app, device }: { app: AppKey; device: Device }) {
  const others = otherStoreLinks(app, device);
  if (!others.length) return null;
  return (
    <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25 }}>
      Also for{' '}
      {others.map((link, i) => (
        <span key={link.device}>
          {i > 0 && (i === others.length - 1 ? ' or ' : ', ')}
          <a href={link.href} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', fontWeight: 600 }}>
            {DEVICE_NAMES[link.device]}
          </a>
        </span>
      ))}
      .
    </Typography>
  );
}

// ── The guide ────────────────────────────────────────────────────────────────

export default function ClassSetupGuide({ initial, onRefresh }: { initial: ClassSetupData; onRefresh: () => Promise<ClassSetupData | null> }) {
  const [data, setData] = useState<ClassSetupData>(initial);
  const [device, setDevice] = useState<Device>('other');
  const [inApp, setInApp] = useState(false);
  const [pageUrl, setPageUrl] = useState('https://app.neramclasses.com/onboarding');
  const [saving, setSaving] = useState<StepKey | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const firstOpen = useMemo(() => ORDER.find((k) => !initial.done[k]) ?? null, [initial.done]);
  const [open, setOpen] = useState<StepKey | null>(firstOpen);

  useEffect(() => {
    setDevice(detectDevice(navigator.userAgent, navigator.maxTouchPoints));
    setInApp(isInAppBrowser(navigator.userAgent));
    setPageUrl(window.location.href);
  }, []);

  const next = (after: StepKey, done: Record<StepKey, boolean>) =>
    ORDER.slice(ORDER.indexOf(after) + 1).find((k) => !done[k]) ?? ORDER.find((k) => !done[k]) ?? null;

  const tick = useCallback(
    async (step: StepKey, done = true) => {
      setSaving(step);
      setError(null);
      try {
        const token = await idToken();
        const res = await fetch('/api/class-setup', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ step, done }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not save. Try again.');
        const fresh = await onRefresh();
        const updated = fresh ?? { ...data, done: { ...data.done, [step]: done } };
        setData(updated);
        if (done) setOpen(next(step, updated.done));
      } catch (err: any) {
        setError(err?.message || 'Could not save. Try again.');
      } finally {
        setSaving(null);
      }
    },
    [data, onRefresh],
  );

  const recheck = async (step: StepKey) => {
    setChecking(true);
    setError(null);
    const fresh = await onRefresh();
    setChecking(false);
    if (!fresh) return setError('Could not check right now. Try again in a moment.');
    setData(fresh);
    if (fresh.done[step]) setOpen(next(step, fresh.done));
  };

  const first = data.firstName || 'there';
  const allDone = data.count >= data.total;
  const helpUrl = (step: StepKey | null) =>
    `https://wa.me/${HELP_NUMBER}?text=${encodeURIComponent(
      `Hi, I'm ${data.firstName || 'a new student'} (${data.upn}). ${step ? `I'm stuck on "${TITLES[step].title}".` : 'I need help with my class setup.'}`,
    )}`;

  const tickButton = (step: StepKey, label: string) => (
    <Button
      variant={data.done[step] ? 'text' : 'outlined'}
      onClick={() => tick(step, !data.done[step])}
      disabled={saving !== null}
      startIcon={data.done[step] ? <CheckCircleIcon /> : <CheckIcon />}
      fullWidth
      sx={{ mt: 1.25, minHeight: 48, textTransform: 'none', fontWeight: 600 }}
    >
      {saving === step ? 'Saving' : data.done[step] ? 'Done. Tap to undo' : label}
    </Button>
  );

  const body: Record<StepKey, React.ReactNode> = {
    whatsapp: (
      <>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          We share class times, notices and help here. Join from the WhatsApp number you use every day.
        </Typography>
        {data.whatsappGroupUrl ? (
          <Button
            variant="contained"
            color="success"
            size="large"
            href={data.whatsappGroupUrl}
            target="_blank"
            rel="noopener noreferrer"
            startIcon={<WhatsAppIcon />}
            fullWidth
            sx={{ minHeight: 52, fontWeight: 700, textTransform: 'none', fontSize: 16 }}
          >
            Join the WhatsApp group
          </Button>
        ) : (
          <Alert severity="info">Your batch group link is on its way. The office will send it to you on WhatsApp.</Alert>
        )}
        {data.whatsappGroupUrl && tickButton('whatsapp', "I've joined")}
      </>
    ),
    authenticator: (
      <>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          When you sign in, Microsoft shows a number. You approve it in this app, so only you can use your account.
        </Typography>
        {isPhone(device) ? (
          <StoreButton app="authenticator" device={device} />
        ) : (
          <Alert severity="info" icon={false}>
            <Typography variant="body2" fontWeight={600}>
              This one goes on your phone.
            </Typography>
            <Typography variant="body2">
              Open this page on your phone and tap the button there, or use{' '}
              <a href={storeLinkFor('authenticator', 'android')!.href} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', fontWeight: 600, textDecoration: 'underline' }}>
                Play Store
              </a>{' '}
              or{' '}
              <a href={storeLinkFor('authenticator', 'ios')!.href} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', fontWeight: 600, textDecoration: 'underline' }}>
                App Store
              </a>
              .
            </Typography>
            <Button
              size="small"
              href={`https://wa.me/?text=${encodeURIComponent(`My Neram class setup: ${pageUrl}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              startIcon={<WhatsAppIcon />}
              sx={{ mt: 1, minHeight: 44, textTransform: 'none' }}
            >
              Send this page to my phone
            </Button>
          </Alert>
        )}
        <HowTo
          reduceMotion={reduceMotion}
          steps={[
            'Install Microsoft Authenticator. It is free, with the blue lock icon.',
            'Open it once and allow notifications.',
            'You do not need to add an account yet. Step 4 does that for you.',
          ]}
        />
        {tickButton('authenticator', "It's installed")}
      </>
    ),
    teams: (
      <>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Every live class is a Teams meeting. Install it on the phone or laptop you will attend class from.
        </Typography>
        <StoreButton app="teams" device={device} />
        {device === 'other' && (
          <Button
            variant="contained"
            href={storeLinkFor('teams', 'windows')!.href}
            target="_blank"
            rel="noopener noreferrer"
            fullWidth
            sx={{ minHeight: 52, fontWeight: 700, textTransform: 'none' }}
          >
            Download Microsoft Teams
          </Button>
        )}
        <OtherDevices app="teams" device={device} />
        {tickButton('teams', "It's installed")}
      </>
    ),
    signin: (
      <>
        {data.passwordChanged ? (
          <Alert severity="success" sx={{ mb: 1.5 }}>
            You have chosen your own password. Keep it safe and do not share it with anyone.
          </Alert>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            This is your Neram login for Teams and Nexus. It is only for you, so please do not share it.
          </Typography>
        )}
        <Box sx={{ display: 'grid', gap: 1 }}>
          <CopyField label="Login ID" value={data.upn} />
          {data.password && <CopyField label="Start password" value={data.password} mono />}
        </Box>
        {data.passwordFromOffice && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Use the start password the office sent you.
          </Typography>
        )}
        {!data.passwordChanged && (
          <>
            <Box component="ol" sx={{ m: 0, mt: 2, pl: 2.5, display: 'grid', gap: 0.75 }}>
              <Typography component="li" variant="body2">
                Open Teams and tap <strong>Sign in</strong>.
              </Typography>
              <Typography component="li" variant="body2">
                Type your login ID, then the start password.
              </Typography>
              <Typography component="li" variant="body2">
                Choose your own new password. Write it down somewhere safe.
              </Typography>
              <Typography component="li" variant="body2">
                If it says <strong>More information required</strong>, tap Next and follow it. It links Authenticator to your account.
              </Typography>
            </Box>
            <Button
              variant="contained"
              size="large"
              href={TEAMS_WEB}
              target="_blank"
              rel="noopener noreferrer"
              endIcon={<OpenInNewIcon />}
              fullWidth
              sx={{ mt: 2, minHeight: 52, fontWeight: 700, textTransform: 'none', fontSize: 16 }}
            >
              Open Teams
            </Button>
            <Button
              variant="outlined"
              onClick={() => recheck('signin')}
              disabled={checking}
              startIcon={<RefreshIcon />}
              fullWidth
              sx={{ mt: 1.25, minHeight: 48, textTransform: 'none', fontWeight: 600 }}
            >
              {checking ? 'Checking with Microsoft' : "I've signed in. Check"}
            </Button>
          </>
        )}
      </>
    ),
    nexus: (
      <>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Nexus has your classes, homework and recordings. A clear photo of your face is needed before your first class.
        </Typography>
        {data.photoStatus === 'pending' && (
          <Alert severity="success" sx={{ mb: 1.5 }}>
            Photo received. A teacher will confirm it.
          </Alert>
        )}
        {data.photoStatus === 'rejected' && (
          <Alert severity="warning" sx={{ mb: 1.5 }}>
            Your photo was not clear enough. Please add a new one in Nexus.
          </Alert>
        )}
        <Button
          variant="contained"
          size="large"
          href={data.nexusUrl}
          target="_blank"
          rel="noopener noreferrer"
          endIcon={<OpenInNewIcon />}
          fullWidth
          sx={{ minHeight: 52, fontWeight: 700, textTransform: 'none', fontSize: 16 }}
        >
          Open Nexus
        </Button>
        <HowTo
          reduceMotion={reduceMotion}
          steps={[
            'Tap Sign in with Microsoft and use the same login ID and your new password.',
            'Nexus asks for your photo. Take it in good light, face straight, no cap or sunglasses.',
            device === 'ios'
              ? 'Keep Nexus one tap away: in Safari tap Share, then Add to Home Screen.'
              : 'Keep Nexus one tap away: in Chrome tap the three dots, then Add to Home screen.',
          ]}
        />
        {!data.done.nexus && (
          <Button
            variant="outlined"
            onClick={() => recheck('nexus')}
            disabled={checking}
            startIcon={<RefreshIcon />}
            fullWidth
            sx={{ mt: 1.25, minHeight: 48, textTransform: 'none', fontWeight: 600 }}
          >
            {checking ? 'Checking' : "I've added my photo. Check"}
          </Button>
        )}
      </>
    ),
  };

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', px: 2, py: { xs: 2, sm: 3 } }}>
      {inApp && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="body2" fontWeight={600}>
            You opened this inside another app.
          </Typography>
          <Typography variant="body2">Some steps work better in your phone&apos;s browser.</Typography>
          {device === 'android' ? (
            <Button href={chromeIntentUrl(pageUrl)} size="small" sx={{ mt: 0.5, minHeight: 44, textTransform: 'none', fontWeight: 600 }}>
              Open in Chrome
            </Button>
          ) : (
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Tap the menu (three dots), then <strong>Open in Safari</strong>.
            </Typography>
          )}
        </Alert>
      )}

      <Typography component="h1" variant="h5" fontWeight={800}>
        {allDone ? `You're all set, ${first}!` : `Hi ${first}, let's get you into class`}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
        {allDone ? 'See you in class. Your class times are in Teams and Nexus.' : '5 short steps, about 10 minutes. Do them on your phone.'}
      </Typography>
      <Box sx={{ mt: 2, mb: 2.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
          <Typography variant="body2" fontWeight={700}>
            {data.count} of {data.total} done
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={(data.count / data.total) * 100}
          aria-label={`${data.count} of ${data.total} steps done`}
          sx={{ height: 8, borderRadius: 4 }}
        />
      </Box>

      {allDone && (
        <Paper
          variant="outlined"
          sx={{ p: 2.5, mb: 2, borderRadius: 3, textAlign: 'center', borderColor: 'success.main', bgcolor: (t) => alpha(t.palette.success.main, 0.06) }}
        >
          <CelebrationIcon color="success" sx={{ fontSize: 40 }} aria-hidden />
          <Typography variant="h6" fontWeight={700} sx={{ mt: 0.5 }}>
            Welcome to the class
          </Typography>
          <Button
            variant="contained"
            href={data.nexusUrl}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ mt: 1.5, minHeight: 48, textTransform: 'none', fontWeight: 700 }}
          >
            Open Nexus
          </Button>
        </Paper>
      )}

      {error && (
        <Alert severity="error" role="alert" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.25 }}>
        {ORDER.map((key, index) => {
          const done = data.done[key];
          const isOpen = open === key;
          const headerId = `setup-step-${key}`;
          return (
            <Paper
              component="li"
              key={key}
              variant="outlined"
              sx={{
                borderRadius: 3,
                overflow: 'hidden',
                borderColor: isOpen ? 'primary.main' : done ? (t) => alpha(t.palette.success.main, 0.4) : 'divider',
                borderWidth: isOpen ? 2 : 1,
              }}
            >
              <Box
                component="button"
                type="button"
                id={headerId}
                aria-expanded={isOpen}
                aria-controls={`${headerId}-panel`}
                onClick={() => setOpen(isOpen ? null : key)}
                sx={{
                  all: 'unset',
                  boxSizing: 'border-box',
                  width: '100%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  p: 1.75,
                  minHeight: 64,
                  '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: -3 },
                }}
              >
                <Box
                  aria-hidden
                  sx={{
                    flexShrink: 0,
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    bgcolor: (t) => (done ? t.palette.success.main : alpha(t.palette.primary.main, 0.1)),
                    color: done ? 'common.white' : 'primary.main',
                  }}
                >
                  {done ? <CheckIcon /> : TITLES[key].icon}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
                    Step {index + 1}
                    {done ? ', done' : ''}
                  </Typography>
                  <Typography sx={{ fontWeight: 700, fontSize: 16, lineHeight: 1.35 }}>{TITLES[key].title}</Typography>
                  {!isOpen && (
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {TITLES[key].why}
                    </Typography>
                  )}
                </Box>
                <ExpandMoreIcon
                  aria-hidden
                  sx={{ color: 'text.secondary', transform: isOpen ? 'rotate(180deg)' : 'none', transition: reduceMotion ? 'none' : 'transform 200ms' }}
                />
              </Box>
              <Collapse in={isOpen} timeout={reduceMotion ? 0 : 'auto'} unmountOnExit>
                <Box id={`${headerId}-panel`} role="region" aria-labelledby={headerId} sx={{ px: 1.75, pb: 2 }}>
                  {body[key]}
                </Box>
              </Collapse>
            </Paper>
          );
        })}
      </Box>

      <Paper variant="outlined" sx={{ mt: 2.5, p: 2, borderRadius: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <HelpOutlineIcon color="primary" aria-hidden />
        <Box sx={{ flex: 1 }}>
          <Typography variant="body2" fontWeight={700}>
            Stuck on a step?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Message us. We reply quickly.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          color="success"
          href={helpUrl(open)}
          target="_blank"
          rel="noopener noreferrer"
          startIcon={<WhatsAppIcon />}
          sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600, flexShrink: 0 }}
        >
          Get help
        </Button>
      </Paper>
    </Box>
  );
}

export function ClassSetupSkeleton() {
  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', px: 2, py: 3 }} aria-busy aria-label="Loading your setup">
      <Skeleton variant="text" width="75%" height={36} />
      <Skeleton variant="text" width="55%" />
      <Skeleton variant="rounded" height={8} sx={{ mt: 2, mb: 2.5 }} />
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} variant="rounded" height={68} sx={{ mb: 1.25, borderRadius: 3 }} />
      ))}
    </Box>
  );
}

export { idToken as classSetupIdToken };
