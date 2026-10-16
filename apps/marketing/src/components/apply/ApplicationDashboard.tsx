'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Skeleton,
} from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';
import LinearProgress from '@mui/material/LinearProgress';
import AddOutlined from '@mui/icons-material/AddOutlined';
import ArrowForwardOutlined from '@mui/icons-material/ArrowForwardOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import NorthEastOutlined from '@mui/icons-material/NorthEastOutlined';
import type { RefundRequest } from '@neram/database';
import { tokens as t } from '@/design-system';
import { useFormContext } from './FormContext';
import type { FormStep } from './types';
import PaymentDialog from './PaymentDialog';
import ViewApplicationDialog, { ApplicationStatusPill } from './ViewApplicationDialog';
import RefundRequestButton from './RefundRequestButton';
import RefundStatusBanner from './RefundStatusBanner';
import { applyEyebrowSx, outlineButtonSx, railCardSx } from './styles';
import { APPLY_ERROR } from './shell/applyTheme';

// ============================================
// LABELS AND SHARED STYLES
// ============================================

const COURSE_LABELS: Record<string, string> = {
  nata: 'NATA',
  jee_paper2: 'JEE Paper 2',
  both: 'Both NATA & JEE',
  not_sure: 'Not Sure Yet',
};

const CATEGORY_LABELS: Record<string, string> = {
  school_student: 'School Student',
  diploma_student: 'Diploma Student',
  college_student: 'College Student',
  working_professional: 'Working Professional',
};

const inr = (n: number | string | null | undefined) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const focusSx = { '&.Mui-focusVisible, &:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' } } as const;

/** Standard primary: 48px gold fill, navy text, arrow on the right. */
const primarySx = {
  minHeight: 48,
  px: 2.5,
  borderRadius: `${t.radius}px`,
  bgcolor: t.gold500,
  color: t.navy900,
  fontSize: 15,
  fontWeight: 800,
  textTransform: 'none',
  boxShadow: 'none',
  '&:hover': { bgcolor: t.gold300, boxShadow: 'none' },
  '&.Mui-disabled': { bgcolor: t.gold500, color: t.navy900, opacity: 0.5 },
  ...focusSx,
} as const;

const outlineSx = { ...outlineButtonSx, ...focusSx } as const;

/** "Delete" as a quiet underlined text button, not a red outlined one. */
const quietTextButtonSx = {
  minHeight: 44,
  px: 1,
  borderRadius: `${t.radius}px`,
  color: t.inkMuted,
  fontSize: 14,
  fontWeight: 600,
  textTransform: 'none',
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
  '&:hover': { bgcolor: 'transparent', color: t.ink, textDecoration: 'underline' },
  ...focusSx,
} as const;

const h1Sx = {
  m: 0,
  fontSize: 'clamp(2rem, 4.5vw, 3rem)',
  fontWeight: 800,
  lineHeight: 1.08,
  letterSpacing: '-0.01em',
  color: t.ink,
  textWrap: 'balance',
} as const;

// ============================================
// ENROLLED REFUND INFO (fetches payment data for refund UI)
// ============================================

function EnrolledRefundInfo({ leadProfileId }: { leadProfileId: string }) {
  const { user } = useFirebaseAuth();
  const [payment, setPayment] = useState<any>(null);
  const [refundRequest, setRefundRequest] = useState<RefundRequest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !leadProfileId) {
      setLoading(false);
      return;
    }

    async function fetchData() {
      try {
        const token = await (user!.raw as any).getIdToken();
        const res = await fetch(`/api/payment/details/${leadProfileId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const data = await res.json();

        // Find the latest paid payment
        const paidPayment = (data.payments || []).find(
          (p: any) => p.status === 'paid'
        );
        if (paidPayment) {
          setPayment(paidPayment);

          // Check for existing refund request
          const refundRes = await fetch(`/api/refund/status/${paidPayment.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (refundRes.ok) {
            const refundData = await refundRes.json();
            if (refundData.refundRequest) {
              setRefundRequest(refundData.refundRequest);
            }
          }
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [user, leadProfileId]);

  if (loading) {
    return <Skeleton variant="text" width="70%" height={22} aria-label="Loading refund details" />;
  }

  if (!payment) return null;

  // Show refund status banner if request exists
  if (refundRequest) {
    return <RefundStatusBanner refundRequest={refundRequest} />;
  }

  // Show refund request link if within 24-hour window
  return (
    <RefundRequestButton
      paymentId={payment.id}
      paidAt={payment.paid_at}
      paymentAmount={Number(payment.amount)}
      leadProfileId={leadProfileId}
      onRequestSubmitted={() => {
        window.location.reload();
      }}
    />
  );
}

// ============================================
// APPLICATION CARD
// ============================================

interface ApplicationCardProps {
  application: any;
  onEdit: (app: any) => void;
  onDelete: (app: any) => void;
  onPayClick?: (app: any) => void;
  onViewClick?: (app: any) => void;
}

function ApplicationCard({ application, onEdit, onDelete, onPayClick, onViewClick }: ApplicationCardProps) {
  const { user } = useFirebaseAuth();
  const [isFullyPaid, setIsFullyPaid] = useState(false);
  const [isPartiallyPaid, setIsPartiallyPaid] = useState(false);
  const [paymentData, setPaymentData] = useState<any>(null);

  // Resilience check: if status is 'approved', verify payment status from API
  // This handles edge cases where the lead profile status update failed after payment
  useEffect(() => {
    if (application.status !== 'approved' || !user) return;

    async function checkPaymentStatus() {
      try {
        const token = await (user as any).getIdToken?.() || await (user?.raw as any)?.getIdToken?.();
        if (!token) return;
        const res = await fetch(`/api/payment/details/${application.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.totalPaid > 0) {
            if (data.remainingAmount <= 0) {
              setIsFullyPaid(true);
            } else {
              setIsPartiallyPaid(true);
              setPaymentData(data);
            }
          }
        }
      } catch {
        // Silently fail, fall back to status-based rendering
      }
    }
    checkPaymentStatus();
  }, [application.status, application.id, user]);

  // Determine effective status
  const effectiveStatus = isFullyPaid ? 'enrolled'
    : isPartiallyPaid ? 'partial_payment'
    : application.status;
  const course = COURSE_LABELS[application.interest_course] || application.interest_course || 'Not Selected';
  const submittedDate = application.submitted_at || application.updated_at || application.created_at;
  const formattedDate = submittedDate
    ? new Date(submittedDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;
  const isDraft = application.status === 'draft';
  const canEdit = ['submitted', 'pending_verification'].includes(application.status);

  // Payment deadline urgency (approved only)
  const daysLeft = application.payment_deadline
    ? Math.ceil((new Date(application.payment_deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const blockSx = { borderTop: `1px solid ${t.line}`, pt: 1.75, display: 'flex', flexDirection: 'column', gap: 1 } as const;

  return (
    <Box
      component="article"
      aria-label={`Application ${application.application_number || 'draft'}`}
      sx={{
        bgcolor: t.surface,
        border: `1px solid ${t.line}`,
        borderRadius: `${t.radius}px`,
        overflow: 'hidden',
        transition: 'border-color 150ms ease',
        '&:hover': { borderColor: t.gold500 },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      {/* Body */}
      <Box sx={{ px: 3, py: 2.5, display: 'flex', flexDirection: 'column', gap: 1.75 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <Typography component="p" sx={{ m: 0, fontFamily: t.fontMono, fontSize: 14, fontWeight: 700, color: t.ink }}>
            {application.application_number || 'DRAFT'}
          </Typography>
          <ApplicationStatusPill status={effectiveStatus} />
        </Box>

        <Box>
          <Typography component="h2" sx={{ m: 0, fontSize: 19, fontWeight: 700, lineHeight: 1.3, color: t.ink }}>
            {course}
          </Typography>
          {formattedDate && (
            <Typography component="p" sx={{ m: 0, mt: 0.5, fontSize: 14, color: t.inkMuted }}>
              {isDraft ? 'Last saved' : 'Submitted'} {formattedDate}
            </Typography>
          )}
        </Box>

        {/* Approved: the fee, waiting for payment */}
        {effectiveStatus === 'approved' && (
          <Box sx={blockSx}>
            <Typography component="p" sx={{ m: 0, fontSize: 15, lineHeight: 1.5, color: t.ink }}>
              Approved. Pay the fee to confirm your seat.
            </Typography>
            {application.final_fee && (
              <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 1 }}>
                <Box component="span" sx={{ fontSize: 24, fontWeight: 800, lineHeight: 1.15, color: t.ink }}>
                  {inr(application.final_fee - (application.full_payment_discount || 0))}
                </Box>
                {application.full_payment_discount > 0 && (
                  <Box component="s" sx={{ fontSize: 15, color: t.inkMuted }}>{inr(application.final_fee)}</Box>
                )}
              </Box>
            )}
            {application.full_payment_discount > 0 && (
              <Typography component="p" sx={{ m: 0, fontSize: 13, fontWeight: 700, color: t.gold800 }}>
                Save {inr(application.full_payment_discount)} with full payment
              </Typography>
            )}
            {daysLeft !== null && daysLeft > 0 && daysLeft <= 7 && (
              <Box sx={{ ...railCardSx(APPLY_ERROR), py: 1.25, fontSize: 14, fontWeight: 600, color: t.ink }}>
                Only {daysLeft} day{daysLeft > 1 ? 's' : ''} left to pay
              </Box>
            )}
          </Box>
        )}

        {/* Enrolled or part paid */}
        {['enrolled', 'partial_payment'].includes(effectiveStatus) && (
          <Box sx={blockSx}>
            <Typography component="p" sx={{ m: 0, fontSize: 15, lineHeight: 1.5, color: t.ink }}>
              {effectiveStatus === 'enrolled'
                ? 'Your enrolment is confirmed. Welcome to Neram Classes.'
                : 'First part received. Complete the remaining payment on schedule.'}
            </Typography>

            {effectiveStatus === 'partial_payment' && paymentData && (
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mb: 0.75, fontSize: 13, color: t.inkMuted }}>
                  <span>Paid {inr(paymentData.totalPaid)}</span>
                  <span>Due {inr(paymentData.remainingAmount)}</span>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={paymentData.finalFee > 0 ? (paymentData.totalPaid / paymentData.finalFee) * 100 : 0}
                  aria-label="Fee paid so far"
                />
              </Box>
            )}

            <EnrolledRefundInfo leadProfileId={application.id} />
          </Box>
        )}
      </Box>

      {/* Footer actions */}
      <Box
        sx={{
          bgcolor: t.ground,
          borderTop: `1px solid ${t.line}`,
          px: 3,
          py: 1.5,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 1,
        }}
      >
        {effectiveStatus === 'approved' && (
          <Button variant="contained" onClick={() => onPayClick?.(application)} endIcon={<ArrowForwardOutlined />} sx={primarySx}>
            Pay and join
          </Button>
        )}
        {effectiveStatus === 'partial_payment' && (
          <Button variant="contained" onClick={() => onPayClick?.(application)} endIcon={<ArrowForwardOutlined />} sx={primarySx}>
            Complete remaining payment
          </Button>
        )}
        {effectiveStatus === 'enrolled' && (
          <Button
            variant="contained"
            component="a"
            href={`${process.env.NEXT_PUBLIC_APP_URL || 'https://app.neramclasses.com'}/welcome`}
            target="_blank"
            rel="noopener"
            endIcon={<NorthEastOutlined />}
            sx={primarySx}
          >
            Go to the student app
          </Button>
        )}
        {isDraft && (
          <Button variant="outlined" startIcon={<EditOutlined />} onClick={() => onEdit(application)} sx={outlineSx}>
            Continue
          </Button>
        )}
        {canEdit && (
          <Button variant="outlined" startIcon={<EditOutlined />} onClick={() => onEdit(application)} sx={outlineSx}>
            Edit
          </Button>
        )}
        {!isDraft && (
          <Button
            variant="outlined"
            startIcon={<VisibilityOutlined />}
            onClick={() => onViewClick?.({ ...application, _effectiveStatus: effectiveStatus })}
            sx={outlineSx}
          >
            View
          </Button>
        )}
        {!isDraft && (
          <Button variant="text" onClick={() => onDelete(application)} sx={{ ...quietTextButtonSx, ml: 'auto' }}>
            Delete
          </Button>
        )}
      </Box>
    </Box>
  );
}

// ============================================
// PERSONAL DETAILS SUMMARY
// ============================================

function PersonalSummary({ application }: { application: any }) {
  const location = [application.city, application.state].filter(Boolean).join(', ');
  const category = CATEGORY_LABELS[application.applicant_category] || '';
  const rows = [
    application.first_name && {
      label: 'Name',
      value: `${application.first_name}${application.father_name ? ` (S/D of ${application.father_name})` : ''}`,
    },
    location && { label: 'Place', value: location },
    category && { label: 'Category', value: category },
  ].filter(Boolean) as { label: string; value: string }[];

  if (rows.length === 0) return null;

  return (
    <Box component="section" sx={{ borderTop: `1px solid ${t.ink}`, pt: 2 }}>
      <Typography component="h2" sx={{ m: 0, mb: 1, fontSize: 17, fontWeight: 700, color: t.ink }}>
        Your details
      </Typography>
      <Box component="dl" sx={{ m: 0 }}>
        {rows.map((row) => (
          <Box
            key={row.label}
            sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 1.25, borderBottom: `1px solid ${t.line}` }}
          >
            <Box component="dt" sx={{ m: 0, fontSize: 13, color: t.inkMuted }}>{row.label}</Box>
            <Box component="dd" sx={{ m: 0, fontSize: 15, fontWeight: 600, color: t.ink, textAlign: 'right' }}>{row.value}</Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// ============================================
// MAIN DASHBOARD COMPONENT
// ============================================

export default function ApplicationDashboard() {
  const {
    existingApplications,
    prefillFromExistingApplication,
    setReturnUserMode,
    setActiveStep,
    setDraftId,
    formData,
    setFormData,
    removeApplication,
    refreshApplications,
  } = useFormContext();

  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<any | null>(null);
  const [viewTarget, setViewTarget] = useState<any | null>(null);

  // Latest submitted application for personal summary
  const latestApp = existingApplications.find(
    (a) => a.status !== 'draft'
  ) || existingApplications[0];

  const userName = latestApp?.first_name || formData.personal.firstName || '';

  const handleEditApplication = (app: any) => {
    prefillFromExistingApplication(app);
    setDraftId(app.id);
    setReturnUserMode('edit');
    setActiveStep(0 as FormStep);
  };

  const handleAddCourse = () => {
    if (latestApp) {
      prefillFromExistingApplication(latestApp);
      // Clear course data so user selects a new course
      setFormData((prev) => ({
        ...prev,
        course: {
          interestCourse: null,
          selectedCourseId: null,
          selectedCenterId: null,
          selectedCenterName: null,
          hybridLearningAccepted: false,
          learningMode: 'hybrid',
          feeStructureId: null,
          feeStructureLabel: null,
          programType: null,
        },
        termsAccepted: false,
      }));
    }
    setDraftId(null);
    setReturnUserMode('add-course');
    setActiveStep(1 as FormStep);
  };

  const handleNewApplication = () => {
    setReturnUserMode('new-form');
    setActiveStep(0 as FormStep);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);

    const success = await removeApplication(deleteTarget.id);

    setIsDeleting(false);
    if (success) {
      setDeleteTarget(null);
    } else {
      setDeleteError('Failed to delete application. Please try again.');
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3.5 }}>
      {/* Welcome header */}
      <Box component="header" sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        <Typography component="p" sx={applyEyebrowSx}>Your applications</Typography>
        <Typography component="h1" sx={h1Sx}>
          {userName ? `Welcome back, ${userName}` : 'Welcome back'}
        </Typography>
        <Typography component="p" sx={{ m: 0, fontSize: 17, lineHeight: 1.55, color: t.inkMuted }}>
          Manage your applications or add another course.
        </Typography>
      </Box>

      {/* Application cards */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {existingApplications.map((app) => (
          <ApplicationCard
            key={app.id}
            application={app}
            onEdit={handleEditApplication}
            onDelete={setDeleteTarget}
            onPayClick={setPaymentTarget}
            onViewClick={setViewTarget}
          />
        ))}
      </Box>

      {/* Start another application: carries the details over; a fresh form is the quiet alternative */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
        <Button
          variant="outlined"
          fullWidth
          startIcon={<AddOutlined />}
          onClick={handleAddCourse}
          sx={{
            minHeight: 52,
            px: '18px',
            justifyContent: 'flex-start',
            borderRadius: `${t.radius}px`,
            border: `1px dashed ${t.lineStrong}`,
            bgcolor: t.surface,
            color: t.ink,
            fontSize: 15,
            fontWeight: 700,
            textTransform: 'none',
            transition: 'border-color 150ms ease',
            '&:hover': { bgcolor: t.surface, borderColor: t.gold500, borderStyle: 'dashed' },
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            ...focusSx,
          }}
        >
          Start another application
        </Button>
        <Typography component="p" sx={{ m: 0, fontSize: 13, lineHeight: 1.45, color: t.inkMuted }}>
          Your personal and academic details carry over to the new application.
        </Typography>
        <Button variant="text" onClick={handleNewApplication} sx={{ ...quietTextButtonSx, ml: -1, color: t.ink }}>
          Start a fresh application instead
        </Button>
      </Box>

      {latestApp && <PersonalSummary application={latestApp} />}

      {/* View Application Dialog */}
      <ViewApplicationDialog
        open={!!viewTarget}
        onClose={() => setViewTarget(null)}
        applicationId={viewTarget?.id || null}
        applicationNumber={viewTarget?.application_number || null}
        status={viewTarget?._effectiveStatus || viewTarget?.status || null}
      />

      {/* Payment Dialog */}
      <PaymentDialog
        open={!!paymentTarget}
        leadId={paymentTarget?.id || null}
        onClose={() => setPaymentTarget(null)}
        onPaymentComplete={async () => {
          await refreshApplications();
          setPaymentTarget(null);
        }}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => { if (!isDeleting) setDeleteTarget(null); }}
        fullWidth
        maxWidth="xs"
        aria-labelledby="delete-application-title"
      >
        <DialogTitle id="delete-application-title" sx={{ color: t.ink, fontWeight: 800, fontSize: '1.25rem' }}>
          Delete application?
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: t.inkMuted, fontSize: 15, lineHeight: 1.55 }}>
            Are you sure you want to delete application{' '}
            <Box component="strong" sx={{ color: t.ink, fontFamily: t.fontMono }}>
              {deleteTarget?.application_number || 'this application'}
            </Box>
            ? This will remove it from your dashboard. Contact support if you need it restored.
          </DialogContentText>
          {deleteError && (
            <Box role="alert" sx={{ ...railCardSx(APPLY_ERROR), mt: 2, fontSize: 14, color: t.ink }}>
              {deleteError}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button variant="outlined" onClick={() => setDeleteTarget(null)} disabled={isDeleting} sx={outlineSx}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleDeleteConfirm} disabled={isDeleting} sx={{ ...primarySx, minHeight: 44 }}>
            {isDeleting ? 'Deleting' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
