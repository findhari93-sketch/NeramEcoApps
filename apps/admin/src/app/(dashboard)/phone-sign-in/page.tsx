'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, Paper, Snackbar, ToggleButton, ToggleButtonGroup, Typography } from '@neram/ui';
import PhoneMissedOutlinedIcon from '@mui/icons-material/PhoneMissedOutlined';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import SmsFailedOutlinedIcon from '@mui/icons-material/SmsFailedOutlined';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import CheckIcon from '@mui/icons-material/Check';
import UndoIcon from '@mui/icons-material/Undo';
import type { UnverifiedPhoneAttempt } from '@neram/database';
import { OpsPageHeader, EmptyState, OpsSkeleton, StatusChip, FOCUS_RING, TARGET_44, type Tone } from '@/components/ops/OpsUi';
import PhoneNumberList from '@/components/user360/PhoneNumberList';
import {
  diagnosePerson,
  groupAttemptsByPerson,
  STUCK_KIND_LABEL,
  type AttemptPerson,
  type StuckKind,
} from '@/lib/phone-attempts-view';
import { useAdminBadges } from '@/contexts/AdminBadgesContext';

const DAY_CHOICES = [7, 30, 90] as const;
type View = 'open' | 'done';

const KIND_STYLE: Record<StuckKind, { icon: typeof BugReportOutlinedIcon; tone: Tone }> = {
  bug: { icon: BugReportOutlinedIcon, tone: 'error' },
  sms: { icon: SmsFailedOutlinedIcon, tone: 'warning' },
  student: { icon: DirectionsWalkIcon, tone: 'neutral' },
  unclear: { icon: HelpOutlineIcon, tone: 'info' },
};

type Person = AttemptPerson<UnverifiedPhoneAttempt>;

/** Done = every number of the person marked handled (a new Send OTP reopens one). */
function isDone(person: Person): boolean {
  return person.attempts.every((a) => !!a.handled_at);
}

/**
 * People who typed a number into a phone sign-in and verified none: the OTP
 * failed, never arrived, or they gave up. Each person carries the likely
 * reason (a bug on our side, an SMS problem, or the student stopped) from
 * what the dialog recorded, so staff know whether to call or to fix code.
 * Someone who verified any number, a corrected typo included, is not here.
 */
export default function PhoneSignInPage() {
  const [days, setDays] = useState<(typeof DAY_CHOICES)[number]>(30);
  const [view, setView] = useState<View>('open');
  const [attempts, setAttempts] = useState<UnverifiedPhoneAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; undo?: Person; error?: boolean } | null>(null);
  const { refresh: refreshBadges } = useAdminBadges();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/phone-attempts?days=${days}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load the numbers.');
      setAttempts(data.attempts || []);
    } catch (e: any) {
      setError(e?.message || 'Could not load the numbers.');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const people = useMemo(() => groupAttemptsByPerson(attempts), [attempts]);
  const openPeople = useMemo(() => people.filter((p) => !isDone(p)), [people]);
  const donePeople = useMemo(() => people.filter(isDone), [people]);
  const shown = view === 'open' ? openPeople : donePeople;
  const shownNumbers = shown.reduce((n, p) => n + p.attempts.length, 0);

  const setDone = useCallback(
    async (person: Person, done: boolean) => {
      const anonymousId = person.userId ? null : person.attempts[0]?.anonymous_id ?? null;
      setSaving(person.key);
      try {
        const res = await fetch('/api/phone-attempts/done', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: person.userId, anonymousId, done }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not save that. Try again.');
        const stamp = done ? new Date().toISOString() : null;
        const ids = new Set(person.attempts.map((a) => a.id));
        setAttempts((rows) => rows.map((r) => (ids.has(r.id) ? { ...r, handled_at: stamp } : r)));
        setToast(done ? { message: 'Marked done.', undo: person } : { message: 'Back on the to-call list.' });
        refreshBadges(true);
      } catch (e: any) {
        setToast({ message: e?.message || 'Could not save that. Try again.', error: true });
      } finally {
        setSaving(null);
      }
    },
    [refreshBadges],
  );

  return (
    <Box sx={{ maxWidth: 960 }}>
      <OpsPageHeader
        icon={PhoneMissedOutlinedIcon}
        title="Stuck at phone sign-in"
        subtitle="People who asked for a phone OTP and verified no number, with the likely reason. Call or WhatsApp them to help them finish."
        actions={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={days}
              onChange={(_, v) => v && setDays(v)}
              aria-label="How far back"
            >
              {DAY_CHOICES.map((d) => (
                <ToggleButton key={d} value={d} sx={{ ...TARGET_44, px: 1.5, textTransform: 'none', ...FOCUS_RING }}>
                  Last {d} days
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={load}
              disabled={loading}
              sx={{ ...TARGET_44, textTransform: 'none', ...FOCUS_RING }}
            >
              Refresh
            </Button>
          </Box>
        }
      />

      <ToggleButtonGroup
        exclusive
        size="small"
        value={view}
        onChange={(_, v) => v && setView(v)}
        aria-label="Which people"
        sx={{ mb: 2 }}
      >
        <ToggleButton value="open" sx={{ ...TARGET_44, px: 2, textTransform: 'none', ...FOCUS_RING }}>
          To call{loading ? '' : ` (${openPeople.length})`}
        </ToggleButton>
        <ToggleButton value="done" sx={{ ...TARGET_44, px: 2, textTransform: 'none', ...FOCUS_RING }}>
          Done{loading ? '' : ` (${donePeople.length})`}
        </ToggleButton>
      </ToggleButtonGroup>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={load}>Try again</Button>}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box aria-busy="true" aria-label="Loading" sx={{ display: 'grid', gap: 1.5 }}>
          {[0, 1, 2].map((i) => (
            <OpsSkeleton key={i} variant="rounded" height={140} />
          ))}
        </Box>
      ) : !error && shown.length === 0 ? (
        <EmptyState
          icon={TaskAltIcon}
          title={view === 'open' ? 'Nobody to call' : 'Nothing marked done'}
          body={
            view === 'open'
              ? `Everyone who asked for a phone OTP in the last ${days} days verified a number, or is marked done.`
              : `People you mark done in the last ${days} days show here.`
          }
        />
      ) : (
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          <Typography variant="body2" color="text.secondary">
            {shown.length} {shown.length === 1 ? 'person' : 'people'}, {shownNumbers} {shownNumbers === 1 ? 'number' : 'numbers'}
          </Typography>
          {shown.map((person) => (
            <PersonCard
              key={person.key}
              person={person}
              done={view === 'done'}
              saving={saving === person.key}
              onDone={(d) => setDone(person, d)}
            />
          ))}
        </Box>
      )}

      <Snackbar
        open={!!toast}
        autoHideDuration={6000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast?.error ? 'error' : 'success'}
          variant="filled"
          onClose={() => setToast(null)}
          action={
            toast?.undo ? (
              <Button
                color="inherit"
                size="small"
                startIcon={<UndoIcon />}
                onClick={() => {
                  const person = toast.undo!;
                  setToast(null);
                  void setDone(person, false);
                }}
                sx={{ ...TARGET_44, textTransform: 'none', fontWeight: 600 }}
              >
                Undo
              </Button>
            ) : undefined
          }
        >
          {toast?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

function PersonCard({
  person,
  done,
  saving,
  onDone,
}: {
  person: Person;
  done: boolean;
  saving: boolean;
  onDone: (done: boolean) => void;
}) {
  const user = person.attempts[0]?.user ?? null;
  const diagnosis = diagnosePerson(person.attempts);
  const style = KIND_STYLE[diagnosis.kind];
  const name = user ? user.name || user.email || 'Unnamed account' : 'Visitor, no account yet';

  return (
    <Paper variant="outlined" component="article" aria-label={name} sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, minWidth: 0, flexWrap: 'wrap' }}>
        <PersonOutlineIcon sx={{ fontSize: 20, color: 'text.secondary' }} aria-hidden />
        {user ? (
          <Typography
            component={Link}
            href={`/crm/${user.id}?from=phone-sign-in`}
            variant="subtitle2"
            sx={{ color: 'primary.main', fontWeight: 600, ...FOCUS_RING, overflowWrap: 'anywhere' }}
          >
            {name}
          </Typography>
        ) : (
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {name}
          </Typography>
        )}
        <StatusChip icon={style.icon} label={STUCK_KIND_LABEL[diagnosis.kind]} tone={style.tone} />
        <Box sx={{ flex: 1 }} />
        <Button
          variant={done ? 'text' : 'outlined'}
          size="small"
          startIcon={done ? <UndoIcon /> : <CheckIcon />}
          onClick={() => onDone(!done)}
          disabled={saving}
          aria-busy={saving}
          sx={{ ...TARGET_44, textTransform: 'none', fontWeight: 600, ...FOCUS_RING }}
        >
          {saving ? 'Saving...' : done ? 'Back to call' : 'Mark done'}
        </Button>
      </Box>

      <Box sx={{ mb: 1.5, pl: { sm: 3.5 } }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {diagnosis.reason}
        </Typography>
        {diagnosis.hint && (
          <Typography variant="body2" color="text.secondary">
            {diagnosis.hint}
          </Typography>
        )}
      </Box>

      <PhoneNumberList numbers={person.attempts} showSteps />
    </Paper>
  );
}
