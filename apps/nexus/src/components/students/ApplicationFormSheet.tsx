'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  Drawer,
  Paper,
  Skeleton,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import AlternateEmailOutlinedIcon from '@mui/icons-material/AlternateEmailOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import FamilyRestroomOutlinedIcon from '@mui/icons-material/FamilyRestroomOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import PhoneIphoneOutlinedIcon from '@mui/icons-material/PhoneIphoneOutlined';
import StudentAvatar from './StudentAvatar';
import ApplicationFormDetail from './ApplicationFormDetail';
import { adminCrmUrl } from '@/lib/admin-links';
import { shortDate } from '@/lib/student-roster-view';
import { STAGE_LABEL, stageKeyOf } from '@/lib/student-stage';
import { useNexusSWR } from '@/lib/nexus-swr';
import type {
  DetailRequestView,
  FormCandidateView,
  FormDetailView,
  FormLinkResult,
  StudentFormReview,
} from '@/lib/application-form';

/**
 * The students with no application form on their own record, and the forms on
 * other records that may be theirs.
 *
 * Why it exists: the apply form and the Microsoft account live on two different
 * records for most students, so their class and exam year never reach Nexus. The
 * form is rarely missing; it is unlinked. This sheet is where a person says "yes,
 * that is theirs", and where a teacher sees whom to ask when nothing turns up.
 *
 * Linking merges two records and cannot be undone, so there are two ways to
 * arrive at it and both are deliberate. From the card, a second tap confirms,
 * because the decision was made from four lines of summary. From "View full
 * form", the reviewer has just read the whole thing, so the warning sits above
 * the button and there is no second tap to train them out of reading.
 *
 * ONE OVERLAY, TWO VIEWS. The form opens by swapping this sheet's own content,
 * never by stacking a second Dialog on top: two MUI portals do not nest, they
 * land as siblings and the inner one loses the z-index compare. Back, Escape and
 * a backdrop tap all pop the form first and leave the list where it was.
 */

type Reason = FormCandidateView['reasons'][number];

export const REASON: Record<Reason, { label: string; Icon: React.ElementType }> = {
  phone: { label: 'Same phone number', Icon: PhoneIphoneOutlinedIcon },
  email: { label: 'Same email address', Icon: AlternateEmailOutlinedIcon },
  full_name: { label: 'Same full name', Icon: BadgeOutlinedIcon },
  father_name: { label: "Father's name fits", Icon: FamilyRestroomOutlinedIcon },
};

export const BLOCKED_TEXT: Record<NonNullable<FormCandidateView['blocked']>, string> = {
  other_microsoft_account:
    'That record has its own Microsoft account, so it may be a different student. If it is the same person, merge the two records in Admin.',
  both_fee_records:
    'Both records have a fee record, and linking here keeps only one. Merge them in Admin instead.',
};

export interface ApplicationFormSheetProps {
  open: boolean;
  classroomId: string;
  /** Only this student, when the sheet is opened from their row. */
  studentId?: string | null;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  /** A form was linked or rejected, so the roster and its counts are out of date. */
  onChanged: () => void;
}

interface LoadState {
  loading: boolean;
  error: string | null;
  students: StudentFormReview[];
  canLink: boolean;
}

/** Which candidate's full form is open, if any. */
interface Viewing {
  student: StudentFormReview;
  candidate: FormCandidateView;
}

/**
 * A message to paste into WhatsApp when nothing was found.
 *
 * Kept as the fallback now that a link exists, for the student whose family shares
 * one phone and answers in the chat rather than opening anything.
 */
function askMessage(name: string): string {
  const first = name.trim().split(/\s+/)[0] || 'there';
  return [
    `Hi ${first}, we are updating your Neram Classes record. Please reply with:`,
    '1. Your class now (for example Class 12, or finished Class 12)',
    '2. The year you will write the exam',
    "3. Your father's name",
    '4. Your city',
  ].join('\n');
}

/**
 * The message that carries the link, which is what staff send by default.
 *
 * The link leads, because that is the thing being asked for. The sentence after it
 * exists so the message does not read like the spam a teenager has been taught to
 * ignore: a bare shortlink from an unknown number gets deleted.
 */
function whatsappMessage(name: string, url: string): string {
  const first = name.trim().split(/\s+/)[0] || 'there';
  return [
    `Hi ${first}, this is Neram Classes. Please fill in your details here:`,
    url,
    'It takes about a minute and the link works for two weeks.',
  ].join('\n');
}

/** "3 days ago", for a line a teacher reads at a glance. */
function agoLabel(iso: string | null, now: number): string {
  if (!iso) return '';
  const days = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/** The one sentence describing where the ask has got to. */
function progressLine(request: DetailRequestView | null, now: number): string | null {
  if (!request || request.progress === 'not_asked') return null;
  const asked = agoLabel(request.askedAt, now);
  const by = request.askedByName ? ` by ${request.askedByName}` : '';
  if (request.progress === 'answered') return `Answered ${agoLabel(request.answeredAt, now)}.`;
  if (request.progress === 'opened') {
    return `Asked ${asked}${by}. Opened ${agoLabel(request.openedAt, now)}, not finished.`;
  }
  return `Asked ${asked}${by}. Not opened yet.`;
}

function linkedMessage(result: FormLinkResult): string {
  const changes: string[] = [];
  if (result.filled.studyStage) changes.push(`class set to ${STAGE_LABEL[stageKeyOf(result.filled.studyStage)]}`);
  if (result.filled.academicYear) changes.push(`exam year set to ${result.filled.academicYear}`);
  if (changes.length) {
    const sentence = changes.join(' and ');
    return `Form linked. ${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
  }
  if (result.held.length) return `Form linked. ${result.held[0]}`;
  return 'Form linked. Their class and exam year were left as they were.';
}

export default function ApplicationFormSheet({
  open,
  classroomId,
  studentId = null,
  getToken,
  onClose,
  onChanged,
}: ApplicationFormSheetProps) {
  const theme = useTheme();
  // A bottom sheet is the right shape on a phone and the wrong one on a monitor.
  // Same breakpoint as components/study-materials/recordings/ResponsiveSheet.
  const isDesktop = useMediaQuery(theme.breakpoints.up('sm'));

  const [state, setState] = useState<LoadState>({ loading: false, error: null, students: [], canLink: false });
  /** `${studentId}:${formUserId}` awaiting the second "Link form" tap. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ key: string; kind: 'link' | 'dismiss' } | null>(null);
  const [actionError, setActionError] = useState<{ key: string; message: string } | null>(null);
  /** Students linked while the sheet is open, with what happened. */
  const [linked, setLinked] = useState<Record<string, string>>({});
  const [copiedFor, setCopiedFor] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const [now] = useState(() => Date.now());
  /**
   * The link generated for a student while the sheet is open.
   *
   * Always shown as selectable text as well as copied. Clipboard writes fail
   * silently inside some in-app browsers, and a member of staff who thinks they
   * copied a link and pastes the previous one will not find out until the student
   * says nothing for a week.
   */
  const [linkFor, setLinkFor] = useState<Record<string, string>>({});
  const [linkBusy, setLinkBusy] = useState<string | null>(null);
  /** Students the nudge has been sent to while the sheet is open. */
  const [nudged, setNudged] = useState<Record<string, string>>({});
  /** The card button that opened the form, so focus can go back to it. */
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session has ended. Sign in again.');
      const params = new URLSearchParams({ classroom: classroomId });
      if (studentId) params.set('student', studentId);
      const res = await fetch(`/api/students/application-forms?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not look for application forms.');
      setState({ loading: false, error: null, students: data.students || [], canLink: !!data.canLink });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Could not look for application forms.',
      }));
    }
  }, [classroomId, studentId, getToken]);

  useEffect(() => {
    if (!open) return;
    setLinked({});
    setConfirming(null);
    setActionError(null);
    setCopiedFor(null);
    setViewing(null);
    load();
  }, [open, load]);

  // Cached by SWR, so stepping back into a form already read costs nothing.
  const detailKey = viewing
    ? `/api/students/application-forms/detail?classroom=${classroomId}&student=${viewing.student.id}&form=${viewing.candidate.userId}`
    : null;
  const {
    data: detail,
    error: detailError,
    isLoading: detailLoading,
    mutate: reloadDetail,
  } = useNexusSWR<FormDetailView>(detailKey, getToken);

  const act = async (kind: 'link' | 'dismiss', student: StudentFormReview, candidate: FormCandidateView) => {
    const key = `${student.id}:${candidate.userId}`;
    setBusy({ key, kind });
    setActionError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session has ended. Sign in again.');
      const res = await fetch(`/api/students/application-forms/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ classroomId, studentId: student.id, formUserId: candidate.userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || (kind === 'link' ? 'Could not link that form.' : 'Could not save that.'));
      }

      if (kind === 'link') {
        setLinked((prev) => ({ ...prev, [student.id]: linkedMessage(data as FormLinkResult) }));
      }
      // A linked record no longer exists, and a rejected one is not this student's.
      setState((prev) => ({
        ...prev,
        students: prev.students.map((row) =>
          kind === 'link' || row.id === student.id
            ? { ...row, candidates: row.candidates.filter((c) => c.userId !== candidate.userId) }
            : row,
        ),
      }));
      setConfirming(null);
      // The decision is made, so the form it was made from is done with.
      setViewing(null);
      onChanged();
    } catch (err) {
      setActionError({ key, message: err instanceof Error ? err.message : 'Something went wrong.' });
    } finally {
      setBusy(null);
    }
  };

  const copyAsk = async (student: StudentFormReview) => {
    try {
      await navigator.clipboard.writeText(askMessage(student.name));
      setCopiedFor(student.id);
    } catch {
      setActionError({ key: student.id, message: 'Could not copy the message.' });
    }
  };

  /**
   * Make (or reuse) the student's link and put the WhatsApp message on the
   * clipboard. The URL is also shown on the card, so a failed clipboard write is
   * recoverable rather than invisible.
   */
  const getLink = async (student: StudentFormReview, regenerate = false) => {
    setLinkBusy(student.id);
    setActionError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session has ended. Sign in again.');
      const res = await fetch('/api/students/detail-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ classroomId, studentId: student.id, regenerate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not make a link.');

      setLinkFor((prev) => ({ ...prev, [student.id]: data.url }));
      try {
        await navigator.clipboard.writeText(whatsappMessage(student.name, data.url));
        setCopiedFor(student.id);
      } catch {
        // The link is on screen either way, so this is not an error worth shouting.
      }
      onChanged();
    } catch (err) {
      setActionError({ key: student.id, message: err instanceof Error ? err.message : 'Something went wrong.' });
    } finally {
      setLinkBusy(null);
    }
  };

  /**
   * Ask through Teams and the Nexus bell as well as by link.
   *
   * Worth doing alongside the link rather than instead of it: a student who already
   * uses Nexus gets a message where they are and a form they can fill in without
   * leaving the app, and one who has never signed in is unreachable this way and
   * still needs the WhatsApp link. The route decides which channels actually
   * landed and says so.
   */
  const sendNudge = async (student: StudentFormReview) => {
    setLinkBusy(student.id);
    setActionError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session has ended. Sign in again.');
      const res = await fetch('/api/students/detail-request/nudge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ classroomId, studentId: student.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not send that.');
      setNudged((prev) => ({ ...prev, [student.id]: data.summary || 'Sent.' }));
      onChanged();
    } catch (err) {
      setActionError({ key: student.id, message: err instanceof Error ? err.message : 'Something went wrong.' });
    } finally {
      setLinkBusy(null);
    }
  };

  const openForm = (student: StudentFormReview, candidate: FormCandidateView, trigger: HTMLElement | null) => {
    returnFocusRef.current = trigger;
    setActionError(null);
    setViewing({ student, candidate });
  };

  const closeForm = () => {
    setViewing(null);
    // Back to the button that opened it, not the top of the sheet.
    returnFocusRef.current?.focus();
  };

  /** Escape, the backdrop and the Android back gesture pop the form first. */
  const handleClose = () => {
    if (busy) return;
    if (viewing) closeForm();
    else onClose();
  };

  const adminHref = (id: string) =>
    adminCrmUrl(id, {
      nexusOrigin: typeof window === 'undefined' ? null : window.location.origin,
      configured: process.env.NEXT_PUBLIC_ADMIN_URL ?? null,
      section: 'application',
    });

  const { loading, error, students, canLink } = state;
  const viewingKey = viewing ? `${viewing.student.id}:${viewing.candidate.userId}` : null;

  const body = viewing ? (
    <ApplicationFormDetail
      studentId={viewing.student.id}
      studentName={viewing.student.name}
      studentEmail={viewing.student.email}
      data={detail ?? null}
      loading={detailLoading}
      error={detailError ? detailError.message : null}
      busyKind={busy?.key === viewingKey ? busy.kind : null}
      anyBusy={!!busy}
      actionError={actionError?.key === viewingKey ? actionError.message : null}
      blockedText={viewing.candidate.blocked ? BLOCKED_TEXT[viewing.candidate.blocked] : null}
      onBack={closeForm}
      onRetry={() => reloadDetail()}
      onLink={() => act('link', viewing.student, viewing.candidate)}
      onDismiss={() => act('dismiss', viewing.student, viewing.candidate)}
    />
  ) : (
    <>
      <Box
        aria-busy={loading}
        sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, overflowY: 'auto', flex: 1 }}
      >
        <Box
          sx={{
            position: 'sticky',
            top: -16,
            zIndex: 1,
            bgcolor: 'background.paper',
            pt: 0.5,
            pb: 1,
            mt: -0.5,
          }}
        >
          <Typography id="application-forms-title" component="h2" sx={{ fontWeight: 800, fontSize: '1.05rem' }}>
            Application forms
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {studentId
              ? "Looking for this student's application form on other records."
              : 'These students have no application form on their own record. When one turns up on another record, linking it fills in their class and exam year.'}
          </Typography>
        </Box>

        {loading &&
          [0, 1, 2].map((i) => <Skeleton key={i} variant="rectangular" height={120} sx={{ borderRadius: 2 }} />)}

        {!loading && error && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" onClick={load} sx={{ minHeight: 48 }}>
                Retry
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        {!loading && !error && students.length === 0 && (
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <CheckCircleOutlineIcon aria-hidden sx={{ fontSize: 40, color: 'success.main' }} />
            <Typography sx={{ fontWeight: 700, mt: 0.5 }}>
              {studentId ? 'This student has an application form.' : 'Every student here has an application form.'}
            </Typography>
          </Box>
        )}

        {!loading &&
          !error &&
          students.map((student) => (
            <Paper
              key={student.id}
              component="section"
              aria-label={student.name}
              variant="outlined"
              sx={{ borderRadius: 2, p: 1.5 }}
            >
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', minWidth: 0 }}>
                <StudentAvatar userId={student.id} name={student.name} size={32} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700 }} noWrap>
                    {student.name}
                  </Typography>
                  {student.email && (
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                      {student.email}
                    </Typography>
                  )}
                </Box>
              </Box>

              {linked[student.id] ? (
                <Box role="status" sx={{ mt: 1.25, display: 'flex', gap: 0.75, alignItems: 'flex-start' }}>
                  <CheckCircleOutlineIcon aria-hidden sx={{ fontSize: 20, color: 'success.main', mt: '1px' }} />
                  <Typography variant="body2">{linked[student.id]}</Typography>
                </Box>
              ) : student.candidates.length ? (
                student.candidates.map((candidate) => {
                  const key = `${student.id}:${candidate.userId}`;
                  return (
                    <CandidateBlock
                      key={candidate.userId}
                      studentName={student.name}
                      candidate={candidate}
                      now={now}
                      canLink={canLink}
                      confirming={confirming === key}
                      busyKind={busy?.key === key ? busy.kind : null}
                      anyBusy={!!busy}
                      error={actionError?.key === key ? actionError.message : null}
                      onAskConfirm={() => setConfirming(key)}
                      onCancelConfirm={() => setConfirming(null)}
                      onLink={() => act('link', student, candidate)}
                      onDismiss={() => act('dismiss', student, candidate)}
                      onView={(trigger) => openForm(student, candidate, trigger)}
                    />
                  );
                })
              ) : (
                <Box sx={{ mt: 1.25 }}>
                  <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start' }}>
                    <InfoOutlinedIcon aria-hidden sx={{ fontSize: 18, mt: '2px', color: 'text.secondary' }} />
                    <Typography variant="body2">
                      No application form found. Send them a link to fill it in themselves, or
                      {canLink ? ' fill it in for them in Admin.' : ' pass the details to the office.'}
                    </Typography>
                  </Box>

                  {/* Where the ask has got to, so two teachers do not chase the same
                      student while nobody chases the next one. */}
                  {progressLine(student.detailRequest, now) && (
                    <Typography
                      variant="body2"
                      role="status"
                      sx={{
                        mt: 1,
                        fontWeight: 600,
                        color:
                          student.detailRequest?.progress === 'answered' ? 'success.main' : 'text.secondary',
                      }}
                    >
                      {progressLine(student.detailRequest, now)}
                    </Typography>
                  )}

                  {nudged[student.id] && (
                    <Typography variant="body2" role="status" sx={{ mt: 0.75, color: 'success.main' }}>
                      {nudged[student.id]}
                    </Typography>
                  )}

                  {/* The link itself, always visible and selectable: a clipboard write
                      can fail silently inside an in-app browser. */}
                  {linkFor[student.id] && (
                    <Box
                      sx={{
                        mt: 1,
                        p: 1,
                        borderRadius: 1,
                        bgcolor: 'action.hover',
                        fontFamily: 'monospace',
                        fontSize: 13,
                        overflowWrap: 'anywhere',
                        userSelect: 'all',
                      }}
                    >
                      {linkFor[student.id]}
                    </Box>
                  )}

                  <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button
                      variant="contained"
                      disabled={linkBusy === student.id}
                      startIcon={copiedFor === student.id ? <CheckCircleOutlineIcon /> : <ContentCopyOutlinedIcon />}
                      onClick={() => getLink(student)}
                      sx={{ minHeight: 48 }}
                    >
                      {linkBusy === student.id
                        ? 'Working...'
                        : copiedFor === student.id
                          ? 'Copied'
                          : student.detailRequest?.progress === 'not_asked'
                            ? 'Get a link to ask'
                            : 'Copy link again'}
                    </Button>
                    <Button
                      variant="outlined"
                      disabled={linkBusy === student.id}
                      startIcon={<SendOutlinedIcon />}
                      onClick={() => sendNudge(student)}
                      sx={{ minHeight: 48 }}
                    >
                      Send in Teams and Nexus
                    </Button>
                    {student.detailRequest && student.detailRequest.progress !== 'not_asked' && (
                      <Button
                        variant="text"
                        disabled={linkBusy === student.id}
                        onClick={() => getLink(student, true)}
                        sx={{ minHeight: 48 }}
                      >
                        Send a new link
                      </Button>
                    )}
                    <Button
                      variant="text"
                      startIcon={<ContentCopyOutlinedIcon />}
                      onClick={() => copyAsk(student)}
                      sx={{ minHeight: 48 }}
                    >
                      Copy the questions instead
                    </Button>
                    {canLink && (
                      <Button
                        variant="text"
                        component="a"
                        href={adminHref(student.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        endIcon={<OpenInNewOutlinedIcon />}
                        sx={{ minHeight: 48 }}
                      >
                        Fill in Admin
                      </Button>
                    )}
                  </Box>
                  {actionError?.key === student.id && (
                    <Typography variant="body2" color="error" sx={{ mt: 0.75 }}>
                      {actionError.message}
                    </Typography>
                  )}
                </Box>
              )}
            </Paper>
          ))}
      </Box>

      <Box
        sx={{
          p: 2,
          pt: 1,
          borderTop: 1,
          borderColor: 'divider',
          pb: 'calc(16px + env(safe-area-inset-bottom))',
        }}
      >
        <Button fullWidth variant="outlined" onClick={onClose} disabled={!!busy} sx={{ minHeight: 48, fontWeight: 700 }}>
          Done
        </Button>
      </Box>
    </>
  );

  const paperSx = {
    display: 'flex',
    flexDirection: 'column' as const,
    maxHeight: '88dvh',
    width: '100%',
    maxWidth: 720,
    mx: 'auto',
  };

  if (isDesktop) {
    return (
      <Dialog
        open={open}
        onClose={handleClose}
        fullWidth
        maxWidth="sm"
        aria-labelledby={viewing ? undefined : 'application-forms-title'}
        aria-label={viewing ? 'Application form' : undefined}
        PaperProps={{ sx: { ...paperSx, borderRadius: 3 } }}
      >
        {body}
      </Dialog>
    );
  }

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={handleClose}
      PaperProps={{
        role: 'dialog',
        'aria-labelledby': viewing ? undefined : 'application-forms-title',
        'aria-label': viewing ? 'Application form' : undefined,
        sx: { ...paperSx, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
      }}
    >
      {body}
    </Drawer>
  );
}

function CandidateBlock({
  studentName,
  candidate,
  now,
  canLink,
  confirming,
  busyKind,
  anyBusy,
  error,
  onAskConfirm,
  onCancelConfirm,
  onLink,
  onDismiss,
  onView,
}: {
  studentName: string;
  candidate: FormCandidateView;
  now: number;
  canLink: boolean;
  confirming: boolean;
  busyKind: 'link' | 'dismiss' | null;
  anyBusy: boolean;
  error: string | null;
  onAskConfirm: () => void;
  onCancelConfirm: () => void;
  onLink: () => void;
  onDismiss: () => void;
  onView: (trigger: HTMLElement | null) => void;
}) {
  const who = [candidate.fatherName ? `Father: ${candidate.fatherName}` : null, candidate.place]
    .filter(Boolean)
    .join(' · ');
  const applied = shortDate(candidate.appliedAt, now);
  const facts = [
    candidate.classLabel,
    candidate.examYear ? `Exam in ${candidate.examYear}` : null,
    applied ? `Applied ${applied}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Box
      component="article"
      aria-label={candidate.name ? `Form filled in as ${candidate.name}` : 'Form with no name typed on it'}
      sx={{
        mt: 1.25,
        p: 1.25,
        borderRadius: 1.5,
        border: 1,
        borderColor: candidate.strength === 'strong' ? 'success.main' : 'divider',
        bgcolor: 'background.default',
      }}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 0.75 }}>
        {candidate.reasons.map((reason) => {
          const { label, Icon } = REASON[reason];
          return (
            <Chip
              key={reason}
              size="small"
              variant="outlined"
              color={candidate.strength === 'strong' ? 'success' : 'default'}
              icon={<Icon aria-hidden />}
              label={label}
              sx={{ fontWeight: 600 }}
            />
          );
        })}
      </Box>

      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        {candidate.name ? `Form filled in as ${candidate.name}` : 'Form with no name typed on it'}
      </Typography>
      {who && (
        <Typography variant="body2" color="text.secondary">
          {who}
        </Typography>
      )}
      {facts && (
        <Typography variant="body2" color="text.secondary">
          {facts}
        </Typography>
      )}
      {candidate.applicationNumber && (
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', display: 'block' }}>
          {candidate.applicationNumber}
        </Typography>
      )}

      {/* Reading the form is available to everyone who can see this sheet,
          including teachers who cannot link: knowing whose form it is, is how
          they know whom to ask. */}
      <Button
        fullWidth
        startIcon={<DescriptionOutlinedIcon />}
        onClick={(event) => onView(event.currentTarget)}
        disabled={anyBusy}
        sx={{ mt: 1, minHeight: 48, justifyContent: 'center' }}
      >
        View full form
      </Button>

      {candidate.blocked && (
        <Box sx={{ mt: 1, display: 'flex', gap: 0.75, alignItems: 'flex-start' }}>
          <InfoOutlinedIcon aria-hidden sx={{ fontSize: 18, mt: '2px', color: 'warning.dark' }} />
          <Typography variant="body2">{BLOCKED_TEXT[candidate.blocked]}</Typography>
        </Box>
      )}

      {!candidate.blocked && !canLink && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          A manager or admin can link this form.
        </Typography>
      )}

      {!candidate.blocked && canLink && confirming && (
        <Box sx={{ mt: 1.25 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Link this form to <strong>{studentName}</strong>? The two records become one: the form, its phone login
            and any payments move onto {studentName}&apos;s Microsoft record. This cannot be undone.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexDirection: { xs: 'column-reverse', sm: 'row' } }}>
            <Button
              variant="outlined"
              onClick={onCancelConfirm}
              disabled={anyBusy}
              sx={{ minHeight: 48, flex: { sm: 1 } }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={onLink}
              disabled={anyBusy}
              sx={{ minHeight: 48, fontWeight: 700, flex: { sm: 2 } }}
            >
              {busyKind === 'link' ? 'Linking…' : 'Link form'}
            </Button>
          </Box>
        </Box>
      )}

      {!candidate.blocked && canLink && !confirming && (
        <Box sx={{ mt: 1, display: 'flex', gap: 1, flexDirection: { xs: 'column-reverse', sm: 'row' } }}>
          <Button onClick={onDismiss} disabled={anyBusy} sx={{ minHeight: 48, flex: { sm: 1 } }}>
            {busyKind === 'dismiss' ? 'Saving…' : 'Not this student'}
          </Button>
          <Button
            variant="contained"
            startIcon={<LinkOutlinedIcon />}
            onClick={onAskConfirm}
            disabled={anyBusy}
            sx={{ minHeight: 48, fontWeight: 700, flex: { sm: 2 } }}
          >
            Yes, this is their form
          </Button>
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {error}
        </Alert>
      )}
    </Box>
  );
}
