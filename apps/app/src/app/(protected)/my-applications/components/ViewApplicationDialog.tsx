'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Skeleton,
  Alert,
  Stack,
  IconButton,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import {
  PersonOutlined,
  SchoolOutlined,
  LocalOfferOutlined,
  CardGiftcardOutlined,
  ShareOutlined,
  ScheduleOutlined,
  CloseOutlined,
  EditOutlined,
  CheckCircleOutlined,
  HourglassEmptyOutlined,
  CancelOutlined,
  PendingOutlined,
  DeleteOutlined,
  PaymentOutlined,
} from '@mui/icons-material';
import { useFirebaseAuth } from '@neram/auth';
import Link from 'next/link';
import type { ApplicationStatus } from '@neram/database';

// ============================================
// TYPES
// ============================================

interface ApplicationDetails {
  application: Record<string, any>;
  sourceTracking: Record<string, any> | null;
  scholarship: Record<string, any> | null;
  cashbackClaims: Array<Record<string, any>>;
}

interface ViewApplicationDialogProps {
  open: boolean;
  onClose: () => void;
  applicationId: string | null;
  applicationNumber: string | null;
  status: ApplicationStatus | null;
}

// ============================================
// DISPLAY MAPPINGS
// ============================================

const displayMappings: Record<string, Record<string, string>> = {
  board: {
    cbse: 'CBSE',
    icse: 'ICSE',
    state: 'State Board',
    ib: 'IB',
    other: 'Other',
  },
  currentClass: {
    '10th': '10th Standard',
    '11th': '11th Standard',
    '12th': '12th Standard',
    passed: 'Already Passed 12th',
  },
  courseInterest: {
    nata: 'NATA Preparation',
    jee_paper2: 'JEE Paper 2 (B.Arch)',
    both: 'Both NATA & JEE Paper 2',
    not_sure: 'Not Sure Yet',
  },
  batchPreference: {
    morning: 'Morning (6 AM - 9 AM)',
    afternoon: 'Afternoon (2 PM - 5 PM)',
    evening: 'Evening (5 PM - 8 PM)',
    weekend: 'Weekends Only',
  },
  sourceCategory: {
    youtube: 'YouTube',
    instagram: 'Instagram',
    facebook: 'Facebook',
    google_search: 'Google Search',
    friend_referral: 'Friend / Family Referral',
    school_visit: 'School Visit',
    newspaper: 'Newspaper / Magazine',
    hoarding: 'Hoarding / Banner',
    whatsapp: 'WhatsApp',
    other: 'Other',
  },
  gender: {
    male: 'Male',
    female: 'Female',
    other: 'Other',
    prefer_not_to_say: 'Prefer Not to Say',
  },
  learningMode: {
    hybrid: 'Hybrid (Online + Offline)',
    online_only: '100% Online',
  },
  schoolType: {
    private_school: 'Private School',
    government_aided: 'Government-Aided School',
    government_school: 'Government School',
  },
  applicantCategory: {
    school_student: 'School Student',
    diploma_student: 'Diploma Student',
    college_student: 'College Student',
    working_professional: 'Working Professional',
  },
  casteCategory: {
    general: 'General',
    obc: 'OBC',
    sc: 'SC',
    st: 'ST',
    ews: 'EWS',
    other: 'Other',
  },
  scholarshipStatus: {
    not_eligible: 'Not Eligible',
    eligible_pending: 'Eligible — Pending',
    documents_submitted: 'Documents Submitted',
    under_review: 'Under Review',
    approved: 'Approved',
    rejected: 'Rejected',
    revision_requested: 'Revision Requested',
  },
  cashbackType: {
    youtube_subscription: 'YouTube Subscription',
    instagram_follow: 'Instagram Follow',
    direct_payment: 'Direct Payment Bonus',
  },
  cashbackStatus: {
    pending: 'Pending',
    verified: 'Verified',
    processed: 'Processed',
    rejected: 'Rejected',
    expired: 'Expired',
  },
};

const STATUS_CONFIG: Record<string, { label: string; color: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info'; icon: React.ReactElement }> = {
  draft: { label: 'Draft', color: 'default', icon: <EditOutlined fontSize="small" /> },
  pending_verification: { label: 'Pending Verification', color: 'warning', icon: <HourglassEmptyOutlined fontSize="small" /> },
  submitted: { label: 'Submitted', color: 'info', icon: <PendingOutlined fontSize="small" /> },
  under_review: { label: 'Under Review', color: 'primary', icon: <HourglassEmptyOutlined fontSize="small" /> },
  approved: { label: 'Approved', color: 'success', icon: <CheckCircleOutlined fontSize="small" /> },
  rejected: { label: 'Rejected', color: 'error', icon: <CancelOutlined fontSize="small" /> },
  deleted: { label: 'Deleted', color: 'default', icon: <DeleteOutlined fontSize="small" /> },
  enrolled: { label: 'Enrolled', color: 'success', icon: <CheckCircleOutlined fontSize="small" /> },
  partial_payment: { label: 'Partial Payment', color: 'warning', icon: <PaymentOutlined fontSize="small" /> },
};

// ============================================
// HELPERS
// ============================================

function getDisplayValue(field: string, value: string | null | undefined): string | null {
  if (!value) return null;
  return displayMappings[field]?.[value] || value;
}

function formatDate(dateString: string | null | undefined): string | null {
  if (!dateString) return null;
  return new Date(dateString).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  // Format Indian phone: 98765 43210
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  return phone;
}

// ============================================
// SUB-COMPONENTS
// ============================================

function Section({ title, icon, children }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        {icon}
        <Typography variant="subtitle2" fontWeight={600} sx={{ fontSize: { xs: '0.875rem', sm: '0.9375rem' } }}>
          {title}
        </Typography>
      </Box>
      {children}
    </Paper>
  );
}

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === '') return null;
  return (
    <Box sx={{ display: 'flex', py: 0.5 }}>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ width: { xs: '40%', sm: '35%' }, flexShrink: 0, fontSize: '0.8125rem' }}
      >
        {label}
      </Typography>
      <Typography
        variant="body2"
        fontWeight={500}
        sx={{ flex: 1, fontSize: '0.8125rem', wordBreak: 'break-word' }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function SectionSkeleton() {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, mb: 2 }}>
      <Skeleton variant="text" width="40%" height={24} sx={{ mb: 1.5 }} />
      <Skeleton variant="text" width="100%" height={20} sx={{ mb: 0.5 }} />
      <Skeleton variant="text" width="80%" height={20} sx={{ mb: 0.5 }} />
      <Skeleton variant="text" width="90%" height={20} sx={{ mb: 0.5 }} />
      <Skeleton variant="text" width="70%" height={20} />
    </Paper>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function ViewApplicationDialog({
  open,
  onClose,
  applicationId,
  applicationNumber,
  status,
}: ViewApplicationDialogProps) {
  const { user } = useFirebaseAuth();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [details, setDetails] = useState<ApplicationDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !applicationId || !user) {
      return;
    }

    let cancelled = false;

    const fetchDetails = async () => {
      setLoading(true);
      setError(null);

      try {
        const idToken = await (user.raw as any)?.getIdToken?.();
        if (!idToken) {
          setError('Unable to authenticate. Please try refreshing the page.');
          return;
        }

        const response = await fetch(`/api/application/${applicationId}/details`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });

        const data = await response.json();

        if (cancelled) return;

        if (data.success) {
          setDetails(data.data);
        } else {
          setError(data.error || 'Failed to load application details');
        }
      } catch {
        if (!cancelled) {
          setError('An error occurred while loading details');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchDetails();

    return () => {
      cancelled = true;
    };
  }, [open, applicationId, user]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      // Small delay to avoid flash during close animation
      const timer = setTimeout(() => {
        setDetails(null);
        setError(null);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const app = details?.application;
  const statusConfig = status ? STATUS_CONFIG[status] : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      fullScreen={fullScreen}
      PaperProps={{
        sx: fullScreen ? {} : { maxHeight: '90vh' },
      }}
    >
      {/* Header */}
      <DialogTitle sx={{ pb: 1, pr: 6 }}>
        <Typography variant="h6" fontWeight={600} sx={{ fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>
          Application Details
        </Typography>
        {applicationNumber && (
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', mt: 0.25 }}>
            {applicationNumber}
          </Typography>
        )}
        <IconButton
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
          aria-label="close"
        >
          <CloseOutlined />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: { xs: 2, sm: 3 } }}>
        {/* Error state */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Loading state */}
        {loading && (
          <Box>
            <SectionSkeleton />
            <SectionSkeleton />
            <SectionSkeleton />
          </Box>
        )}

        {/* Content */}
        {!loading && details && app && (
          <Box>
            {/* Status Bar */}
            {statusConfig && (
              <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" color="text.secondary">Status:</Typography>
                <Chip
                  size="small"
                  icon={statusConfig.icon}
                  label={statusConfig.label}
                  color={statusConfig.color}
                />
              </Box>
            )}

            {/* Section 1: Personal Details */}
            <Section title="Personal Details" icon={<PersonOutlined color="primary" fontSize="small" />}>
              <InfoRow label="Full Name" value={app.full_name} />
              <InfoRow label="Email" value={app.email} />
              <InfoRow label="Phone" value={formatPhone(app.phone)} />
              <InfoRow label="Date of Birth" value={formatDate(app.date_of_birth)} />
              <InfoRow label="Gender" value={getDisplayValue('gender', app.gender)} />
              {(app.address || app.city || app.state || app.pincode) && (
                <>
                  <Divider sx={{ my: 1 }} />
                  <InfoRow label="Address" value={app.address} />
                  <InfoRow label="City" value={app.city} />
                  <InfoRow label="State" value={app.state} />
                  <InfoRow label="Pincode" value={app.pincode} />
                </>
              )}
            </Section>

            {/* Section 2: Education */}
            <Section title="Education" icon={<SchoolOutlined color="primary" fontSize="small" />}>
              <InfoRow label="Category" value={getDisplayValue('applicantCategory', app.applicant_category)} />
              <InfoRow label="School Name" value={app.school_name} />
              <InfoRow label="Board" value={getDisplayValue('board', app.board)} />
              <InfoRow label="Class" value={getDisplayValue('currentClass', app.current_class)} />
              <InfoRow label="Stream" value={app.stream ? app.stream.charAt(0).toUpperCase() + app.stream.slice(1) : null} />
              <Divider sx={{ my: 1 }} />
              <InfoRow label="Course Interest" value={getDisplayValue('courseInterest', app.course_interest || app.interest_course)} />
              <InfoRow label="Batch Preference" value={getDisplayValue('batchPreference', app.batch_preference)} />
              <InfoRow label="Learning Mode" value={getDisplayValue('learningMode', app.learning_mode)} />
              <InfoRow label="Target Exam Year" value={app.target_exam_year} />
              <InfoRow label="School Type" value={getDisplayValue('schoolType', app.school_type)} />
              <InfoRow label="Caste Category" value={getDisplayValue('casteCategory', app.caste_category)} />
            </Section>

            {/* Section 3: Scholarship (conditional) */}
            {(details.scholarship || app.scholarship_eligible) && (
              <Section title="Scholarship" icon={<LocalOfferOutlined color="success" fontSize="small" />}>
                {details.scholarship ? (
                  <>
                    {details.scholarship.scholarship_percentage > 0 && (
                      <Alert severity="success" sx={{ mb: 1.5, py: 0.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Typography variant="body2">
                            Eligible for {details.scholarship.scholarship_percentage}% scholarship
                          </Typography>
                          <Chip
                            label={`${details.scholarship.scholarship_percentage}% OFF`}
                            color="success"
                            size="small"
                            sx={{ fontWeight: 600, ml: 1 }}
                          />
                        </Box>
                      </Alert>
                    )}
                    <InfoRow label="Government School" value={details.scholarship.is_government_school ? 'Yes' : 'No'} />
                    <InfoRow label="Years in Govt School" value={details.scholarship.government_school_years || null} />
                    <InfoRow label="Low Income" value={details.scholarship.is_low_income ? 'Yes' : 'No'} />
                    <InfoRow label="School ID Card" value={details.scholarship.school_id_card_url ? 'Uploaded' : 'Not uploaded'} />
                    {details.scholarship.is_low_income && (
                      <InfoRow label="Income Certificate" value={details.scholarship.income_certificate_url ? 'Uploaded' : 'Not uploaded'} />
                    )}
                    <Divider sx={{ my: 1 }} />
                    <InfoRow label="Scholarship Status" value={getDisplayValue('scholarshipStatus', details.scholarship.scholarship_status)} />
                    {details.scholarship.approved_fee != null && (
                      <InfoRow label="Approved Fee" value={`Rs. ${Number(details.scholarship.approved_fee).toLocaleString('en-IN')}`} />
                    )}
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    You are eligible for scholarship. Submit your documents to apply.
                  </Typography>
                )}
              </Section>
            )}

            {/* Section 4: Cashback Offers (conditional) */}
            {(details.cashbackClaims.length > 0 || app.total_cashback_eligible > 0) && (
              <Section title="Cashback Offers" icon={<CardGiftcardOutlined color="primary" fontSize="small" />}>
                {details.cashbackClaims.length > 0 ? (
                  <Stack spacing={1}>
                    {details.cashbackClaims.map((claim: Record<string, any>, index: number) => (
                      <Box key={index} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box>
                          <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
                            {getDisplayValue('cashbackType', claim.cashback_type) || claim.cashback_type}
                          </Typography>
                          {claim.instagram_username && (
                            <Typography variant="caption" color="text.secondary">
                              @{claim.instagram_username}
                            </Typography>
                          )}
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip
                            label={`Rs. ${claim.amount}`}
                            size="small"
                            color={claim.status === 'processed' ? 'success' : claim.status === 'verified' ? 'info' : 'default'}
                            sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                          />
                          <Chip
                            label={getDisplayValue('cashbackStatus', claim.status) || claim.status}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.65rem', height: 22 }}
                          />
                        </Box>
                      </Box>
                    ))}
                    <Divider />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.8125rem' }}>
                        Total Cashback Eligible
                      </Typography>
                      <Chip label={`Rs. ${app.total_cashback_eligible || 0}`} color="primary" size="small" />
                    </Box>
                  </Stack>
                ) : (
                  <InfoRow label="Total Cashback" value={`Rs. ${app.total_cashback_eligible || 0}`} />
                )}
              </Section>
            )}

            {/* Section 5: How You Found Us */}
            {details.sourceTracking && (
              <Section title="How You Found Us" icon={<ShareOutlined color="action" fontSize="small" />}>
                <InfoRow label="Source" value={getDisplayValue('sourceCategory', details.sourceTracking.source_category)} />
                <InfoRow label="Details" value={details.sourceTracking.source_detail} />
                {details.sourceTracking.source_category === 'friend_referral' && (
                  <>
                    <InfoRow label="Referred By" value={details.sourceTracking.friend_referral_name} />
                    <InfoRow label="Referral Phone" value={formatPhone(details.sourceTracking.friend_referral_phone)} />
                  </>
                )}
              </Section>
            )}

            {/* Section 6: Application Timeline */}
            <Section title="Application Timeline" icon={<ScheduleOutlined color="action" fontSize="small" />}>
              <InfoRow label="Created" value={formatDate(app.created_at)} />
              <InfoRow label="Submitted" value={formatDate(app.form_completed_at)} />
              <InfoRow label="Form Progress" value={app.form_step_completed ? `${app.form_step_completed} / 6 steps completed` : null} />
              {app.final_fee != null && (
                <>
                  <Divider sx={{ my: 1 }} />
                  <InfoRow label="Assigned Fee" value={`Rs. ${Number(app.final_fee).toLocaleString('en-IN')}`} />
                  {app.full_payment_discount != null && Number(app.full_payment_discount) > 0 && (
                    <InfoRow label="Full Payment Discount" value={`Rs. ${Number(app.full_payment_discount).toLocaleString('en-IN')}`} />
                  )}
                </>
              )}
            </Section>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 1.5 }}>
        <Button onClick={onClose} sx={{ minHeight: 40 }}>Close</Button>
        {status === 'draft' && (
          <Button
            variant="contained"
            component={Link}
            href="/apply"
            startIcon={<EditOutlined />}
            sx={{ minHeight: 40 }}
          >
            Continue Editing
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
