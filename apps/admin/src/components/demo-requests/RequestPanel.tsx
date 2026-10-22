'use client';

import { useMemo, useState } from 'react';
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
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import FamilyRestroomIcon from '@mui/icons-material/FamilyRestroom';
import SchoolIcon from '@mui/icons-material/School';
import EditIcon from '@mui/icons-material/Edit';
import {
  DEMO_STATUS_LABELS,
  formatDemoDateTime,
  isOwnLinkDemo,
  formatDemoPreference,
  isJoinOpen,
  googleCalendarUrl,
} from '@neram/database/demo-schedule';
import { formatRupees, formatDueDate } from '@neram/database/fee-plan';
import { OpsSkeleton, FOCUS_RING } from '@/components/ops/OpsUi';
import { INTEREST_LABELS } from '@neram/database/demo-follow-up';
import LogOutcomeDialog from '@/components/follow-ups/LogOutcomeDialog';
import EnrolmentLinkDrawer from '@/components/direct-enrollment/EnrolmentLinkDrawer';
import EnrolmentLinkStatus, { linkMoneyLine } from './EnrolmentLinkStatus';
import FinaliseEnrolmentDialog from './FinaliseEnrolmentDialog';
import RecordEnrolmentDialog from './RecordEnrolmentDialog';
import { useAdminProfile } from '@/contexts/AdminProfileContext';
import AttendedDialog from './AttendedDialog';
import HeldDemoDialog from './HeldDemoDialog';
import EditDetailsDialog from './EditDetailsDialog';
import CreateTeamsMeetingDialog from './CreateTeamsMeetingDialog';
import EditHeldDemoDialog from './EditHeldDemoDialog';
import { heldTutorOptions } from '@/lib/demo/staff-add';
import { meetingKindOf } from '@/lib/demo/meeting';
import { closedReason, linkIsReallyPaid, linkIsUnfinalisedRecorded } from './journey';
import ScheduleDialog, { type ScheduleSubmit } from './ScheduleDialog';
import TeamsEvidence from './TeamsEvidence';
import { guestsWhoJoined, hasLiveTeamsMeeting, type DemoWithTeams } from '@/lib/demo/teams-evidence';
import type { DeskDetail, DeskSettings, DemoRequest } from './types';
import { ago, classLabel, prettyPhone, telHref, waHref } from './format';

/** Page codes the demo booking stores for its entry points (marketing DemoBookingCard). */
const DEMO_DOOR: Record<string, string> = {
  'DC-APL': 'From application (Not sure yet link)',
  'DC-APH': 'From application (Help menu)',
  'DC-APX': 'From application (leaving card)',
  'DC-WAN': 'From application (WhatsApp nudge)',
  'DC-ADM': 'Added by staff',
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

/**
 * What the enrolled student owes and has paid, from the live fee ledger: the
 * agreed total, what arrived, the balance, the installment schedule and the next
 * due line. Shown for an enrolled or part-paid student so staff see the money
 * without leaving the desk.
 */
function FeeSummary({ fee }: { fee: NonNullable<DeskDetail['fee']> }) {
  const balance = fee.balance;
  const fullyPaid = balance !== null && balance <= 0.01 && fee.paidTotal > 0;
  const schedule = fee.installments.filter((i) => !i.waived);
  return (
    <>
      <SectionTitle>Fee</SectionTitle>
      <Row label="Agreed">
        <Typography variant="body2">{fee.agreed !== null ? formatRupees(fee.agreed) : 'Not set'}</Typography>
      </Row>
      <Row label="Paid">
        <Typography variant="body2" color="success.dark" fontWeight={700}>
          {formatRupees(fee.paidTotal)}
        </Typography>
      </Row>
      <Row label="Balance">
        <Typography variant="body2" fontWeight={700} color={fullyPaid ? 'success.dark' : balance && balance > 0 ? 'warning.dark' : 'text.primary'}>
          {balance === null ? 'Not set' : fullyPaid ? 'Fully paid' : formatRupees(balance)}
        </Typography>
      </Row>
      {schedule.length > 0 && (
        <Row label="Installments">
          <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
            {schedule.map((i) => {
              const isNext = !fullyPaid && fee.nextDue?.installmentId === i.id;
              return (
                <Box component="li" key={i.id} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'baseline', py: 0.25 }}>
                  <Typography variant="body2" sx={{ fontWeight: isNext ? 700 : 400 }}>
                    {i.number}. {formatRupees(i.amount)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    due {formatDueDate(i.dueDate)}
                  </Typography>
                  <Chip
                    size="small"
                    variant="outlined"
                    color={i.settled ? 'success' : isNext ? 'warning' : 'default'}
                    label={i.settled ? 'Paid' : isNext ? 'Next due' : 'Due'}
                    sx={{ height: 20, fontSize: 11 }}
                  />
                </Box>
              );
            })}
          </Box>
        </Row>
      )}
      {!fullyPaid && fee.nextDue && (
        <Typography variant="body2" color="warning.dark" fontWeight={600} sx={{ mt: 0.5 }}>
          Next due: {formatRupees(fee.nextDue.amount)}
          {fee.nextDue.dueDate ? ` by ${formatDueDate(fee.nextDue.dueDate)}` : ''}
        </Typography>
      )}
    </>
  );
}

export default function RequestPanel({
  detail,
  loading,
  settings,
  now,
  onAction,
  onClose,
  onOpenRequest,
  related = [],
  currentId = null,
  openConfirm = false,
}: {
  detail: DeskDetail | null;
  loading: boolean;
  settings: DeskSettings;
  now: Date;
  onAction: (body: Record<string, unknown>) => Promise<string | null>;
  onClose: () => void;
  /** Open another request of the same student. */
  onOpenRequest?: (id: string) => void;
  /** The student's other requests (earlier ones, or the current one when an old one is open). */
  related?: DemoRequest[];
  /** The request the desk works on for this student. */
  currentId?: string | null;
  /** Open Confirm straight away (a staff-added request with a time already agreed). */
  openConfirm?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [callNote, setCallNote] = useState('');
  const [callbackAt, setCallbackAt] = useState('');
  const [note, setNote] = useState('');
  const [schedule, setSchedule] = useState<'confirm' | 'reschedule' | null>(openConfirm ? 'confirm' : null);
  const [reasonFor, setReasonFor] = useState<'cancel' | null>(null);
  const [reason, setReason] = useState('');
  const [copied, setCopied] = useState(false);
  const [attendedOpen, setAttendedOpen] = useState(false);
  // Opened to correct an automatic No-show: mark Attended rather than only start a follow-up.
  const [attendedFix, setAttendedFix] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [finaliseOpen, setFinaliseOpen] = useState(false);
  const [recordEnrolOpen, setRecordEnrolOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [createTeamsOpen, setCreateTeamsOpen] = useState(false);
  const [editHeldOpen, setEditHeldOpen] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  // What the last Verify or Reject did ("Enrolled as NC-2026-0123, ..."), kept after the panel refreshes.
  const [paymentNote, setPaymentNote] = useState<{ kind: 'verify' | 'reject'; text: string; linkId: string } | null>(null);
  const { supabaseUserId } = useAdminProfile();
  const linkReq = detail?.request;
  const linkPrefill = useMemo(
    () =>
      linkReq
        ? {
            studentName: linkReq.name,
            studentPhone: linkReq.phone,
            studentEmail: linkReq.email || undefined,
            userId: linkReq.user_id || undefined,
            demoRegistrationId: linkReq.id,
          }
        : undefined,
    [linkReq?.name, linkReq?.phone, linkReq?.email, linkReq?.user_id, linkReq?.id], // eslint-disable-line react-hooks/exhaustive-deps
  );

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
  const nameOf = (upn: string | null) => (upn ? settings.hosts.find((h) => h.upn.toLowerCase() === upn.toLowerCase())?.name || upn : 'someone');
  const start = r.scheduled_start ? new Date(r.scheduled_start) : null;
  const joinOpen = start ? isJoinOpen(start, r.scheduled_minutes, now) : false;
  // From 15 minutes before the start, or earlier once Teams shows a guest joined (a demo held early).
  const teamsGuests = guestsWhoJoined((r as DemoWithTeams).teams_attendance);
  const canMarkAttendance = start ? now.getTime() >= start.getTime() - 15 * 60_000 || teamsGuests.length > 0 : false;
  const ownLink = isOwnLinkDemo(r);
  const meetingKind = meetingKindOf(r);
  const lastFollowUp = detail.lastFollowUp ?? null;
  const followUpStopped = !detail.followUp && lastFollowUp?.status === 'completed';
  const linkOk = /^https:\/\/\S+\.\S+/.test(linkInput.trim());
  // Confirm always sets an organizer; a demo recorded as held outside the desk has none.
  const heldOutside = !r.organizer_upn;
  const parentAccount = r.account_holder === 'parent';
  // After the demo and not yet enrolled: offer "Record enrolment" to log the fee a
  // student already paid (historical or held-outside demos) and move them to Enrolled.
  // A link with a recorded payment waiting to be finalised uses "Finalise enrolment".
  const canRecordEnrolment =
    ['attended', 'no_show'].includes(r.status) &&
    detail.enrolmentLink?.status !== 'used' &&
    !linkIsUnfinalisedRecorded(detail.enrolmentLink ?? null);

  const onPaymentDecided = (decision: 'verify' | 'reject', text: string) => {
    if (detail.enrolmentLink) setPaymentNote({ kind: decision, text, linkId: detail.enrolmentLink.id });
    // The note refreshes the panel, so the link shows its new state.
    onAction({ action: 'note', note: decision === 'verify' ? `Payment verified. ${text}` : `${text}` }).then((err) => {
      if (err) setError(err);
    });
  };

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

  // A ready-to-send WhatsApp message with the time, the join link and an
  // "add to calendar" link, for when the student has no email (or to send by hand).
  const copyInvite = async () => {
    if (!start) return;
    const first = r.name.trim().split(/\s+/)[0] || r.name;
    const joinUrl = r.teams_join_url || '';
    const gcal = googleCalendarUrl({
      title: 'Neram demo class',
      details: `Your free Neram Classes demo${r.ref_code ? ` (${r.ref_code})` : ''}.`,
      start,
      minutes: r.scheduled_minutes,
      url: joinUrl || 'https://neramclasses.com',
      uid: r.ref_code || r.id,
    });
    const msg =
      `Hi ${first}, your free Neram demo class is on ${formatDemoDateTime(start)}.` +
      (joinUrl ? `\nJoin: ${joinUrl}` : '') +
      `\nAdd it to your calendar: ${gcal}`;
    try {
      await navigator.clipboard.writeText(msg);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 1500);
    } catch {
      // Clipboard blocked.
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
            {parentAccount && (
              <Chip size="small" variant="outlined" icon={<FamilyRestroomIcon />} label="Parent's account" />
            )}
            <Typography variant="body2" color="text.secondary">
              {r.ref_code} · requested {ago(r.created_at, now)}
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.25 }}>
            {detail.createdByName
              ? `Added by ${detail.createdByName}`
              : r.page_code === 'DC-ADM'
                ? 'Added by staff'
                : 'From the website'}
            {detail.lastEditedByName && r.last_edited_at
              ? ` · Last edited by ${detail.lastEditedByName}, ${ago(r.last_edited_at, now)}`
              : ''}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          {active || ['attended', 'no_show'].includes(r.status) ? (
            <Tooltip title="Edit details">
              <IconButton onClick={() => setEditOpen(true)} aria-label="Edit demo details" disabled={!!busy} sx={{ width: 44, height: 44 }}>
                <EditIcon />
              </IconButton>
            </Tooltip>
          ) : null}
          <IconButton onClick={onClose} aria-label="Close details" sx={{ width: 44, height: 44 }}>
            <CloseIcon />
          </IconButton>
        </Box>
      </Box>

      {currentId && currentId !== r.id && (
        <Alert
          severity="info"
          sx={{ mt: 2 }}
          action={
            onOpenRequest && (
              <Button color="inherit" onClick={() => onOpenRequest(currentId)} sx={{ minHeight: 44 }}>
                Open current
              </Button>
            )
          }
        >
          This is an earlier request. The desk works on their newest one.
        </Alert>
      )}

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
            {heldOutside ? (
              `Held outside the desk${r.tutor_upn ? `, taken by ${nameOf(r.tutor_upn)}` : ''}. See the activity log for where.`
            ) : (
              <>
                {r.scheduled_minutes} min. Tutor {nameOf(r.tutor_upn || r.organizer_upn)}
                {meetingKind === 'teams'
                  ? `, on ${nameOf(r.organizer_upn)}'s calendar`
                  : meetingKind === 'own_link'
                    ? ', on your own meeting link'
                    : meetingKind === 'later'
                      ? ', meeting link not added yet'
                      : ', in person'}
                {r.staff_upns?.length ? `. Team: ${r.staff_upns.map(nameOf).join(', ')}` : ''}
                {r.schedule_change_reason ? `. Told the student: ${r.schedule_change_reason}` : ''}
              </>
            )}
          </Typography>
          {heldOutside && ['attended', 'no_show'].includes(r.status) && (
            <Button size="small" startIcon={<EditIcon />} onClick={() => setEditHeldOpen(true)} disabled={!!busy} sx={{ mt: 1, minHeight: 40 }}>
              Fix time or who took it
            </Button>
          )}
          {r.status === 'approved' && meetingKind !== 'teams' && (
            <Box sx={{ mt: 1.5 }}>
              <Button
                variant="contained"
                color="success"
                startIcon={<VideocamIcon />}
                onClick={() => setCreateTeamsOpen(true)}
                disabled={!!busy}
                sx={{ minHeight: 44 }}
              >
                Create Teams meeting
              </Button>
              <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
                Records automatically and invites the team and the student&apos;s calendar.
              </Typography>
            </Box>
          )}
          {r.status === 'approved' && meetingKind !== 'teams' && (
            <Alert severity={meetingKind === 'later' ? 'warning' : 'info'} sx={{ mt: 1.5 }}>
              {meetingKind === 'later'
                ? 'No meeting link yet. Add it below when you have it, then send it to the student.'
                : meetingKind === 'in_person'
                  ? 'In person, no link needed. The student gets no automatic WhatsApp, so confirm the time and place yourself.'
                  : 'Own meeting link: the student gets no automatic WhatsApp. Send them the link and time yourself.'}
            </Alert>
          )}
          {r.status === 'approved' && (meetingKind === 'later' || meetingKind === 'own_link') && (
            <Box sx={{ display: 'flex', gap: 1, mt: 1.5, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <TextField
                label={meetingKind === 'later' ? 'Meeting link' : 'Change meeting link'}
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                placeholder="https://meet.google.com/..."
                size="small"
                type="url"
                error={!!linkInput.trim() && !linkOk}
                helperText={linkInput.trim() && !linkOk ? 'Paste the full link, starting with https://' : ' '}
                sx={{ flex: 1, minWidth: 220 }}
              />
              <Button
                variant="outlined"
                disabled={!linkOk || !!busy}
                onClick={async () => {
                  const err = await run('set_link', { action: 'set_link', joinUrl: linkInput.trim() });
                  if (!err) setLinkInput('');
                }}
                sx={{ minHeight: 40 }}
              >
                {busy === 'set_link' ? 'Saving' : 'Save link'}
              </Button>
            </Box>
          )}
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
              <Button startIcon={<ContentCopyIcon />} onClick={copyInvite} disabled={!!busy} sx={{ minHeight: 44 }}>
                {copiedInvite ? 'Copied' : 'Copy invite message'}
              </Button>
              {meetingKind !== 'teams' ? (
                <Button
                  color="success"
                  startIcon={<WhatsAppIcon />}
                  href={waHref(
                    r.phone,
                    `Hi ${r.name.split(' ')[0]}, your free Neram demo class is on ${start ? formatDemoDateTime(start) : ''}.` +
                      (r.teams_join_url ? ` Join here: ${r.teams_join_url}` : meetingKind === 'in_person' ? ' See you at the centre.' : ' We will send the link before the class.'),
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ minHeight: 44 }}
                >
                  {r.teams_join_url ? 'Send link on WhatsApp' : 'Send details on WhatsApp'}
                </Button>
              ) : (
                <Button onClick={() => run('resend', { action: 'resend' })} disabled={!!busy} startIcon={<SendIcon />} sx={{ minHeight: 44 }}>
                  {busy === 'resend' ? 'Sending' : 'Resend WhatsApp'}
                </Button>
              )}
              <Button color="error" onClick={() => setReasonFor('cancel')} disabled={!!busy} sx={{ minHeight: 44 }}>
                Cancel demo
              </Button>
            </Box>
          )}
          {r.status === 'attended' && !detail.followUp && r.user_id && (
            <Box sx={{ mt: 1 }}>
              <EnrolmentLinkStatus
                link={detail.enrolmentLink}
                disabled={!supabaseUserId}
                onOpen={() => setLinkOpen(true)}
                onFinalise={() => setFinaliseOpen(true)}
                adminId={supabaseUserId}
                onPaymentDecided={onPaymentDecided}
                notice={paymentNote && paymentNote.linkId === detail.enrolmentLink?.id ? paymentNote : null}
                onDismissNotice={() => setPaymentNote(null)}
              />
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
                    onClick={() => setAttendedOpen(true)}
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
              <Button startIcon={<EventAvailableIcon />} onClick={() => setHeldOpen(true)} disabled={!!busy} sx={{ minHeight: 44 }}>
                Held at another time
              </Button>
            </Box>
          )}
        </Paper>
      )}

      {['approved', 'attended', 'no_show'].includes(r.status) && hasLiveTeamsMeeting(r) && (
        <TeamsEvidence
          r={r as DemoWithTeams}
          now={now}
          busy={busy}
          onCheck={() => run('teams_check', { action: 'teams_check' })}
          onMarkAttended={() => {
            setAttendedFix(true);
            setAttendedOpen(true);
          }}
          onMarkNoShow={() => run('attendance', { action: 'attendance', attended: false })}
          onPick={(itemId) => run(`pick:${itemId}`, { action: 'pick_recording', itemId })}
        />
      )}

      {/* Fee: the enrolled student's money, from the live ledger. */}
      {detail.fee && (detail.fee.agreed !== null || detail.fee.paidTotal > 0) && <FeeSummary fee={detail.fee} />}

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
            <Button variant="outlined" startIcon={<EventAvailableIcon />} onClick={() => setHeldOpen(true)} disabled={!!busy} sx={{ minHeight: 44 }}>
              Demo already held
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
          {['attended', 'no_show'].includes(r.status) && !detail.followUp && (
            <>
              <SectionTitle>After the demo</SectionTitle>
              <Typography variant="body2" color="text.secondary">
                {followUpStopped
                  ? lastFollowUp?.call_outcome === 'joined'
                    ? linkIsReallyPaid(detail.enrolmentLink)
                      ? 'Follow-up closed: they enrolled.'
                      : linkIsUnfinalisedRecorded(detail.enrolmentLink)
                        ? `${linkMoneyLine(detail.enrolmentLink!)} entered on the enrolment link but not finalised. Finalise to enrol them.`
                        : 'They said they would join, but no fee is recorded yet. Record the payment or send the enrolment link to enrol them.'
                    : `${closedReason(r, lastFollowUp)}.`
                  : 'No follow-up yet. Start one so this student is called until they join or say no.'}
              </Typography>
              {linkIsUnfinalisedRecorded(detail.enrolmentLink) && (
                <Button variant="contained" startIcon={<SchoolIcon />} onClick={() => setFinaliseOpen(true)} disabled={!!busy} sx={{ mt: 1, mr: 1, minHeight: 44 }}>
                  Finalise enrolment
                </Button>
              )}
              {canRecordEnrolment && (
                <Button variant="contained" startIcon={<SchoolIcon />} onClick={() => setRecordEnrolOpen(true)} disabled={!!busy} sx={{ mt: 1, mr: 1, minHeight: 44 }}>
                  Record enrolment
                </Button>
              )}
              <Button variant={followUpStopped ? 'outlined' : 'contained'} onClick={() => setAttendedOpen(true)} disabled={!!busy} sx={{ mt: 1, mr: 1, minHeight: 44 }}>
                {followUpStopped ? 'Restart follow-up' : 'Start follow-up'}
              </Button>
            </>
          )}
          {['rejected', 'cancelled', 'no_show'].includes(r.status) && (
            <Button startIcon={<ReplayIcon />} onClick={() => run('reopen', { action: 'reopen' })} disabled={!!busy} sx={{ mt: 1, minHeight: 44 }}>
              Reopen and call again
            </Button>
          )}
        </Box>
      )}

      {detail.followUp && (
        <Box sx={{ mt: 2 }}>
          <SectionTitle>After the demo</SectionTitle>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            {detail.followUp.interest_level && (
              <Chip
                size="small"
                label={INTEREST_LABELS[detail.followUp.interest_level]}
                color={detail.followUp.interest_level === 'hot' ? 'error' : detail.followUp.interest_level === 'warm' ? 'warning' : 'default'}
              />
            )}
            <Typography variant="body2">
              Next follow-up{' '}
              {detail.followUp.scheduled_callback_at ? formatDemoDateTime(new Date(detail.followUp.scheduled_callback_at)) : 'not set'}
            </Typography>
          </Box>
          {detail.followUp.notes && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {detail.followUp.notes}
            </Typography>
          )}
          <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
            <Button variant="outlined" onClick={() => setLogOpen(true)} sx={{ minHeight: 44 }}>
              Log outcome
            </Button>
            <Button color="error" onClick={() => setStopOpen(true)} sx={{ minHeight: 44 }}>
              Stop follow-up
            </Button>
          </Box>
          {r.user_id && (
            <Box sx={{ mt: 1 }}>
              <EnrolmentLinkStatus
                link={detail.enrolmentLink}
                disabled={!supabaseUserId}
                onOpen={() => setLinkOpen(true)}
                onFinalise={() => setFinaliseOpen(true)}
                adminId={supabaseUserId}
                onPaymentDecided={onPaymentDecided}
                notice={paymentNote && paymentNote.linkId === detail.enrolmentLink?.id ? paymentNote : null}
                onDismissNotice={() => setPaymentNote(null)}
              />
            </Box>
          )}
          {canRecordEnrolment && (
            <Box sx={{ mt: 1 }}>
              <Button variant="outlined" startIcon={<SchoolIcon />} onClick={() => setRecordEnrolOpen(true)} disabled={!!busy} sx={{ minHeight: 44 }}>
                Record enrolment
              </Button>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Already paid? Enter the fee and payment to enrol them without sending a link.
              </Typography>
            </Box>
          )}
          <LogOutcomeDialog
            open={logOpen}
            name={r.name}
            callbackId={detail.followUp.id}
            interest={detail.followUp.interest_level}
            onClose={() => setLogOpen(false)}
            onSaved={async () => {
              setLogOpen(false);
              await onAction({ action: 'note', note: 'Follow-up call logged' });
            }}
          />
          <LogOutcomeDialog
            open={stopOpen}
            name={r.name}
            callbackId={detail.followUp.id}
            interest={detail.followUp.interest_level}
            stopMode
            onClose={() => setStopOpen(false)}
            onSaved={async () => {
              setStopOpen(false);
              await onAction({ action: 'note', note: 'Follow-up stopped' });
            }}
          />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {related.length > 0 && (
        <>
          <SectionTitle>{currentId && currentId !== r.id ? 'Other requests' : 'Earlier requests'}</SectionTitle>
          <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
            {related.map((o) => (
              <Box component="li" key={o.id} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', py: 0.25 }}>
                <Button
                  size="small"
                  onClick={() => onOpenRequest?.(o.id)}
                  sx={{ minHeight: 40, px: 1, fontWeight: 700, ...FOCUS_RING }}
                  aria-label={`Open ${o.ref_code}`}
                >
                  {o.ref_code}
                </Button>
                <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 0 }}>
                  {[DEMO_STATUS_LABELS[o.status], closedReason(o, null) || null, `asked ${ago(o.created_at, now)}`]
                    .filter((x, i, a) => x && a.indexOf(x) === i)
                    .join(' · ')}
                </Typography>
              </Box>
            ))}
          </Box>
        </>
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
        {parentAccount && (
          <Typography variant="caption" color="text.secondary" component="p">
            The linked People record is the parent&apos;s account.
          </Typography>
        )}
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
          {[
            classLabel(r.current_class),
            r.exam_year ? `Exam ${r.exam_year}` : null,
            r.interest_course ? INTEREST[r.interest_course] || r.interest_course : null,
            r.preferred_language ? LANG[r.preferred_language] || r.preferred_language : null,
          ]
            .filter(Boolean)
            .join(' · ') || 'Not given'}
        </Typography>
      </Row>
      {r.city && (
        <Row label="City">
          <Typography variant="body2">{r.city}</Typography>
        </Row>
      )}
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
            {r.page_code === 'DC-ADM' ? (
              <>
                <b>Added</b> by staff
              </>
            ) : (
              <>
                <b>Requested</b> on the website
              </>
            )}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {ago(r.created_at, now)}
          </Typography>
        </Box>
      </Box>

      <EnrolmentLinkDrawer
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        adminId={supabaseUserId || ''}
        prefill={linkPrefill}
        linkId={
          detail.enrolmentLink && ['active', 'payment_submitted', 'used'].includes(detail.enrolmentLink.status)
            ? detail.enrolmentLink.id
            : null
        }
        onChanged={(link, change) => {
          // The note goes in the activity log and refreshes the panel's link state.
          const what =
            change === 'created'
              ? 'Enrolment link made'
              : change === 'cancelled'
                ? 'Enrolment link cancelled'
                : change === 'regenerated'
                  ? 'New enrolment link made'
                  : change === 'payment_verified'
                    ? 'Payment verified, student enrolled'
                    : change === 'payment_rejected'
                      ? 'Payment rejected'
                      : 'Enrolment link changed';
          onAction({ action: 'note', note: `${what}: ${linkMoneyLine(link)}.` }).then((err) => {
            if (err) setError(err);
          });
        }}
      />
      {detail.enrolmentLink && (
        <FinaliseEnrolmentDialog
          open={finaliseOpen}
          onClose={() => setFinaliseOpen(false)}
          link={detail.enrolmentLink}
          request={r}
          onSubmit={onAction}
        />
      )}
      <RecordEnrolmentDialog open={recordEnrolOpen} onClose={() => setRecordEnrolOpen(false)} request={r} onSubmit={onAction} />
      <AttendedDialog
        open={attendedOpen}
        name={r.name}
        busy={busy === 'attendance'}
        error={attendedOpen ? error : null}
        onClose={() => {
          setAttendedOpen(false);
          setAttendedFix(false);
          setError(null);
        }}
        onSubmit={async (v) => {
          const mark = r.status === 'approved' || (attendedFix && r.status === 'no_show');
          const err = await run('attendance', { action: mark ? 'attendance' : 'follow_up', attended: true, ...v });
          if (!err) {
            setAttendedOpen(false);
            setAttendedFix(false);
          }
        }}
      />

      <HeldDemoDialog
        open={heldOpen}
        name={r.name}
        confirmed={r.status === 'approved'}
        tutors={heldTutorOptions(settings.hosts)}
        busy={busy === 'held'}
        error={heldOpen ? error : null}
        onClose={() => {
          setHeldOpen(false);
          setError(null);
        }}
        onSubmit={async (body) => {
          const err = await run('held', body);
          if (!err) setHeldOpen(false);
        }}
      />

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

      <EditDetailsDialog
        open={editOpen}
        request={r}
        busy={busy === 'edit'}
        error={editOpen ? error : null}
        onClose={() => {
          setEditOpen(false);
          setError(null);
        }}
        onSubmit={async (body) => {
          const err = await run('edit', body);
          if (!err) setEditOpen(false);
        }}
      />

      <CreateTeamsMeetingDialog
        open={createTeamsOpen}
        request={r}
        settings={settings}
        busy={busy === 'create_teams'}
        error={createTeamsOpen ? error : null}
        onClose={() => {
          setCreateTeamsOpen(false);
          setError(null);
        }}
        onSubmit={async (body) => {
          const err = await run('create_teams', body);
          if (!err) setCreateTeamsOpen(false);
        }}
      />

      <EditHeldDemoDialog
        open={editHeldOpen}
        request={r}
        tutors={heldTutorOptions(settings.hosts)}
        busy={busy === 'edit_held'}
        error={editHeldOpen ? error : null}
        onClose={() => {
          setEditHeldOpen(false);
          setError(null);
        }}
        onSubmit={async (body) => {
          const err = await run('edit_held', body);
          if (!err) setEditHeldOpen(false);
        }}
      />

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
