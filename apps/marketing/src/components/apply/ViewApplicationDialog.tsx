// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Skeleton,
  IconButton,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import { tokens as t } from '@/design-system';
import { railCardSx } from './styles';
import { APPLY_ERROR } from './shell/applyTheme';
import { useFirebaseAuth } from '@neram/auth';

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
    eligible_pending: 'Eligible, Pending',
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

/** Status dot colours, shared with the dashboard's status pill. */
export const STATUS_PILL: Record<string, { label: string; dot: string }> = {
  draft: { label: 'Draft', dot: t.statusDraft },
  pending_verification: { label: 'Pending verification', dot: t.statusReview },
  submitted: { label: 'Submitted', dot: t.statusReview },
  under_review: { label: 'Under review', dot: t.statusReview },
  approved: { label: 'Approved', dot: t.statusDone },
  rejected: { label: 'Rejected', dot: APPLY_ERROR },
  deleted: { label: 'Deleted', dot: t.statusIdle },
  enrolled: { label: 'Enrolled', dot: t.statusDone },
  partial_payment: { label: 'Partial payment', dot: t.statusDraft },
};

/** Status pill: ground fill, 1px line, 100px radius, 13px/700 with an 8px dot. */
export function ApplicationStatusPill({ status }: { status: string }) {
  const config = STATUS_PILL[status] || STATUS_PILL.submitted;
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        px: 1.5,
        py: '5px',
        flexShrink: 0,
        borderRadius: `${t.radiusPill}px`,
        border: `1px solid ${t.line}`,
        bgcolor: t.ground,
        fontSize: 13,
        fontWeight: 700,
        lineHeight: 1.3,
        color: t.ink,
        whiteSpace: 'nowrap',
      }}
    >
      <Box component="span" aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: config.dot, flexShrink: 0 }} />
      {config.label}
    </Box>
  );
}

const inr = (n: number | string | null | undefined) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

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
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  return phone;
}

// ============================================
// SUB-COMPONENTS
// ============================================

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  // A ruled group, as on the Review step: 1px ink rule, h3 17px/700, a <dl>.
  return (
    <Box component="section" sx={{ borderTop: `1px solid ${t.ink}`, pt: 2, pb: 2.5 }}>
      <Typography component="h3" sx={{ m: 0, mb: 1, fontSize: 17, fontWeight: 700, color: t.ink }}>
        {title}
      </Typography>
      <Box component="dl" sx={{ m: 0 }}>{children}</Box>
    </Box>
  );
}

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === '') return null;
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 38%) minmax(0, 1fr)' },
        columnGap: 2,
        rowGap: 0.25,
        py: 1,
        borderBottom: `1px solid ${t.line}`,
      }}
    >
      <Box component="dt" sx={{ m: 0, fontSize: 13, lineHeight: 1.5, color: t.inkMuted }}>{label}</Box>
      <Box component="dd" sx={{ m: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.5, color: t.ink, overflowWrap: 'anywhere' }}>
        {value}
      </Box>
    </Box>
  );
}

function SectionSkeleton() {
  return (
    <Box sx={{ borderTop: `1px solid ${t.line}`, pt: 2, pb: 2.5 }}>
      <Skeleton variant="text" width="40%" height={26} sx={{ mb: 1 }} />
      <Skeleton variant="text" width="100%" height={22} />
      <Skeleton variant="text" width="80%" height={22} />
      <Skeleton variant="text" width="90%" height={22} />
      <Skeleton variant="text" width="70%" height={22} />
    </Box>
  );
}

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
  status: string | null;
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
        const idToken = await (user?.raw as any)?.getIdToken?.();
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
      const timer = setTimeout(() => {
        setDetails(null);
        setError(null);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const app = details?.application;
  const focusSx = { '&.Mui-focusVisible, &:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' } } as const;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      fullScreen={fullScreen}
      aria-labelledby="view-application-title"
      PaperProps={{
        sx: fullScreen ? { borderRadius: 0 } : { maxHeight: '90vh' },
      }}
    >
      <DialogTitle
        component="div"
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 2,
          pr: 1.5,
          borderBottom: `1px solid ${t.line}`,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h2" id="view-application-title" sx={{ m: 0, fontSize: '1.25rem', fontWeight: 800, color: t.ink }}>
            Application details
          </Typography>
          {(applicationNumber || status) && (
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.25, mt: 0.75 }}>
              {applicationNumber && (
                <Typography component="span" sx={{ fontFamily: t.fontMono, fontSize: 14, fontWeight: 700, color: t.inkMuted }}>
                  {applicationNumber}
                </Typography>
              )}
              {status && <ApplicationStatusPill status={status} />}
            </Box>
          )}
        </Box>
        <IconButton onClick={onClose} aria-label="Close" sx={{ width: 44, height: 44, flexShrink: 0, color: t.ink, ...focusSx }}>
          <CloseOutlined />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: { xs: 2, sm: 3 }, pt: '20px !important', pb: 1 }}>
        {error && (
          <Box role="alert" sx={{ ...railCardSx(APPLY_ERROR), mb: 2, fontSize: 14, color: t.ink }}>
            {error}
          </Box>
        )}

        {loading && (
          <Box aria-busy="true" aria-label="Loading application details">
            <SectionSkeleton />
            <SectionSkeleton />
            <SectionSkeleton />
          </Box>
        )}

        {!loading && details && app && (
          <Box>
            <Section title="Personal details">
              <InfoRow label="Full name" value={app.full_name} />
              <InfoRow label="Email" value={app.email} />
              <InfoRow label="Phone" value={formatPhone(app.phone)} />
              <InfoRow label="Date of birth" value={formatDate(app.date_of_birth)} />
              <InfoRow label="Gender" value={getDisplayValue('gender', app.gender)} />
              <InfoRow label="Address" value={app.address} />
              <InfoRow label="City" value={app.city} />
              <InfoRow label="State" value={app.state} />
              <InfoRow label="Pincode" value={app.pincode} />
            </Section>

            <Section title="Education">
              <InfoRow label="Category" value={getDisplayValue('applicantCategory', app.applicant_category)} />
              <InfoRow label="School name" value={app.school_name} />
              <InfoRow label="Board" value={getDisplayValue('board', app.board)} />
              <InfoRow label="Class" value={getDisplayValue('currentClass', app.current_class)} />
              <InfoRow label="Stream" value={app.stream ? app.stream.charAt(0).toUpperCase() + app.stream.slice(1) : null} />
              <InfoRow label="Course interest" value={getDisplayValue('courseInterest', app.course_interest || app.interest_course)} />
              <InfoRow label="Batch preference" value={getDisplayValue('batchPreference', app.batch_preference)} />
              <InfoRow label="Learning mode" value={getDisplayValue('learningMode', app.learning_mode)} />
              <InfoRow label="Target exam year" value={app.target_exam_year} />
              <InfoRow label="School type" value={getDisplayValue('schoolType', app.school_type)} />
              <InfoRow label="Caste category" value={getDisplayValue('casteCategory', app.caste_category)} />
            </Section>

            {(details.scholarship || app.scholarship_eligible) && (
              <Section title="Scholarship">
                {details.scholarship ? (
                  <>
                    {details.scholarship.scholarship_percentage > 0 && (
                      <InfoRow label="Eligible for" value={`${details.scholarship.scholarship_percentage}% scholarship`} />
                    )}
                    <InfoRow label="Government school" value={details.scholarship.is_government_school ? 'Yes' : 'No'} />
                    <InfoRow label="Years in govt school" value={details.scholarship.government_school_years || null} />
                    <InfoRow label="Low income" value={details.scholarship.is_low_income ? 'Yes' : 'No'} />
                    <InfoRow label="School ID card" value={details.scholarship.school_id_card_url ? 'Uploaded' : 'Not uploaded'} />
                    {details.scholarship.is_low_income && (
                      <InfoRow label="Income certificate" value={details.scholarship.income_certificate_url ? 'Uploaded' : 'Not uploaded'} />
                    )}
                    <InfoRow label="Scholarship status" value={getDisplayValue('scholarshipStatus', details.scholarship.scholarship_status)} />
                    {details.scholarship.approved_fee != null && (
                      <InfoRow label="Approved fee" value={inr(details.scholarship.approved_fee)} />
                    )}
                  </>
                ) : (
                  <InfoRow label="Status" value="You are eligible for scholarship. Submit your documents to apply." />
                )}
              </Section>
            )}

            {(details.cashbackClaims.length > 0 || app.total_cashback_eligible > 0) && (
              <Section title="Cashback offers">
                {details.cashbackClaims.map((claim: Record<string, any>, index: number) => (
                  <InfoRow
                    key={index}
                    label={`${getDisplayValue('cashbackType', claim.cashback_type) || claim.cashback_type}${claim.instagram_username ? ` (@${claim.instagram_username})` : ''}`}
                    value={`${inr(claim.amount)} · ${getDisplayValue('cashbackStatus', claim.status) || claim.status}`}
                  />
                ))}
                <InfoRow label="Total cashback eligible" value={inr(app.total_cashback_eligible)} />
              </Section>
            )}

            {details.sourceTracking && (
              <Section title="How you found us">
                <InfoRow label="Source" value={getDisplayValue('sourceCategory', details.sourceTracking.source_category)} />
                <InfoRow label="Details" value={details.sourceTracking.source_detail} />
                {details.sourceTracking.source_category === 'friend_referral' && (
                  <>
                    <InfoRow label="Referred by" value={details.sourceTracking.friend_referral_name} />
                    <InfoRow label="Referral phone" value={formatPhone(details.sourceTracking.friend_referral_phone)} />
                  </>
                )}
              </Section>
            )}

            <Section title="Application timeline">
              <InfoRow label="Created" value={formatDate(app.created_at)} />
              <InfoRow label="Submitted" value={formatDate(app.form_completed_at)} />
              <InfoRow label="Form progress" value={app.form_step_completed ? `${app.form_step_completed} of 6 steps completed` : null} />
              {app.final_fee != null && <InfoRow label="Assigned fee" value={inr(app.final_fee)} />}
              {app.final_fee != null && app.full_payment_discount != null && Number(app.full_payment_discount) > 0 && (
                <InfoRow label="Full payment discount" value={inr(app.full_payment_discount)} />
              )}
            </Section>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 1.5, borderTop: `1px solid ${t.line}` }}>
        <Button
          variant="outlined"
          onClick={onClose}
          sx={{
            minHeight: 44,
            px: 2.5,
            borderRadius: `${t.radius}px`,
            border: `1px solid ${t.lineStrong}`,
            bgcolor: t.surface,
            color: t.ink,
            fontSize: 15,
            fontWeight: 700,
            textTransform: 'none',
            '&:hover': { bgcolor: t.navy900, color: t.paper, borderColor: t.navy900 },
            ...focusSx,
          }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
