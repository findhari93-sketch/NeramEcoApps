'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, Drawer, Paper, Skeleton, Typography } from '@neram/ui';
import AlternateEmailOutlinedIcon from '@mui/icons-material/AlternateEmailOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import FamilyRestroomOutlinedIcon from '@mui/icons-material/FamilyRestroomOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import PhoneIphoneOutlinedIcon from '@mui/icons-material/PhoneIphoneOutlined';
import StudentAvatar from './StudentAvatar';
import { adminCrmUrl } from '@/lib/admin-links';
import { shortDate } from '@/lib/student-roster-view';
import { STAGE_LABEL, stageKeyOf } from '@/lib/student-stage';
import type { FormCandidateView, FormLinkResult, StudentFormReview } from '@/lib/application-form';

/**
 * The students with no application form on their own record, and the forms on
 * other records that may be theirs.
 *
 * Why it exists: the apply form and the Microsoft account live on two different
 * records for most students, so their class and exam year never reach Nexus. The
 * form is rarely missing; it is unlinked. This sheet is where a person says "yes,
 * that is theirs", and where a teacher sees whom to ask when nothing turns up.
 *
 * Linking merges two records and cannot be undone, so it asks once more before it
 * happens, inline, where the evidence is still on screen.
 */

type Reason = FormCandidateView['reasons'][number];

const REASON: Record<Reason, { label: string; Icon: React.ElementType }> = {
  phone: { label: 'Same phone number', Icon: PhoneIphoneOutlinedIcon },
  email: { label: 'Same email address', Icon: AlternateEmailOutlinedIcon },
  full_name: { label: 'Same full name', Icon: BadgeOutlinedIcon },
  father_name: { label: "Father's name fits", Icon: FamilyRestroomOutlinedIcon },
};

const BLOCKED_TEXT: Record<NonNullable<FormCandidateView['blocked']>, string> = {
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

/** A message to paste into WhatsApp when nothing was found. */
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
  const [state, setState] = useState<LoadState>({ loading: false, error: null, students: [], canLink: false });
  /** `${studentId}:${formUserId}` awaiting the second "Link form" tap. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ key: string; kind: 'link' | 'dismiss' } | null>(null);
  const [actionError, setActionError] = useState<{ key: string; message: string } | null>(null);
  /** Students linked while the sheet is open, with what happened. */
  const [linked, setLinked] = useState<Record<string, string>>({});
  const [copiedFor, setCopiedFor] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

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
    load();
  }, [open, load]);

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

  const adminHref = (id: string) =>
    adminCrmUrl(id, {
      nexusOrigin: typeof window === 'undefined' ? null : window.location.origin,
      configured: process.env.NEXT_PUBLIC_ADMIN_URL ?? null,
      section: 'application',
    });

  const { loading, error, students, canLink } = state;

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      PaperProps={{
        role: 'dialog',
        'aria-labelledby': 'application-forms-title',
        sx: {
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          maxHeight: '88dvh',
          width: '100%',
          maxWidth: 720,
          mx: 'auto',
        },
      }}
    >
      <Box
        aria-busy={loading}
        sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, overflowY: 'auto', flex: 1 }}
      >
        <Box>
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
                    />
                  );
                })
              ) : (
                <Box sx={{ mt: 1.25 }}>
                  <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start' }}>
                    <InfoOutlinedIcon aria-hidden sx={{ fontSize: 18, mt: '2px', color: 'text.secondary' }} />
                    <Typography variant="body2">
                      {canLink
                        ? 'No application form found. Ask the student or a parent for the details, then fill in the form in Admin.'
                        : 'No application form found. Ask the student or a parent for the details and pass them to the office to fill in the form.'}
                    </Typography>
                  </Box>
                  <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button
                      variant="outlined"
                      startIcon={copiedFor === student.id ? <CheckCircleOutlineIcon /> : <ContentCopyOutlinedIcon />}
                      onClick={() => copyAsk(student)}
                      sx={{ minHeight: 48 }}
                    >
                      {copiedFor === student.id ? 'Copied' : 'Copy what to ask'}
                    </Button>
                    {canLink && (
                      <Button
                        variant="outlined"
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
      sx={{
        mt: 1.25,
        p: 1.25,
        borderRadius: 1.5,
        border: 1,
        borderColor: candidate.strength === 'strong' ? 'success.light' : 'divider',
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
        <Box sx={{ mt: 1.25, display: 'flex', gap: 1, flexDirection: { xs: 'column-reverse', sm: 'row' } }}>
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
