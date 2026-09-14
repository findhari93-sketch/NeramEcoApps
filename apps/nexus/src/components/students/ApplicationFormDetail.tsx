'use client';

import { useEffect, useRef } from 'react';
import { Alert, Box, Button, Divider, IconButton, Paper, Skeleton, Typography } from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import StudentAvatar from './StudentAvatar';
import { Field, FieldGrid } from './profile/FieldGrid';
import AcademicDataBlock from './profile/AcademicDataBlock';
import {
  APPLICANT_CATEGORY_LABEL,
  LEARNING_MODE_LABEL,
  LOCATION_SOURCE_LABEL,
  SCHOOL_TYPE_LABEL,
  formatDateIN,
  formatPhone,
  humanise,
  labelFor,
  yesNo,
} from '@/lib/student-profile-fields';
import type { FormDetailView } from '@/lib/application-form';
import type { AgreementVerdict } from '@/lib/application-form-match';

/**
 * One proposed application form, read in full before anyone merges two records.
 *
 * WHY THE COMPARISON COMES FIRST. The question on this screen is not "what does
 * this form say", it is "is this the same person". So the agreeing and
 * disagreeing fields are laid out side by side at the top, and the form itself
 * follows as evidence. A reviewer who only reads the first block has still read
 * the part that decides it.
 *
 * The second confirm tap is deliberately not repeated here. On the list card it
 * exists because the decision is made from four lines of summary; here the
 * reviewer has just read the whole form, and asking again would train them to
 * tap through. The warning sits directly above the button instead.
 */

export interface ApplicationFormDetailProps {
  studentName: string;
  studentId: string;
  studentEmail: string | null;
  data: FormDetailView | null;
  loading: boolean;
  error: string | null;
  /** 'link' or 'dismiss' while that action is in flight. */
  busyKind: 'link' | 'dismiss' | null;
  anyBusy: boolean;
  actionError: string | null;
  blockedText: string | null;
  onBack: () => void;
  onRetry: () => void;
  onLink: () => void;
  onDismiss: () => void;
}

const VERDICT: Record<AgreementVerdict, { label: string; Icon: React.ElementType; color: string }> = {
  same: { label: 'Agrees', Icon: CheckCircleOutlineIcon, color: 'success.main' },
  differs: { label: 'Differs', Icon: CancelOutlinedIcon, color: 'error.main' },
  unknown: { label: 'Not on their record', Icon: RemoveCircleOutlineIcon, color: 'text.disabled' },
};

export default function ApplicationFormDetail({
  studentName,
  studentId,
  studentEmail,
  data,
  loading,
  error,
  busyKind,
  anyBusy,
  actionError,
  blockedText,
  onBack,
  onRetry,
  onLink,
  onDismiss,
}: ApplicationFormDetailProps) {
  const backRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Focus lands on Back, not at the top of a long form, so a keyboard or
  // screen-reader user knows where they are and how to leave.
  useEffect(() => {
    backRef.current?.focus();
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, []);

  const form = data?.form;
  const canAct = !!data?.canLink && !data?.blocked;

  return (
    <>
      <Box
        sx={{
          px: 1,
          py: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          borderBottom: 1,
          borderColor: 'divider',
          position: 'sticky',
          top: 0,
          zIndex: 2,
          bgcolor: 'background.paper',
        }}
      >
        <IconButton ref={backRef} onClick={onBack} aria-label="Back to the list" sx={{ width: 48, height: 48 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography component="h2" sx={{ fontWeight: 800, fontSize: '1.05rem' }}>
          Application form
        </Typography>
      </Box>

      <Box ref={scrollRef} sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', minWidth: 0 }}>
          <StudentAvatar userId={studentId} name={studentName} size={40} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Linking to
            </Typography>
            <Typography sx={{ fontWeight: 700 }} noWrap>
              {studentName}
            </Typography>
            {studentEmail && (
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {studentEmail}
              </Typography>
            )}
          </Box>
        </Box>

        {loading && (
          <>
            <Skeleton variant="rounded" height={150} sx={{ borderRadius: 2 }} />
            <Skeleton variant="rounded" height={180} sx={{ borderRadius: 2 }} />
            <Skeleton variant="rounded" height={180} sx={{ borderRadius: 2 }} />
          </>
        )}

        {!loading && error && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" onClick={onRetry} sx={{ minHeight: 48 }}>
                Retry
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        {!loading && !error && data && form && (
          <>
            <Paper variant="outlined" component="section" aria-label="Does this match?" sx={{ borderRadius: 2, p: 1.5 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                Does this match?
              </Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: 1, alignItems: 'start' }}>
                  <Box />
                  <ColumnHead>Their record</ColumnHead>
                  <ColumnHead>This form</ColumnHead>

                  <CompareRow
                    label="Name"
                    verdict={data.agreement.name}
                    mine={studentName}
                    theirs={form.name}
                  />
                  <CompareRow
                    label="Phone"
                    verdict={data.agreement.phone}
                    mine={data.student.phone ? formatPhone(data.student.phone) : null}
                    theirs={form.phone ? formatPhone(form.phone) : null}
                  />
                  <CompareRow
                    label="Email"
                    verdict={data.agreement.email}
                    mine={data.student.email}
                    theirs={form.email}
                  />
                  <CompareRow
                    label="Father"
                    verdict={data.agreement.fatherName}
                    mine={null}
                    theirs={form.fatherName}
                  />
                </Box>
              </Box>
              {!data.showsFullContact && (
                <Box sx={{ mt: 1.5, display: 'flex', gap: 0.75, alignItems: 'flex-start' }}>
                  <LockOutlinedIcon aria-hidden sx={{ fontSize: 18, mt: '2px', color: 'text.secondary' }} />
                  <Typography variant="caption" color="text.secondary">
                    Phone numbers and email addresses are partly hidden. The last four digits are enough to check
                    against what the student tells you.
                  </Typography>
                </Box>
              )}
            </Paper>

            <Section title="Application">
              <FieldGrid>
                <Field label="Application number" value={form.applicationNumber} />
                <Field label="Status" value={form.status ? humanise(form.status) : null} />
                <Field label="Started on" value={formatDateIN(form.createdAt)} />
                <Field label="Submitted on" value={formatDateIN(form.formCompletedAt)} />
                <Field
                  label="Form progress"
                  value={
                    form.formCompletedAt
                      ? 'Completed'
                      : form.formStepCompleted !== null
                        ? `Reached step ${form.formStepCompleted}`
                        : null
                  }
                />
                <Field
                  label="Phone verified"
                  value={yesNo(form.phoneVerified)}
                  hint={form.phoneVerifiedAt ? `Verified on ${formatDateIN(form.phoneVerifiedAt)}` : null}
                />
              </FieldGrid>
            </Section>

            <Section title="Who filled it in">
              <FieldGrid>
                <Field label="Name on the form" value={form.name} />
                <Field label="Father's name" value={form.fatherName} />
                <Field label="Phone" value={form.phone ? formatPhone(form.phone) : null} />
                <Field label="Email" value={form.email} />
                <Field label="Parent's phone" value={form.parentPhone ? formatPhone(form.parentPhone) : null} />
                <Field label="Date of birth" value={formatDateIN(form.dateOfBirth)} />
                <Field label="Gender" value={form.gender ? humanise(form.gender) : null} />
              </FieldGrid>
            </Section>

            <Section title="What they are studying">
              <FieldGrid>
                <Field
                  label="Applicant category"
                  value={labelFor(APPLICANT_CATEGORY_LABEL, form.applicantCategory)}
                />
                <Field label="Target exam year" value={form.targetExamYear} />
                <Field
                  label="School type"
                  value={form.schoolType ? labelFor(SCHOOL_TYPE_LABEL, form.schoolType) : null}
                />
                <Field
                  label="Course of interest"
                  value={form.interestCourse ? humanise(form.interestCourse) : null}
                />
                <Field
                  label="Learning mode"
                  value={form.learningMode ? labelFor(LEARNING_MODE_LABEL, form.learningMode) : null}
                />
                <Field label="Accepted hybrid learning" value={yesNo(form.hybridLearningAccepted)} />
              </FieldGrid>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                Academic background
              </Typography>
              <AcademicDataBlock applicantCategory={form.applicantCategory} academicData={form.academicData} />
            </Section>

            <Section title="Where they live">
              <FieldGrid>
                <Field label="City" value={form.city} />
                <Field label="District" value={form.district} />
                <Field label="State" value={form.state} />
                <Field label="Country" value={form.country} />
                <Field label="Pincode" value={form.pincode} />
                <Field label="Address" value={form.address} full />
              </FieldGrid>
              {form.locationSource && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                  {labelFor(LOCATION_SOURCE_LABEL, form.locationSource)}
                </Typography>
              )}
            </Section>

            {canAct && (
              <Section title="What linking does">
                <Typography variant="body2">
                  The two records become one: the form, its phone login and any payments move onto{' '}
                  <strong>{studentName}</strong>&apos;s record. Their Microsoft sign-in and their name stay as they
                  are. This cannot be undone.
                </Typography>
              </Section>
            )}

            {blockedText && (
              <Alert severity="warning" icon={<InfoOutlinedIcon fontSize="inherit" />}>
                {blockedText}
              </Alert>
            )}

            {!data.canLink && !blockedText && (
              <Typography variant="body2" color="text.secondary">
                A manager or admin can link this form.
              </Typography>
            )}
          </>
        )}
      </Box>

      {!loading && !error && data && (
        <Box
          sx={{
            p: 2,
            pt: 1.5,
            borderTop: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            pb: 'calc(16px + env(safe-area-inset-bottom))',
          }}
        >
          {/* One line, not the whole explanation: on a 375px phone the full
              sentence plus two stacked buttons took nearly half the viewport and
              left almost nothing for the form the reviewer came to read. The
              detail sits in its own block at the end of the content. */}
          {canAct && (
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', mb: 1 }}>
              <WarningAmberOutlinedIcon aria-hidden sx={{ fontSize: 16, color: 'warning.dark' }} />
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'warning.dark' }}>
                Linking merges both records and cannot be undone.
              </Typography>
            </Box>
          )}
          {actionError && (
            <Alert severity="error" sx={{ mb: 1.5 }}>
              {actionError}
            </Alert>
          )}
          <Box sx={{ display: 'flex', gap: 1, flexDirection: { xs: 'column-reverse', sm: 'row' } }}>
            <Button
              variant="outlined"
              onClick={canAct ? onDismiss : onBack}
              disabled={anyBusy}
              sx={{ minHeight: 48, flex: { sm: 1 } }}
            >
              {busyKind === 'dismiss' ? 'Saving…' : canAct ? 'Not this student' : 'Back to the list'}
            </Button>
            {canAct && (
              <Button
                variant="contained"
                startIcon={<LinkOutlinedIcon />}
                onClick={onLink}
                disabled={anyBusy}
                sx={{ minHeight: 48, fontWeight: 700, flex: { sm: 2 } }}
              >
                {busyKind === 'link' ? 'Linking…' : 'Yes, link this form'}
              </Button>
            )}
          </Box>
        </Box>
      )}
    </>
  );
}

function ColumnHead({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
      {children}
    </Typography>
  );
}

/**
 * One field, both sides, with the verdict said in words as well as drawn. Colour
 * alone would leave a colour-blind reviewer guessing on the one screen where
 * guessing is the failure mode.
 */
function CompareRow({
  label,
  verdict,
  mine,
  theirs,
}: {
  label: string;
  verdict: AgreementVerdict;
  mine: string | null;
  theirs: string | null;
}) {
  const { label: verdictLabel, Icon, color } = VERDICT[verdict];
  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
        <Icon aria-hidden sx={{ fontSize: 18, color }} />
        <Typography variant="caption" sx={{ fontWeight: 700 }}>
          {label}
        </Typography>
        <Box component="span" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          {verdictLabel}
        </Box>
      </Box>
      <Typography variant="body2" sx={{ wordBreak: 'break-word', color: mine ? 'text.primary' : 'text.disabled' }}>
        {mine || 'Not recorded'}
      </Typography>
      <Typography variant="body2" sx={{ wordBreak: 'break-word', color: theirs ? 'text.primary' : 'text.disabled' }}>
        {theirs || 'Not recorded'}
      </Typography>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper variant="outlined" component="section" aria-label={title} sx={{ borderRadius: 2, p: 1.5 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
        {title}
      </Typography>
      {children}
    </Paper>
  );
}
