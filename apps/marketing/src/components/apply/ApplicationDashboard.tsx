'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  Divider,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  CircularProgress,
} from '@neram/ui';
import {
  EditIcon,
  AddIcon,
  SchoolIcon,
  PersonIcon,
  LocationOnIcon,
  CalendarTodayIcon,
  DeleteIcon,
  CheckCircleIcon,
} from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';
import { useFormContext } from './FormContext';
import type { FormStep } from './types';
import VisibilityIcon from '@mui/icons-material/Visibility';
import LinearProgress from '@mui/material/LinearProgress';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PaymentDialog from './PaymentDialog';
import ViewApplicationDialog from './ViewApplicationDialog';
import RefundRequestButton from './RefundRequestButton';
import RefundStatusBanner from './RefundStatusBanner';
import type { RefundRequest } from '@neram/database';

// ============================================
// STATUS CONFIGURATION
// ============================================

const STATUS_CONFIG: Record<string, { label: string; color: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info' }> = {
  submitted: { label: 'Submitted', color: 'info' },
  under_review: { label: 'Under Review', color: 'warning' },
  approved: { label: 'Approved', color: 'success' },
  rejected: { label: 'Rejected', color: 'error' },
  pending_verification: { label: 'Pending Verification', color: 'warning' },
  draft: { label: 'Draft', color: 'default' },
  enrolled: { label: 'Enrolled', color: 'success' },
  partial_payment: { label: 'Partial Payment', color: 'warning' },
};

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
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
        <CircularProgress size={20} />
      </Box>
    );
  }

  if (!payment) return null;

  // Show refund status banner if request exists
  if (refundRequest) {
    return <RefundStatusBanner refundRequest={refundRequest} />;
  }

  // Show refund request button if within 24-hour window
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
        // Silently fail — fallback to status-based rendering
      }
    }
    checkPaymentStatus();
  }, [application.status, application.id, user]);

  // Determine effective status
  const effectiveStatus = isFullyPaid ? 'enrolled'
    : isPartiallyPaid ? 'partial_payment'
    : application.status;
  const status = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.submitted;
  const course = COURSE_LABELS[application.interest_course] || application.interest_course || 'Not Selected';
  const submittedDate = application.submitted_at || application.updated_at || application.created_at;
  const formattedDate = submittedDate
    ? new Date(submittedDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 2, sm: 2.5 },
        borderRadius: 1,
        '&:hover': { borderColor: 'primary.main', boxShadow: 1 },
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
    >
      {/* Top row: App number + Status */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
        <Typography variant="subtitle2" fontWeight={600} sx={{ fontFamily: 'monospace' }}>
          {application.application_number || 'DRAFT'}
        </Typography>
        <Chip
          label={status.label}
          color={status.color}
          size="small"
          sx={{ fontWeight: 600, fontSize: '0.7rem' }}
        />
      </Box>

      {/* Course */}
      <Box display="flex" alignItems="center" gap={1} mb={0.75}>
        <SchoolIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
        <Typography variant="body2" fontWeight={500}>
          {course}
        </Typography>
      </Box>

      {/* Date */}
      {formattedDate && (
        <Box display="flex" alignItems="center" gap={1} mb={1.5}>
          <CalendarTodayIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
          <Typography variant="caption" color="text.secondary">
            {application.status === 'draft' ? 'Last saved' : 'Submitted'}: {formattedDate}
          </Typography>
        </Box>
      )}

      {/* Approved — Payment CTA (only if not fully paid) */}
      {effectiveStatus === 'approved' && (
        <Box
          sx={{
            mb: 1.5,
            p: 2,
            borderRadius: 1,
            bgcolor: '#E8F5E9',
            border: '2px solid',
            borderColor: 'success.main',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <CheckCircleIcon sx={{ color: 'success.main', fontSize: 22 }} />
            <Typography variant="subtitle2" fontWeight={700} color="success.dark">
              Application Approved!
            </Typography>
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontSize: 13, lineHeight: 1.5 }}>
            Almost there! Complete your fee payment to confirm enrollment.
          </Typography>

          {/* Fee preview */}
          {application.final_fee && (
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1 }}>
              <Typography variant="h6" fontWeight={800} color="success.dark">
                Rs. {Number(application.final_fee - (application.full_payment_discount || 0)).toLocaleString('en-IN')}
              </Typography>
              {application.full_payment_discount > 0 && (
                <Typography variant="body2" sx={{ textDecoration: 'line-through', color: 'text.disabled' }}>
                  Rs. {Number(application.final_fee).toLocaleString('en-IN')}
                </Typography>
              )}
            </Box>
          )}

          {/* Savings chip */}
          {application.full_payment_discount > 0 && (
            <Chip
              label={`Save Rs. ${Number(application.full_payment_discount).toLocaleString('en-IN')} with full payment!`}
              color="success"
              size="small"
              sx={{ fontWeight: 600, mb: 1.5, fontSize: 11 }}
            />
          )}

          {/* Payment deadline urgency */}
          {application.payment_deadline && (() => {
            const daysLeft = Math.ceil((new Date(application.payment_deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            if (daysLeft > 0 && daysLeft <= 7) {
              return (
                <Typography variant="caption" color="error.main" fontWeight={600} display="block" sx={{ mb: 1 }}>
                  Only {daysLeft} day{daysLeft > 1 ? 's' : ''} left to pay!
                </Typography>
              );
            }
            return null;
          })()}

          <Button
            fullWidth
            variant="contained"
            color="success"
            size="large"
            onClick={() => onPayClick?.(application)}
            sx={{
              fontWeight: 700, borderRadius: 1, py: 1.5,
              bgcolor: '#2E7D32',
              '&:hover': { bgcolor: '#1B5E20' },
            }}
          >
            Complete Fee Payment: Final Step
          </Button>
        </Box>
      )}

      {/* Enrolled — Show enrollment confirmation + onboarding link + refund option */}
      {['enrolled', 'partial_payment'].includes(effectiveStatus) && (
        <Box
          sx={{
            mb: 1.5,
            p: 2,
            borderRadius: 1,
            bgcolor: effectiveStatus === 'enrolled' ? '#E8F5E9' : '#FFF3E0',
            border: '1px solid',
            borderColor: effectiveStatus === 'enrolled' ? 'success.light' : '#FFE0B2',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <CheckCircleIcon sx={{ color: effectiveStatus === 'enrolled' ? 'success.main' : '#F57C00', fontSize: 22 }} />
            <Typography variant="subtitle2" fontWeight={700} color={effectiveStatus === 'enrolled' ? 'success.dark' : '#E65100'}>
              {effectiveStatus === 'enrolled' ? 'Enrolled Successfully!' : 'Partial Payment Received'}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13, mb: 1.5 }}>
            {effectiveStatus === 'enrolled'
              ? 'Your enrollment is confirmed. Welcome to Neram Classes!'
              : 'First installment received. Complete remaining payment on schedule.'}
          </Typography>

          {/* Payment progress bar for partial_payment */}
          {effectiveStatus === 'partial_payment' && paymentData && (
            <Box sx={{ mb: 1.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Paid: Rs. {Number(paymentData.totalPaid).toLocaleString('en-IN')}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Due: Rs. {Number(paymentData.remainingAmount).toLocaleString('en-IN')}
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={paymentData.finalFee > 0 ? (paymentData.totalPaid / paymentData.finalFee) * 100 : 0}
                sx={{ height: 8, borderRadius: 4, bgcolor: '#FFE0B2', '& .MuiLinearProgress-bar': { bgcolor: '#F57C00' } }}
              />
            </Box>
          )}

          {/* CTA Buttons */}
          <Box sx={{ display: 'flex', gap: 1, flexDirection: { xs: 'column', sm: 'row' } }}>
            {effectiveStatus === 'enrolled' && (
              <Button
                variant="contained"
                color="success"
                href={`${process.env.NEXT_PUBLIC_APP_URL || 'https://app.neramclasses.com'}/welcome`}
                component="a"
                target="_blank"
                endIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
                fullWidth
                sx={{ fontWeight: 700, borderRadius: 1, py: 1.2 }}
              >
                Go to Student Dashboard
              </Button>
            )}
            {effectiveStatus === 'partial_payment' && (
              <Button
                variant="contained"
                onClick={() => onPayClick?.(application)}
                fullWidth
                sx={{
                  fontWeight: 700, borderRadius: 1, py: 1.2,
                  bgcolor: '#E65100', '&:hover': { bgcolor: '#BF360C' },
                }}
              >
                Complete Remaining Payment
              </Button>
            )}
          </Box>

          {/* Refund request/status within card */}
          <EnrolledRefundInfo leadProfileId={application.id} />
        </Box>
      )}

      {/* Action buttons */}
      <Box display="flex" gap={1} mt={0.5}>
        {['submitted', 'draft', 'pending_verification'].includes(application.status) && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<EditIcon />}
            onClick={() => onEdit(application)}
            sx={{ minHeight: 40, flex: 1 }}
          >
            Edit Application
          </Button>
        )}
        {application.status !== 'draft' && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<VisibilityIcon />}
            onClick={() => onViewClick?.({ ...application, _effectiveStatus: effectiveStatus })}
            sx={{ minHeight: 40, flex: 1 }}
          >
            View Application
          </Button>
        )}
        {application.status !== 'draft' && (
          <Button
            variant="outlined"
            size="small"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => onDelete(application)}
            sx={{ minHeight: 40 }}
          >
            Delete
          </Button>
        )}
      </Box>
    </Paper>
  );
}

// ============================================
// PERSONAL DETAILS SUMMARY
// ============================================

function PersonalSummary({ application }: { application: any }) {
  const location = [application.city, application.state].filter(Boolean).join(', ');
  const category = CATEGORY_LABELS[application.applicant_category] || '';

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 1 }}>
      <Typography variant="subtitle2" fontWeight={600} mb={1.5}>
        Your Details
      </Typography>
      <Box display="flex" flexDirection="column" gap={1}>
        {application.first_name && (
          <Box display="flex" alignItems="center" gap={1}>
            <PersonIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
            <Typography variant="body2">
              {application.first_name}
              {application.father_name ? ` (S/D of ${application.father_name})` : ''}
            </Typography>
          </Box>
        )}
        {location && (
          <Box display="flex" alignItems="center" gap={1}>
            <LocationOnIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
            <Typography variant="body2">{location}</Typography>
          </Box>
        )}
        {category && (
          <Box display="flex" alignItems="center" gap={1}>
            <SchoolIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
            <Typography variant="body2">{category}</Typography>
          </Box>
        )}
      </Box>
    </Paper>
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
        },
        termsAccepted: false,
      }));
    }
    setDraftId(null);
    setReturnUserMode('add-course');
    setActiveStep(2 as FormStep);
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
    <Box sx={{ py: { xs: 2, md: 4 }, maxWidth: 600, mx: 'auto' }}>
      {/* Welcome Header */}
      <Box mb={3}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          {userName ? `Welcome back, ${userName}!` : 'Welcome back!'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Manage your applications or add another course.
        </Typography>
      </Box>

      {/* Application Cards */}
      <Typography variant="subtitle1" fontWeight={600} mb={1.5}>
        Your Applications
      </Typography>
      <Box display="flex" flexDirection="column" gap={2} mb={3}>
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

      <Divider sx={{ my: 3 }} />

      {/* Quick Actions */}
      <Typography variant="subtitle1" fontWeight={600} mb={1.5}>
        Quick Actions
      </Typography>
      <Box display="flex" flexDirection="column" gap={1.5}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddCourse}
          fullWidth
          sx={{ minHeight: 48, justifyContent: 'flex-start', px: 2.5 }}
        >
          Add Another Course
        </Button>
        <Button
          variant="outlined"
          onClick={handleNewApplication}
          fullWidth
          sx={{ minHeight: 48, justifyContent: 'flex-start', px: 2.5 }}
        >
          Start Fresh Application
        </Button>
      </Box>

      {/* Personal Details Summary */}
      {latestApp && (
        <Box mt={3}>
          <PersonalSummary application={latestApp} />
        </Box>
      )}

      {/* Info */}
      <Alert severity="info" sx={{ mt: 3 }}>
        <Typography variant="body2">
          Your personal and academic details are automatically carried over when adding a new course.
        </Typography>
      </Alert>

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
      >
        <DialogTitle>Delete Application?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete application{' '}
            <strong>{deleteTarget?.application_number || 'this application'}</strong>?
            This will remove it from your dashboard. Contact support if you need it restored.
          </DialogContentText>
          {deleteError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {deleteError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setDeleteTarget(null)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={isDeleting}
            sx={{ minHeight: 40 }}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
