'use client';

/**
 * Class account: the student's Microsoft login for Teams and Nexus.
 *
 * Before it exists: the suggested login ID (Firstname_FatherGivenName), editable
 * with a live "is it free" check, and one button that creates the account,
 * licenses it, links it to the record, adds the student to their year classroom
 * and its Team, and emails the setup link.
 *
 * After: each step with a tick or the reason it failed, Retry from that step,
 * Copy for WhatsApp (login ID and setup link, never the password), Resend email,
 * Reset password, and how far the student is in the setup guide.
 *
 * Once the student signs in, setup is history: the steps fold away and the
 * hand-over actions (WhatsApp, welcome email) go. An account staff made by hand
 * before class accounts were automatic needs nothing at all: the card just shows
 * it, and what Teams shows for them (name, Student, NNE28).
 *
 * Used on the demo desk (under "Enrolled with the link") and on the person page.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Paper,
  TextField,
  Tooltip,
  Typography,
  useCopyToClipboard,
} from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import RefreshIcon from '@mui/icons-material/Refresh';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import LockResetIcon from '@mui/icons-material/LockReset';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import { OpsSkeleton as Skeleton } from '@/components/ops/OpsUi';
import { isNewAccount, nextAutoRetryDelay, teamsRetryNote, TEAMS_AUTO_RETRY_DELAYS_MIN } from './auto-retry';

type StepKey = 'account' | 'licence' | 'link' | 'classroom' | 'teams' | 'welcome';
interface Step {
  status: 'pending' | 'done' | 'failed' | 'skipped';
  at?: string;
  message?: string;
}
interface View {
  student: { id: string; firstName: string; phone: string | null; personalEmail: string | null; hasFather: boolean; isStudent: boolean };
  suggestion: { username: string; domain: string; upn: string; startPassword: string | null };
  setup: null | {
    upn: string;
    passwordMode: 'start' | 'random';
    steps: Record<StepKey, Step>;
    complete: boolean;
    accountCreatedAt: string | null;
    passwordChangedAt: string | null;
    passwordResetAt: string | null;
  };
  whatsapp: { message: string; url: string } | null;
  guide: { count: number; total: number } | null;
  batchGroup: { url: string; source: string; batchLabel: string | null } | null;
  existing: { upn: string | null } | null;
  origin: 'none' | 'hand' | 'adopted' | 'made';
  teamsName: { givenName: string; surname: string | null; displayName: string };
  teams: { displayName: string; jobTitle: string | null; department: string | null } | null;
  department: string | null;
  teamsFix: { name: string | null; jobTitle: string | null; department: string | null } | null;
  signedInAt: string | null;
  groupChatUrl: string | null;
}

const shortDate = (value: string) =>
  new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

const STEP_LABELS: Record<StepKey, string> = {
  account: 'Microsoft account',
  licence: 'Student licence',
  link: 'Linked to the Neram record',
  classroom: 'Year classroom',
  teams: 'Class Team and group chat',
  welcome: 'Welcome email',
};
const STEP_ORDER: StepKey[] = ['account', 'licence', 'link', 'classroom', 'teams', 'welcome'];

function StepIcon({ status }: { status: Step['status'] }) {
  if (status === 'done') return <CheckCircleIcon color="success" fontSize="small" aria-label="Done" />;
  if (status === 'failed') return <ErrorOutlineIcon color="error" fontSize="small" aria-label="Failed" />;
  if (status === 'skipped') return <RemoveCircleOutlineIcon color="disabled" fontSize="small" aria-label="Skipped" />;
  return <RadioButtonUncheckedIcon color="disabled" fontSize="small" aria-label="Not done yet" />;
}

type Busy = 'create' | 'adopt' | 'resend' | 'reset' | 'name';
type Availability = { state: 'idle' | 'checking' | 'free' | 'taken' | 'invalid' | 'error'; alternative?: string | null; message?: string };

export default function ClassAccountCard({ userId, adminId }: { userId: string; adminId?: string | null }) {
  const { copied, copy } = useCopyToClipboard(2000);
  const { copied: messageCopied, copy: copyMessage } = useCopyToClipboard(2000);
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [availability, setAvailability] = useState<Availability>({ state: 'idle' });
  const [busy, setBusy] = useState<Busy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [onceShown, setOnceShown] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  // Making a Microsoft account (or adopting one) is costly and sends email: always confirmed first.
  const [confirm, setConfirm] = useState<'create' | 'adopt' | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  // The card's own retries of the Teams step on a brand new account (see auto-retry.ts).
  const [autoTries, setAutoTries] = useState(0);
  const [autoAt, setAutoAt] = useState<number | null>(null);
  const checkSeq = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/students/${userId}/class-account`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not load the class account.');
      setView(json.data);
      setUsername((current) => current || json.data?.suggestion?.username || '');
    } catch (err: any) {
      setLoadError(err?.message || 'Could not load the class account.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // Is the typed login ID free? Debounced, and only before the account exists.
  useEffect(() => {
    if (!view || view.setup?.steps.account.status === 'done' || view.existing || !username.trim()) {
      setAvailability({ state: 'idle' });
      return;
    }
    const seq = ++checkSeq.current;
    setAvailability({ state: 'checking' });
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/students/${userId}/class-account/check?username=${encodeURIComponent(username.trim())}`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (seq !== checkSeq.current) return;
        if (!res.ok) return setAvailability({ state: 'error', message: json.error || 'Could not check the ID with Microsoft.' });
        const d = json.data;
        setAvailability(!d.valid ? { state: 'invalid' } : d.available ? { state: 'free' } : { state: 'taken', alternative: d.alternative });
      } catch {
        if (seq === checkSeq.current) setAvailability({ state: 'error', message: 'Could not check the ID with Microsoft.' });
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [username, userId, view]);

  const post = async (path: string, body: Record<string, unknown>, kind: Busy) => {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, adminId: adminId || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.data) setView(json.data);
      if (json.password) setOnceShown(json.password);
      if (!res.ok) throw new Error(json.error || 'Something went wrong. Try again.');
      return json;
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Try again.');
      return null;
    } finally {
      setBusy(null);
    }
  };

  // A new account's Teams step that failed is tried again while the card is open:
  // at 2, 5 and 10 minutes, then never again until staff press Retry. Paused while
  // anything else is running; the same POST as Retry, which only redoes failed steps.
  const teamsAutoRetry =
    view?.setup?.steps.account.status === 'done' &&
    view.setup.steps.teams.status === 'failed' &&
    isNewAccount(view.setup.accountCreatedAt, Date.now());
  useEffect(() => {
    const delay = teamsAutoRetry && busy === null ? nextAutoRetryDelay(autoTries) : null;
    if (delay === null) {
      setAutoAt(null);
      return;
    }
    setAutoAt(Date.now() + delay);
    const timer = setTimeout(() => {
      setAutoTries((n) => n + 1);
      post(`/api/students/${userId}/class-account`, {}, 'create').then((ok) => {
        if (ok?.data?.setup?.steps?.teams?.status === 'done') setNotice('Tried again automatically: now in the class Team and group chat.');
      });
    }, delay);
    return () => clearTimeout(timer);
    // post is recreated every render; the timer must only restart when these change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamsAutoRetry, busy, autoTries, userId]);

  if (loading && !view) {
    return (
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }} aria-busy>
        <Skeleton variant="text" width="40%" height={28} />
        <Skeleton variant="rounded" height={56} sx={{ mt: 1 }} />
      </Paper>
    );
  }
  if (loadError || !view) {
    return (
      <Alert
        severity="error"
        action={
          <Button onClick={load} sx={{ minHeight: 44 }}>
            Try again
          </Button>
        }
      >
        {loadError || 'Could not load the class account.'}
      </Alert>
    );
  }
  if (!view.student.isStudent) return null;

  const first = view.student.firstName || 'the student';
  const setup = view.setup;
  const accountDone = setup?.steps.account.status === 'done';
  const signedIn = !!view.signedInAt;

  // What Teams shows for them, and the one fix when it differs from how staff set students up.
  const shown = view.teams;
  const fix = view.teamsFix;
  const teamsProfile = (
    <Box sx={{ mt: 1 }}>
      <Typography variant="body2" color="text.secondary">
        In Teams:{' '}
        <strong>{[shown?.displayName || view.teamsName.displayName, shown?.jobTitle, shown?.department].filter(Boolean).join(' · ')}</strong>
        {shown && !shown.department && !view.department && ' (no exam year on file for the department)'}
      </Typography>
      {fix && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.25 }}>
          <Typography variant="body2" color="text.secondary">
            Should be:{' '}
            {[fix.name || shown?.displayName, fix.jobTitle || shown?.jobTitle, fix.department || shown?.department].filter(Boolean).join(' · ')}
          </Typography>
          <Button
            size="small"
            onClick={async () => {
              const ok = await post(`/api/students/${userId}/class-account`, { syncName: true }, 'name');
              if (ok) setNotice('Teams profile updated. It can take a few minutes to appear in Teams.');
            }}
            disabled={busy !== null}
            startIcon={busy === 'name' ? <CircularProgress size={14} color="inherit" /> : undefined}
            sx={{ minHeight: 36, textTransform: 'none' }}
          >
            Update in Teams
          </Button>
        </Box>
      )}
    </Box>
  );

  const header = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
      <BadgeOutlinedIcon color="primary" aria-hidden />
      <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }}>
        Class account
      </Typography>
      {view.signedInAt ? (
        <Chip size="small" color="success" icon={<CheckCircleIcon />} label={`Active, first signed in ${shortDate(view.signedInAt)}`} />
      ) : (
        accountDone &&
        view.guide && (
          <Chip
            size="small"
            color={view.guide.count === view.guide.total ? 'success' : 'default'}
            label={view.guide.count === 0 ? 'Setup guide: not started' : `Setup guide: ${view.guide.count} of ${view.guide.total} done`}
          />
        )
      )}
    </Box>
  );

  const confirmUpn = view.existing?.upn || `${username.trim()}@${view.suggestion.domain}`;
  const confirmDialog = (
    <Dialog
      open={confirm !== null}
      onClose={busy ? undefined : () => setConfirm(null)}
      maxWidth="xs"
      fullWidth
      aria-labelledby={`ca-${userId}-confirm`}
    >
      <DialogTitle id={`ca-${userId}-confirm`} sx={{ fontWeight: 700 }}>
        {confirm === 'adopt' ? `Use ${first}'s existing account?` : `Create ${first}'s class login?`}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ fontWeight: 700, wordBreak: 'break-all', mb: 1 }}>
          {confirmUpn}
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.5, typography: 'body2', color: 'text.secondary' }}>
          {confirm === 'adopt' ? (
            <>
              <li>Keeps this Microsoft account. No new account is made.</li>
              <li>Makes sure it has a student licence.</li>
              <li>Adds {first} to the year classroom, its Team and the group chat.</li>
              <li>No welcome email, since {first} already uses this account.</li>
            </>
          ) : (
            <>
              <li>Creates a real Microsoft account and uses a paid student licence.</li>
              <li>Adds {first} to the year classroom, its Team and the group chat.</li>
              <li>
                {view.student.personalEmail
                  ? `Emails the login ID and setup link to ${view.student.personalEmail}.`
                  : 'No personal email on file, so copy the WhatsApp message afterwards.'}
              </li>
              <li>Teams shows the name {view.teamsName.displayName}.</li>
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={() => setConfirm(null)} disabled={busy !== null} sx={{ minHeight: 44, textTransform: 'none' }}>
          Go back
        </Button>
        <Button
          variant="contained"
          onClick={async () => {
            const kind = confirm;
            const ok = await post(
              `/api/students/${userId}/class-account`,
              kind === 'adopt' ? { adopt: true } : { username: username.trim() },
              kind === 'adopt' ? 'adopt' : 'create',
            );
            setConfirm(null);
            if (ok) setNotice(kind === 'adopt' ? `Now tracked here. ${first} keeps the same login.` : `Class login created for ${first}.`);
          }}
          disabled={busy !== null}
          startIcon={busy === 'create' || busy === 'adopt' ? <CircularProgress size={16} color="inherit" /> : <BadgeOutlinedIcon />}
          sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700 }}
        >
          {busy === 'create'
            ? 'Creating, about 20 seconds'
            : busy === 'adopt'
              ? 'Setting up'
              : confirm === 'adopt'
                ? 'Use this account'
                : 'Create login and email it'}
        </Button>
      </DialogActions>
    </Dialog>
  );

  const batchNote = !view.batchGroup ? (
    <Alert severity="info" sx={{ mt: 1.5 }}>
      No WhatsApp group link is set for this batch, so the setup guide cannot show one. Add it in <a href="/exam-batches">Exam Batches</a>.
    </Alert>
  ) : view.batchGroup.source !== 'batch' ? (
    <Alert severity="warning" sx={{ mt: 1.5 }}>
      The WhatsApp group link comes from the old onboarding settings, which may be last year&apos;s group. Set this batch&apos;s link in{' '}
      <a href="/exam-batches">Exam Batches</a>.
    </Alert>
  ) : null;

  // ── Already has a Microsoft account, made outside this card ─────────────────
  if (!accountDone && view.existing) {
    return (
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        {header}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
          <Typography variant="body1" fontWeight={700} sx={{ wordBreak: 'break-all' }}>
            {view.existing.upn || 'A Microsoft account'}
          </Typography>
          {view.existing.upn && (
            <Tooltip title={copied ? 'Copied' : 'Copy login ID'}>
              <IconButton onClick={() => copy(view.existing!.upn!)} aria-label="Copy login ID" sx={{ width: 44, height: 44 }}>
                {copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {signedIn
            ? `Made by hand before class accounts were automatic, and ${first} already uses it. Nothing to do here.`
            : `Made by hand before class accounts were automatic. ${first} has not signed in yet.`}
        </Typography>
        {teamsProfile}
        {error && (
          <Alert severity="error" role="alert" sx={{ mt: 1.5 }}>
            {error}
          </Alert>
        )}
        {notice && (
          <Alert severity="success" role="status" sx={{ mt: 1.5 }} onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        )}
        {/* Someone already using the account is in their classroom and Team: no check to offer. */}
        {!signedIn && (
          <Button
            size="small"
            onClick={() => setConfirm('adopt')}
            disabled={busy !== null}
            sx={{ mt: 1, minHeight: 36, textTransform: 'none', px: 0 }}
          >
            Check the licence, classroom and Team
          </Button>
        )}
        {confirmDialog}
      </Paper>
    );
  }

  // ── Not set up yet ──────────────────────────────────────────────────────────
  if (!accountDone) {
    const canCreate = availability.state === 'free' || availability.state === 'idle' || availability.state === 'error';
    return (
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        {header}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The Microsoft login {first} uses for Teams and Nexus. Setting it up adds {first} to the year classroom and its Team, and emails the setup
          guide
          {view.student.personalEmail ? ` to ${view.student.personalEmail}` : ''}.
        </Typography>
        <TextField
          label="Login ID"
          value={username}
          onChange={(e) => setUsername(e.target.value.replace(/@.*$/, '').replace(/\s+/g, '_'))}
          fullWidth
          disabled={busy !== null}
          InputProps={{ endAdornment: <InputAdornment position="end">@{view.suggestion.domain}</InputAdornment> }}
          inputProps={{ 'aria-describedby': `ca-${userId}-help`, spellCheck: false, autoCapitalize: 'off' }}
          error={availability.state === 'taken' || availability.state === 'invalid'}
          helperText={
            <span id={`ca-${userId}-help`}>
              {availability.state === 'checking' && 'Checking with Microsoft'}
              {availability.state === 'free' && 'Available'}
              {availability.state === 'invalid' && 'Letters, numbers, dots, dashes and underscores only.'}
              {availability.state === 'error' && availability.message}
              {availability.state === 'taken' &&
                (availability.alternative ? `Taken. ${availability.alternative} is free.` : 'Taken. Choose another ID.')}
              {availability.state === 'idle' && 'First name and father’s name, as staff have always done.'}
            </span>
          }
          FormHelperTextProps={{ sx: availability.state === 'free' ? { color: 'success.main' } : undefined }}
        />
        {availability.state === 'taken' && availability.alternative && (
          <Button size="small" onClick={() => setUsername(availability.alternative as string)} sx={{ mt: 0.5, minHeight: 36 }}>
            Use {availability.alternative}
          </Button>
        )}
        {!view.student.hasFather && (
          <Alert severity="warning" sx={{ mt: 1.5 }}>
            No father&apos;s name on file, so the ID uses {first}&apos;s name only. Edit it if needed.
          </Alert>
        )}
        {view.suggestion.startPassword && (
          <Typography variant="body2" sx={{ mt: 1.5 }}>
            Start password <strong>{view.suggestion.startPassword}</strong>. Microsoft asks {first} to choose a new one at the first sign-in.
          </Typography>
        )}
        {setup && STEP_ORDER.some((k) => setup.steps[k].status === 'failed') && (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {setup.steps.account.message || 'The last try stopped before the account was made.'}
          </Alert>
        )}
        {error && (
          <Alert severity="error" role="alert" sx={{ mt: 1.5 }}>
            {error}
          </Alert>
        )}
        <Box sx={{ mt: 2 }}>
          <Button
            variant="contained"
            onClick={() => setConfirm('create')}
            disabled={busy !== null || !username.trim() || !canCreate}
            startIcon={busy === 'create' ? <CircularProgress size={16} color="inherit" /> : <BadgeOutlinedIcon />}
            sx={{ minHeight: 44, fontWeight: 700, textTransform: 'none' }}
          >
            {busy === 'create' ? 'Creating, about 20 seconds' : 'Create login and email it'}
          </Button>
        </Box>
        {batchNote}
        {confirmDialog}
      </Paper>
    );
  }

  // ── Set up ────────────────────────────────────────────────────────────────
  const failed = STEP_ORDER.filter((k) => setup!.steps[k].status === 'failed');
  const ownPassword = !!setup!.passwordChangedAt;
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      {header}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
        <Typography variant="body1" fontWeight={700} sx={{ wordBreak: 'break-all' }}>
          {setup!.upn}
        </Typography>
        <Tooltip title={copied ? 'Copied' : 'Copy login ID'}>
          <IconButton onClick={() => copy(setup!.upn)} aria-label="Copy login ID" sx={{ width: 44, height: 44 }}>
            {copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>
      <Typography variant="body2" color="text.secondary">
        {ownPassword
          ? `${first} has chosen their own password.`
          : signedIn
            ? `${first} already uses this account.`
            : // A start password is only known for an account made or reset here, never one staff made by hand.
              setup!.passwordMode === 'start' && view.suggestion.startPassword && (view.origin === 'made' || setup!.passwordResetAt)
              ? `Start password ${view.suggestion.startPassword} still works until ${first} signs in and changes it.`
              : `${first} has not signed in yet.`}
      </Typography>
      {teamsProfile}

      {onceShown && (
        <Alert severity="warning" sx={{ mt: 1.5 }} onClose={() => setOnceShown(null)}>
          Microsoft refused the usual start password, so this one was made instead. It is shown only now:{' '}
          <strong style={{ fontFamily: 'monospace' }}>{onceShown}</strong>
          <Button size="small" onClick={() => copy(onceShown)} sx={{ ml: 1 }}>
            Copy
          </Button>
        </Alert>
      )}

      {/* Once the student is signed in, the setup checklist is history: folded away. */}
      {view.signedInAt && (
        <Button
          size="small"
          onClick={() => setShowSteps((s) => !s)}
          aria-expanded={showSteps}
          sx={{ mt: 1, minHeight: 36, textTransform: 'none', px: 0 }}
        >
          {showSteps ? 'Hide setup steps' : failed.length ? `Show setup steps (${failed.length} not finished)` : 'Show setup steps'}
        </Button>
      )}
      <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, mt: 1.5, display: view.signedInAt && !showSteps ? 'none' : 'grid', gap: 0.75 }}>
        {STEP_ORDER.map((key) => {
          const step = setup!.steps[key];
          return (
            <Box component="li" key={key} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
              <Box sx={{ pt: '2px' }}>
                <StepIcon status={step.status} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600}>
                  {STEP_LABELS[key]}
                  {key === 'classroom' && step.status === 'done' && step.message ? `: ${step.message}` : ''}
                  {key === 'welcome' && step.status === 'done' && step.message ? ` to ${step.message}` : ''}
                </Typography>
                {step.message && step.status !== 'done' && (
                  <Typography variant="caption" color={step.status === 'failed' ? 'error' : 'text.secondary'} sx={{ display: 'block' }}>
                    {step.message}
                  </Typography>
                )}
                {key === 'teams' && step.status === 'failed' && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {teamsRetryNote({
                      autoAt,
                      exhausted: autoTries >= TEAMS_AUTO_RETRY_DELAYS_MIN.length,
                      signedIn: !!view.signedInAt,
                      firstName: first,
                    })}
                  </Typography>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>

      {error && (
        <Alert severity="error" role="alert" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" role="status" sx={{ mt: 1.5 }} onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
        {/* For a student already signed in, a retry lives with the folded steps, not up front. */}
        {failed.length > 0 && (!signedIn || showSteps) && (
          <Button
            variant={signedIn ? 'outlined' : 'contained'}
            onClick={() => post(`/api/students/${userId}/class-account`, {}, 'create')}
            disabled={busy !== null}
            startIcon={busy === 'create' ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
            sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700 }}
          >
            {busy === 'create' ? 'Retrying' : autoAt && failed[0] === 'teams' ? 'Retry now' : `Retry ${STEP_LABELS[failed[0]].toLowerCase()}`}
          </Button>
        )}
        {/* Handing over the login is for before the first sign-in. */}
        {view.whatsapp && !signedIn && (
          <>
            <Button
              variant="outlined"
              onClick={() => copyMessage(view.whatsapp!.message)}
              startIcon={messageCopied ? <CheckIcon /> : <ContentCopyIcon />}
              sx={{ minHeight: 44, textTransform: 'none' }}
            >
              {messageCopied ? 'Copied' : 'Copy for WhatsApp'}
            </Button>
            <Button
              variant="outlined"
              color="success"
              component="a"
              href={view.whatsapp.url}
              target="_blank"
              rel="noopener noreferrer"
              startIcon={<WhatsAppIcon />}
              sx={{ minHeight: 44, textTransform: 'none' }}
            >
              Open WhatsApp
            </Button>
          </>
        )}
        {!signedIn && (
          <Tooltip title={view.student.personalEmail ? '' : 'No personal email on file'}>
            <span>
              <Button
                onClick={async () => {
                  const ok = await post(`/api/students/${userId}/class-account`, { resendWelcome: true }, 'resend');
                  if (ok) setNotice(`Welcome email sent to ${view.student.personalEmail}.`);
                }}
                disabled={busy !== null || !view.student.personalEmail}
                startIcon={busy === 'resend' ? <CircularProgress size={16} color="inherit" /> : <MailOutlineIcon />}
                sx={{ minHeight: 44, textTransform: 'none' }}
              >
                Resend email
              </Button>
            </span>
          </Tooltip>
        )}
        <Button
          onClick={() => setResetOpen(true)}
          disabled={busy !== null}
          startIcon={<LockResetIcon />}
          sx={{ minHeight: 44, textTransform: 'none' }}
        >
          Reset password
        </Button>
        {view.groupChatUrl && (
          <Tooltip title="Opens the student group chat in Teams, where you can add someone by hand">
            <Button
              component="a"
              href={view.groupChatUrl}
              target="_blank"
              rel="noopener noreferrer"
              startIcon={<GroupsOutlinedIcon />}
              sx={{ minHeight: 44, textTransform: 'none' }}
            >
              Open group chat
            </Button>
          </Tooltip>
        )}
      </Box>
      {batchNote}

      <Dialog open={resetOpen} onClose={busy ? undefined : () => setResetOpen(false)} maxWidth="xs" fullWidth aria-labelledby={`ca-${userId}-reset`}>
        <DialogTitle id={`ca-${userId}-reset`} sx={{ fontWeight: 700 }}>
          Reset {first}&apos;s password?
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            It goes back to {view.suggestion.startPassword || 'a new start password'}, and Microsoft asks for a new one at the next sign-in. The setup
            guide shows it to {first} again.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setResetOpen(false)} disabled={busy !== null} sx={{ minHeight: 44, textTransform: 'none' }}>
            Go back
          </Button>
          <Button
            variant="contained"
            onClick={async () => {
              const ok = await post(`/api/students/${userId}/class-account/reset-password`, {}, 'reset');
              setResetOpen(false);
              if (ok) setNotice(`Password reset. ${first} signs in with the start password and chooses a new one.`);
            }}
            disabled={busy !== null}
            startIcon={busy === 'reset' ? <CircularProgress size={16} color="inherit" /> : <LockResetIcon />}
            sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700 }}
          >
            Reset password
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
