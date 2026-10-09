'use client';

import { useState } from 'react';
import Link from 'next/link';
import { alpha } from '@mui/material/styles';
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
  Divider,
  FormControlLabel,
  IconButton,
  Paper,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import PhoneIcon from '@mui/icons-material/Phone';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import VideocamIcon from '@mui/icons-material/Videocam';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EventIcon from '@mui/icons-material/Event';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import ReplayIcon from '@mui/icons-material/Replay';
import SendIcon from '@mui/icons-material/Send';
import {
  DEMO_STATUS_LABELS,
  formatDemoDateTime,
  formatDemoPreference,
  isJoinOpen,
} from '@neram/database/demo-schedule';
import { OpsSkeleton, FOCUS_RING } from '@/components/ops/OpsUi';
import ScheduleDialog, { type ScheduleSubmit } from './ScheduleDialog';
import type { DeskDetail, DeskSettings, DemoRequest } from './types';
import { ago, classLabel, prettyPhone, telHref, waHref } from './format';

/** Page codes the demo booking stores for its entry points (marketing DemoBookingCard). */
const DEMO_DOOR: Record<string, string> = {
  'DC-APL': 'From application (Not sure yet link)',
  'DC-APH': 'From application (Help menu)',
  'DC-APX': 'From application (leaving card)',
  'DC-WAN': 'From application (WhatsApp nudge)',
};
const LANG: Record<string, string> = { en: 'English', ta: 'Tamil', kn: 'Kannada', hi: 'Hindi', ml: 'Malayalam', te: 'Telugu' };
const INTEREST: Record<string, string> = { nata: 'NATA', jee_paper2: 'JEE Paper 2', both: 'NATA + JEE Paper 2' };

const STATUS_TONE: Record<DemoRequest['status'], 'default' | 'info' | 'success' | 'warning' | 'error'> = {
  pending: 'warning',
  contacted: 'info',
  approved: 'success',
  attended: 'success',
  no_show: 'error',
  rejected: 'default',
  cancelled: 'default',
};

const MESSAGE_LABEL: Record<string, string> = {
  received: 'Request received',
  confirmed: 'Confirmed',
  reminder_day: 'Morning reminder',
  reminder_soon: '30-min reminder',
  staff_new_request: 'Team: new request',
  staff_callback: 'Team: call back',
  staff_day: 'Team: demo today',
  staff_soon: 'Tutor: starts in 15 min',
  rescheduled: 'Moved',
  cancelled: 'Cancelled',
  thanks: 'Thank you + feedback',
  missed: 'Missed you',
};

const OUTCOME_LABEL: Record<string, string> = {
  interested: 'Interested',
  no_answer: 'No answer',
  call_back: 'Call back later',
  not_interested: 'Not interested',
};

type Outcome = 'interested' | 'no_answer' | 'call_back' | 'not_interested';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 1, py: 0.5, alignItems: 'baseline' }}>
      <Typography variant="caption" color="text.secondary" fontWeight={600}>
        {label}
      </Typography>
      <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{children}</Box>
    </Box>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Typography variant="overline" component="h3" color="text.secondary" sx={{ display: 'block', mt: 2, mb: 0.5, fontWeight: 700 }}>
      {children}
    </Typography>
  );
}

export default function RequestPanel({
  detail,
  loading,
  settings,
  now,
  onAction,
  onClose,
}: {
  detail: DeskDetail | null;
  loading: boolean;
  settings: DeskSettings;
  now: Date;
  onAction: (body: Record<string, unknown>) => Promise<string | null>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [callNote, setCallNote] = useState('');
  const [callbackAt, setCallbackAt] = useState('');
  const [note, setNote] = useState('');
  const [schedule, setSchedule] = useState<'confirm' | 'reschedule' | null>(null);
  const [reasonFor, setReasonFor] = useState<'cancel' | null>(null);
  const [reason, setReason] = useState('');
  const [copied, setCopied] = useState(false);

  if (loading && !detail) {
    return (
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }} aria-busy>
        <OpsSkeleton variant="text" width="60%" height={32} />
        <OpsSkeleton variant="text" width="40%" />
        <OpsSkeleton variant="rounded" height={120} sx={{ mt: 2 }} />
        <OpsSkeleton variant="rounded" height={160} sx={{ mt: 2 }} />
      </Paper>
    );
  }
  if (!detail) return null;

  const r = detail.request;
  const nameOf = (upn: string | null) => (upn ? settings.hosts.find((h) => h.upn === upn.toLowerCase())?.name || upn : 'someone');
  const start = r.scheduled_start ? new Date(r.scheduled_start) : null;
  const joinOpen = start ? isJoinOpen(start, r.scheduled_minutes, now) : false;
  const canMarkAttendance = start ? now.getTime() >= start.getTime() - 15 * 60_000 : false;

  const run = async (key: string, body: Record<string, unknown>) => {
    setBusy(key);
    setError(null);
    const err = await onAction(body);
    setBusy(null);
    if (err) setError(err);
    return err;
  };

  const submitCall = async () => {
    if (!outcome) return;
    const err = await run('call', {
      action: 'log_call',
      outcome,
      note: callNote,
      nextContactAt: outcome === 'call_back' && callbackAt ? new Date(callbackAt).toISOString() : undefined,
    });
    if (!err) {
      setOutcome(null);
      setCallNote('');
      setCallbackAt('');
    }
  };

  const submitSchedule = async (v: ScheduleSubmit) => {
    const err = await run('schedule', { action: schedule, ...v });
    if (!err) setSchedule(null);
  };

  const copyLink = async () => {
    if (!r.teams_join_url) return;
    try {
      await navigator.clipboard.writeText(r.teams_join_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the link is still visible to select.
    }
  };

  const active = ['pending', 'contacted', 'approved'].includes(r.status);

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 2 }} aria-label={`Demo request ${r.ref_code}`}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" component="h2" fontWeight={700} sx={{ lineHeight: 1.3 }}>
            {r.name}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mt: 0.5 }}>
            <Chip size="small" color={STATUS_TONE[r.status]} label={DEMO_STATUS_LABELS[r.status]} />
            <Typography variant="body2" color="text.secondary">
              {r.ref_code} · requested {ago(r.created_at, now)}
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} aria-label="Close details" sx={{ width: 44, height: 44 }}>
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Confirmed demo */}
      {start && ['approved', 'attended', 'no_show'].includes(r.status) && (
        <Paper
          variant="outlined"
          sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: (t) => (r.status === 'approved' ? alpha(t.palette.success.main, 0.06) : t.palette.action.hover), borderColor: r.status === 'approved' ? 'success.light' : 'divider' }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <EventIcon aria-hidden color={r.status === 'approved' ? 'success' : 'disabled'} />
            <Typography fontWeight={700}>{formatDemoDateTime(start)}</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {r.scheduled_minutes} min. Tutor {nameOf(r.tutor_upn || r.organizer_upn)}, on {nameOf(r.organizer_upn)}&apos;s calendar
            {r.staff_upns?.length ? `. Team: ${r.staff_upns.map(nameOf).join(', ')}` : ''}
            {r.schedule_change_reason ? `. Told the student: ${r.schedule_change_reason}` : ''}
          </Typography>
          {r.status === 'approved' && r.teams_join_url && (
            <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
              <Button
                variant={joinOpen ? 'contained' : 'outlined'}
                color="success"
                startIcon={<VideocamIcon />}
                href={r.teams_join_url}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ minHeight: 44 }}
              >
                {joinOpen ? 'Join now' : 'Join'}
              </Button>
              <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={copyLink} sx={{ minHeight: 44 }}>
                {copied ? 'Copied' : 'Copy link'}
              </Button>
            </Box>
          )}
          {r.status === 'approved' && (
            <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
              <Button onClick={() => setSchedule('reschedule')} disabled={!!busy} sx={{ minHeight: 44 }}>
                Move
              </Button>
              <Button onClick={() => run('resend', { action: 'resend' })} disabled={!!busy} startIcon={<SendIcon />} sx={{ minHeight: 44 }}>
                {busy === 'resend' ? 'Sending' : 'Resend WhatsApp'}
              </Button>
              <Button color="error" onClick={() => setReasonFor('cancel')} disabled={!!busy} sx={{ minHeight: 44 }}>
                Cancel demo
              </Button>
            </Box>
          )}
          {r.status === 'approved' && (
            <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Tooltip title={canMarkAttendance ? '' : 'Available from 15 minutes before the start'}>
                <span>
                  <Button
                    variant="outlined"
                    color="success"
                    startIcon={<HowToRegIcon />}
                    disabled={!canMarkAttendance || !!busy}
                    onClick={() => run('attendance', { action: 'attendance', attended: true })}
                    sx={{ minHeight: 44 }}
                  >
                    Attended
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title={canMarkAttendance ? '' : 'Available from 15 minutes before the start'}>
                <span>
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<PersonOffIcon />}
                    disabled={!canMarkAttendance || !!busy}
                    onClick={() => run('attendance', { action: 'attendance', attended: false })}
                    sx={{ minHeight: 44 }}
                  >
                    No-show
                  </Button>
                </span>
              </Tooltip>
            </Box>
          )}
        </Paper>
      )}

      {/* Not yet confirmed: call, then confirm */}
      {(r.status === 'pending' || r.status === 'contacted') && (
        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="contained" startIcon={<PhoneIcon />} href={telHref(r.phone)} sx={{ minHeight: 44 }}>
              Call {prettyPhone(r.phone)}
            </Button>
            <Button
              variant="outlined"
              color="success"
              startIcon={<WhatsAppIcon />}
              href={waHref(r.phone, `Hi ${r.name.split(' ')[0]}, this is Neram Classes about your free demo class request (${r.ref_code}).`)}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ minHeight: 44 }}
            >
              WhatsApp
            </Button>
          </Box>
          <Typography variant="body2" sx={{ mt: 1.5 }}>
            Asked for: <b>{formatDemoPreference(r.preferred_date, r.preferred_window, settings.schedule)}</b>
          </Typography>
          {r.last_call_outcome && (
            <Typography variant="body2" color="text.secondary">
              Last call: {OUTCOME_LABEL[r.last_call_outcome]}
              {r.next_contact_at
                ? `, call back ${new Date(r.next_contact_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`
                : ''}
            </Typography>
          )}

          <SectionTitle>Log the call</SectionTitle>
          <ToggleButtonGroup
            exclusive
            value={outcome}
            onChange={(_, v) => setOutcome(v)}
            aria-label="Call outcome"
            sx={{ flexWrap: 'wrap', gap: 1, '& .MuiToggleButton-root': { minHeight: 44, border: 1, borderColor: 'divider', borderRadius: '8px !important', textTransform: 'none' } }}
          >
            {(Object.keys(OUTCOME_LABEL) as Outcome[]).map((o) => (
              <ToggleButton key={o} value={o}>
                {OUTCOME_LABEL[o]}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          {outcome && (
            <Box sx={{ mt: 1.5, display: 'grid', gap: 1.5 }}>
              {outcome === 'call_back' && (
                <TextField
                  label="Call back at"
                  type="datetime-local"
                  value={callbackAt}
                  onChange={(e) => setCallbackAt(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  required
                />
              )}
              <TextField
                label={outcome === 'not_interested' ? 'Why not? (required)' : 'Note (optional)'}
                value={callNote}
                onChange={(e) => setCallNote(e.target.value)}
                multiline
                minRows={2}
                inputProps={{ maxLength: 500 }}
              />
              <Box>
                <Button
                  variant="contained"
                  onClick={submitCall}
                  disabled={!!busy || (outcome === 'call_back' && !callbackAt) || (outcome === 'not_interested' && !callNote.trim())}
                  startIcon={busy === 'call' ? <CircularProgress size={16} color="inherit" /> : undefined}
                  sx={{ minHeight: 44 }}
                >
                  Save call
                </Button>
              </Box>
            </Box>
          )}

          <Divider sx={{ my: 2 }} />
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="contained" color="success" startIcon={<EventIcon />} onClick={() => setSchedule('confirm')} sx={{ minHeight: 44 }}>
              Confirm demo
            </Button>
            <Button onClick={() => run('resend', { action: 'resend' })} disabled={!!busy} sx={{ minHeight: 44 }}>
              {busy === 'resend' ? 'Sending' : 'Resend "request received"'}
            </Button>
            <Button color="error" onClick={() => setReasonFor('cancel')} disabled={!!busy} sx={{ minHeight: 44 }}>
              Close request
            </Button>
          </Box>
        </Box>
      )}

      {!active && (
        <Box sx={{ mt: 2 }}>
          {r.status === 'rejected' && r.rejection_reason && <Typography variant="body2">Reason: {r.rejection_reason}</Typography>}
          {r.status === 'cancelled' && r.cancel_reason && <Typography variant="body2">Reason: {r.cancel_reason}</Typography>}
          {['rejected', 'cancelled', 'no_show'].includes(r.status) && (
            <Button startIcon={<ReplayIcon />} onClick={() => run('reopen', { action: 'reopen' })} disabled={!!busy} sx={{ mt: 1, minHeight: 44 }}>
              Reopen and call again
            </Button>
          )}
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <SectionTitle>Contact</SectionTitle>
      <Row label="Phone">
        <Typography variant="body2">{prettyPhone(r.phone)}</Typography>
      </Row>
      {r.email && (
        <Row label="Email">
          <Typography variant="body2">{r.email}</Typography>
        </Row>
      )}
      <Row label="Parent">
        <Typography variant="body2">
          {r.parent_joining ? 'Joining' : 'Not joining'}
          {r.parent_name ? `, ${r.parent_name}` : ''}
        </Typography>
        {r.parent_phone && (
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            <Typography variant="body2">{prettyPhone(r.parent_phone)}</Typography>
            <IconButton component="a" href={telHref(r.parent_phone)} aria-label="Call parent" sx={{ width: 44, height: 44 }}>
              <PhoneIcon fontSize="small" />
            </IconButton>
            <IconButton
              component="a"
              href={waHref(r.parent_phone)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp parent"
              sx={{ width: 44, height: 44, color: 'success.main' }}
            >
              <WhatsAppIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
        {r.parent_email && <Typography variant="body2">{r.parent_email}</Typography>}
      </Row>
      <Row label="Student">
        <Typography variant="body2">
          {[classLabel(r.current_class), r.interest_course ? INTEREST[r.interest_course] || r.interest_course : null, r.preferred_language ? LANG[r.preferred_language] || r.preferred_language : null]
            .filter(Boolean)
            .join(' · ') || 'Not given'}
        </Typography>
      </Row>
      <Row label="Came from">
        <Typography variant="body2">
          {[r.page_code ? DEMO_DOOR[r.page_code] : null, r.channel, r.utm_source, r.utm_campaign].filter(Boolean).join(' · ') || 'Direct'}
        </Typography>
      </Row>
      {r.user_id && (
        <Button
          component={Link}
          href={`/crm/${r.user_id}`}
          endIcon={<OpenInNewIcon fontSize="small" />}
          sx={{ mt: 0.5, minHeight: 44, ...FOCUS_RING }}
        >
          Open in People
        </Button>
      )}

      <SectionTitle>Drawing feedback</SectionTitle>
      <Typography variant="body2" color="text.secondary">
        Students send drawings on WhatsApp with their ref ({r.ref_code}). Tick when it arrives and when your feedback is sent.
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 0.5 }}>
        <FormControlLabel
          control={
            <Switch
              checked={!!r.drawing_received_at}
              disabled={!!busy}
              onChange={(e) => run('drawing', { action: 'drawing', field: 'received', value: e.target.checked })}
            />
          }
          label="Drawing received"
          sx={{ minHeight: 44 }}
        />
        <FormControlLabel
          control={
            <Switch
              checked={!!r.drawing_feedback_at}
              disabled={!!busy || !r.drawing_received_at}
              onChange={(e) => run('drawing', { action: 'drawing', field: 'feedback', value: e.target.checked })}
            />
          }
          label="Feedback sent"
          sx={{ minHeight: 44 }}
        />
      </Box>

      <SectionTitle>Messages and reminders</SectionTitle>
      {detail.messages.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          None queued.
        </Typography>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {detail.messages.map((m) => (
            <Box component="li" key={m.id} sx={{ display: 'flex', gap: 1, alignItems: 'baseline', py: 0.5, flexWrap: 'wrap' }}>
              <Typography variant="body2" sx={{ minWidth: 150 }}>
                {MESSAGE_LABEL[m.kind] || m.kind}{' '}
                <Typography component="span" variant="caption" color="text.secondary">
                  {m.channel === 'assistant' ? 'Neram Assistant' : `WhatsApp to ${m.recipient}`}
                </Typography>
              </Typography>
              <Chip
                size="small"
                variant="outlined"
                color={m.status === 'sent' ? 'success' : m.status === 'failed' ? 'error' : 'default'}
                label={m.status === 'pending' ? `due ${formatDemoDateTime(new Date(m.send_after))}` : m.status}
              />
              {m.error_message && m.status !== 'sent' && (
                <Typography variant="caption" color={m.status === 'failed' ? 'error.main' : 'text.secondary'} sx={{ width: '100%' }}>
                  {m.error_message}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      )}

      <SectionTitle>Activity</SectionTitle>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <TextField
          label="Add a note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          size="small"
          fullWidth
          multiline
          maxRows={4}
          inputProps={{ maxLength: 2000 }}
        />
        <Button
          variant="outlined"
          disabled={!note.trim() || !!busy}
          onClick={async () => {
            const err = await run('note', { action: 'note', note });
            if (!err) setNote('');
          }}
          sx={{ minHeight: 40 }}
        >
          Add
        </Button>
      </Box>
      <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, mt: 1 }}>
        {detail.events.map((e) => (
          <Box component="li" key={e.id} sx={{ py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="body2">
              <b>{e.kind === 'call' ? `Call: ${OUTCOME_LABEL[e.outcome || ''] || e.outcome}` : e.outcome ? `${e.kind}: ${e.outcome.replace(/_/g, ' ')}` : e.kind}</b>
              {e.note ? `. ${e.note}` : ''}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {ago(e.created_at, now)}
              {e.actor_id && detail.actors[e.actor_id] ? ` by ${detail.actors[e.actor_id]}` : e.actor_id ? '' : ' by system'}
            </Typography>
          </Box>
        ))}
        <Box component="li" sx={{ py: 0.75 }}>
          <Typography variant="body2">
            <b>Requested</b> on the website
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {ago(r.created_at, now)}
          </Typography>
        </Box>
      </Box>

      {schedule && (
        <ScheduleDialog
          open
          mode={schedule}
          request={r}
          settings={settings}
          busy={busy === 'schedule'}
          error={error}
          onClose={() => {
            setSchedule(null);
            setError(null);
          }}
          onSubmit={submitSchedule}
        />
      )}

      <Dialog open={reasonFor === 'cancel'} onClose={() => setReasonFor(null)} fullWidth maxWidth="xs" aria-labelledby="cancel-title">
        <DialogTitle id="cancel-title">{r.status === 'approved' ? 'Cancel this demo?' : 'Close this request?'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {r.status === 'approved'
              ? 'The Teams meeting is cancelled, their calendar is updated and WhatsApp tells them the reason.'
              : 'No message is sent. You can reopen it later.'}
          </Typography>
          <TextField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth required autoFocus inputProps={{ maxLength: 200 }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setReasonFor(null)} sx={{ minHeight: 44 }}>
            Back
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={reason.trim().length < 3 || !!busy}
            sx={{ minHeight: 44 }}
            onClick={async () => {
              const err = await run('cancel', { action: 'cancel', reason });
              if (!err) {
                setReasonFor(null);
                setReason('');
              }
            }}
          >
            {busy === 'cancel' ? 'Saving' : r.status === 'approved' ? 'Cancel demo' : 'Close request'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
