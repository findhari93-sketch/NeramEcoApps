'use client';

import {
  Box,
  Typography,
  Grid,
  Paper,
  Chip,
  Divider,
  Button,
  FormControlLabel,
  Checkbox,
  CircularProgress,
  Alert,
} from '@neram/ui';
import { VerifiedUser, School, Person, LocationOn, Payment, PictureAsPdf, Image as ImageIcon } from '@mui/icons-material';
import type { ApplicationFormData } from '@/components/apply/types';

const COURSE_LABELS: Record<string, string> = {
  nata: 'NATA',
  jee_paper2: 'JEE Paper 2',
  both: 'NATA + JEE Paper 2',
  not_sure: 'Not Sure Yet',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  upi_direct: 'UPI (GPay / PhonePe / Paytm)',
  bank_transfer: 'Bank Transfer (NEFT / IMPS)',
  cash: 'Cash',
};

const CATEGORY_LABELS: Record<string, string> = {
  school_student: 'School Student',
  diploma_student: 'Diploma Student',
  college_student: 'College Student',
  working_professional: 'Working Professional',
};

interface LinkData {
  interestCourse: string;
  courseName: string | null;
  batchName: string | null;
  centerName: string | null;
  learningMode: string;
  totalFee: number;
  discountAmount: number;
  finalFee: number;
  amountPaid: number;
}

interface ReviewStepProps {
  formData: ApplicationFormData;
  linkData: LinkData;
  phoneVerified: boolean;
  termsAccepted: boolean;
  setTermsAccepted: (v: boolean) => void;
  onSubmit: () => void;
  submitting: boolean;
}

function DetailRow({ label, value }: { label: string; value: string | number | null }) {
  return (
    <Box display="flex" justifyContent="space-between" py={0.75}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={500} textAlign="right">
        {value || '-'}
      </Typography>
    </Box>
  );
}

export default function ReviewStep({
  formData,
  linkData,
  phoneVerified,
  termsAccepted,
  setTermsAccepted,
  onSubmit,
  submitting,
}: ReviewStepProps) {
  const balanceDue = Math.max(0, linkData.finalFee - linkData.amountPaid);

  return (
    <Box>
      <Typography variant="h6" fontWeight={600} mb={2}>
        Review & Confirm
      </Typography>

      {/* Course Details (pre-filled, read-only) */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 3,
          bgcolor: 'primary.50',
          border: '1px solid',
          borderColor: 'primary.200',
          borderRadius: 1,
        }}
      >
        <Box display="flex" alignItems="center" gap={1} mb={1.5}>
          <School fontSize="small" color="primary" />
          <Typography variant="subtitle1" fontWeight={600} color="primary.main">
            Course Details
          </Typography>
          <Chip label="Pre-selected by Admin" size="small" color="primary" variant="outlined" />
        </Box>
        <DetailRow label="Course" value={COURSE_LABELS[linkData.interestCourse] || linkData.interestCourse} />
        {linkData.courseName && <DetailRow label="Program" value={linkData.courseName} />}
        {linkData.batchName && <DetailRow label="Batch" value={linkData.batchName} />}
        {linkData.centerName && <DetailRow label="Center" value={linkData.centerName} />}
        <DetailRow label="Learning Mode" value={linkData.learningMode === 'hybrid' ? 'Hybrid' : 'Online Only'} />

        <Divider sx={{ my: 1.5 }} />

        <DetailRow label="Total Fee" value={`₹${Number(linkData.totalFee).toLocaleString('en-IN')}`} />
        {linkData.discountAmount > 0 && (
          <DetailRow label="Discount" value={`-₹${Number(linkData.discountAmount).toLocaleString('en-IN')}`} />
        )}
        <Box display="flex" justifyContent="space-between" py={0.75}>
          <Typography variant="body2" fontWeight={700}>Final Fee</Typography>
          <Typography variant="body2" fontWeight={700}>
            ₹{Number(linkData.finalFee).toLocaleString('en-IN')}
          </Typography>
        </Box>
        <Box display="flex" justifyContent="space-between" py={0.75}>
          <Typography variant="body2" color="success.main" fontWeight={600}>Amount Paid</Typography>
          <Typography variant="body2" color="success.main" fontWeight={600}>
            ₹{Number(linkData.amountPaid).toLocaleString('en-IN')}
          </Typography>
        </Box>
        {balanceDue > 0 && (
          <Box display="flex" justifyContent="space-between" py={0.75}>
            <Typography variant="body2" color="error.main" fontWeight={600}>Balance Due</Typography>
            <Typography variant="body2" color="error.main" fontWeight={600}>
              ₹{Number(balanceDue).toLocaleString('en-IN')}
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Personal Details */}
      <Paper
        elevation={0}
        sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
      >
        <Box display="flex" alignItems="center" gap={1} mb={1.5}>
          <Person fontSize="small" />
          <Typography variant="subtitle1" fontWeight={600}>Personal Details</Typography>
        </Box>
        <DetailRow label="Name" value={formData.personal.firstName} />
        <DetailRow label="Father's Name" value={formData.personal.fatherName} />
        <DetailRow label="Email" value={formData.personal.email} />
        <DetailRow label="Phone" value={formData.personal.phone} />
        <DetailRow label="Parent's Phone" value={formData.personal.parentPhone} />
        <DetailRow label="Date of Birth" value={formData.personal.dateOfBirth} />
        <DetailRow label="Gender" value={formData.personal.gender} />
      </Paper>

      {/* Location */}
      <Paper
        elevation={0}
        sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
      >
        <Box display="flex" alignItems="center" gap={1} mb={1.5}>
          <LocationOn fontSize="small" />
          <Typography variant="subtitle1" fontWeight={600}>Address</Typography>
        </Box>
        <DetailRow label="Pincode" value={formData.location.pincode} />
        <DetailRow label="City" value={formData.location.city} />
        <DetailRow label="District" value={formData.location.district} />
        <DetailRow label="State" value={formData.location.state} />
        <DetailRow label="Address" value={formData.location.address} />
      </Paper>

      {/* Academic Details */}
      <Paper
        elevation={0}
        sx={{ p: 2, mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
      >
        <Box display="flex" alignItems="center" gap={1} mb={1.5}>
          <School fontSize="small" />
          <Typography variant="subtitle1" fontWeight={600}>Academic Details</Typography>
        </Box>
        <DetailRow
          label="Category"
          value={formData.academic.applicantCategory ? CATEGORY_LABELS[formData.academic.applicantCategory] : null}
        />
        <DetailRow label="Caste Category" value={formData.academic.casteCategory} />
        <DetailRow label="Target Exam Year" value={formData.academic.targetExamYear} />
      </Paper>

      {/* Payment Details */}
      <Paper
        elevation={0}
        sx={{ p: 2, mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
      >
        <Box display="flex" alignItems="center" gap={1} mb={1.5}>
          <Payment fontSize="small" />
          <Typography variant="subtitle1" fontWeight={600}>Payment Details</Typography>
        </Box>
        <DetailRow
          label="Payment Date"
          value={formData.payment.paymentDate ? new Date(formData.payment.paymentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : null}
        />
        <DetailRow
          label="Payment Type"
          value={formData.payment.paymentType === 'installment' ? `Installment #${formData.payment.installmentNumber}` : 'Full Payment'}
        />
        <DetailRow
          label="Payment Method"
          value={PAYMENT_METHOD_LABELS[formData.payment.paymentMethod] || formData.payment.paymentMethod || null}
        />
        {formData.payment.transactionReference && (
          <DetailRow label="Transaction Ref" value={formData.payment.transactionReference} />
        )}
        {formData.payment.paymentProofUrl && (
          <Box display="flex" justifyContent="space-between" alignItems="center" py={0.75}>
            <Typography variant="body2" color="text.secondary">Payment Proof</Typography>
            <Box display="flex" alignItems="center" gap={0.5}>
              {formData.payment.paymentProofFileName && /\.(jpe?g|png|webp)$/i.test(formData.payment.paymentProofFileName) ? (
                <Box
                  component="img"
                  src={formData.payment.paymentProofUrl}
                  alt="Proof"
                  sx={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 0.5, border: '1px solid', borderColor: 'divider' }}
                />
              ) : (
                <PictureAsPdf sx={{ fontSize: 20, color: 'error.main' }} />
              )}
              <Typography variant="body2" fontWeight={500}>
                {formData.payment.paymentProofFileName || 'Uploaded'}
              </Typography>
            </Box>
          </Box>
        )}
      </Paper>

      {/* Phone verification warning */}
      {!phoneVerified && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Phone verification is required before you can submit. Please go back and verify your phone number.
        </Alert>
      )}

      {/* Terms */}
      <FormControlLabel
        control={
          <Checkbox
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
          />
        }
        label={
          <Typography variant="body2">
            I confirm that the information provided is correct and I agree to the{' '}
            <a href="/terms" target="_blank" style={{ color: 'inherit' }}>
              Terms & Conditions
            </a>
            .
          </Typography>
        }
        sx={{ mb: 3 }}
      />

      {/* Submit */}
      <Button
        variant="contained"
        size="large"
        fullWidth
        onClick={onSubmit}
        disabled={!termsAccepted || !phoneVerified || submitting}
        sx={{
          py: 1.5,
          fontSize: '1rem',
          fontWeight: 600,
          borderRadius: 1,
        }}
      >
        {submitting ? (
          <>
            <CircularProgress size={20} sx={{ mr: 1 }} color="inherit" />
            Enrolling...
          </>
        ) : (
          'Complete Enrollment'
        )}
      </Button>
    </Box>
  );
}
