'use client';

import {
  Box,
  Typography,
  Button,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  IconButton,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import { Close, Person, LocationOn, School, Payment } from '@mui/icons-material';

interface ApplicationDetailsDialogProps {
  open: boolean;
  onClose: () => void;
  personalData: {
    firstName?: string | null;
    email?: string | null;
    phone?: string | null;
    fatherName?: string | null;
    parentPhone?: string | null;
    dateOfBirth?: string | null;
    gender?: string | null;
  };
  locationData: {
    pincode?: string | null;
    city?: string | null;
    district?: string | null;
    state?: string | null;
    address?: string | null;
  };
  academicData: {
    applicantCategory?: string | null;
    casteCategory?: string | null;
    targetExamYear?: string | number | null;
  };
  courseData: {
    courseName?: string | null;
    totalFee?: number | null;
    amountPaid?: number | null;
    finalFee?: number | null;
    enrolledAt?: string | null;
  };
  applicationNumber?: string | null;
}

function SummaryRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <Box display="flex" justifyContent="space-between" py={0.75}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={500} textAlign="right">{value || '-'}</Typography>
    </Box>
  );
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatCategory(cat: string | null | undefined): string {
  if (!cat) return '-';
  return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ApplicationDetailsDialog({
  open,
  onClose,
  personalData,
  locationData,
  academicData,
  courseData,
  applicationNumber,
}: ApplicationDetailsDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: fullScreen ? 0 : 2 } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Box>
          <Typography variant="h6" fontWeight={700}>Application Details</Typography>
          {applicationNumber && (
            <Typography variant="caption" color="text.secondary">
              {applicationNumber}
            </Typography>
          )}
        </Box>
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ p: { xs: 2, sm: 3 } }}>
        {/* Personal Details */}
        <Paper elevation={0} sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <Person fontSize="small" color="primary" />
            <Typography variant="subtitle1" fontWeight={600}>Personal Details</Typography>
          </Box>
          <SummaryRow label="Name" value={personalData.firstName} />
          <SummaryRow label="Father's Name" value={personalData.fatherName} />
          <SummaryRow label="Email" value={personalData.email} />
          <SummaryRow label="Phone" value={personalData.phone} />
          <SummaryRow label="Parent's Phone" value={personalData.parentPhone} />
          <SummaryRow label="Date of Birth" value={formatDate(personalData.dateOfBirth)} />
          <SummaryRow label="Gender" value={formatCategory(personalData.gender)} />
        </Paper>

        {/* Address */}
        <Paper elevation={0} sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <LocationOn fontSize="small" color="primary" />
            <Typography variant="subtitle1" fontWeight={600}>Address</Typography>
          </Box>
          <SummaryRow label="Pincode" value={locationData.pincode} />
          <SummaryRow label="City" value={locationData.city} />
          <SummaryRow label="District" value={locationData.district} />
          <SummaryRow label="State" value={locationData.state} />
          <SummaryRow label="Address" value={locationData.address} />
        </Paper>

        {/* Academic Details */}
        <Paper elevation={0} sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <School fontSize="small" color="primary" />
            <Typography variant="subtitle1" fontWeight={600}>Academic Details</Typography>
          </Box>
          <SummaryRow label="Category" value={formatCategory(academicData.applicantCategory)} />
          <SummaryRow label="Caste Category" value={academicData.casteCategory?.toUpperCase()} />
          <SummaryRow label="Target Exam Year" value={academicData.targetExamYear ? String(academicData.targetExamYear) : null} />
        </Paper>

        {/* Course & Fees */}
        <Paper elevation={0} sx={{ p: 2, bgcolor: 'primary.50', border: '1px solid', borderColor: 'primary.200', borderRadius: 1 }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <Payment fontSize="small" color="primary" />
            <Typography variant="subtitle1" fontWeight={600} color="primary.main">Course & Fees</Typography>
          </Box>
          <SummaryRow label="Course" value={courseData.courseName} />
          {courseData.totalFee != null && (
            <SummaryRow label="Total Fee" value={`\u20B9${Number(courseData.totalFee).toLocaleString('en-IN')}`} />
          )}
          {courseData.amountPaid != null && (
            <SummaryRow label="Amount Paid" value={`\u20B9${Number(courseData.amountPaid).toLocaleString('en-IN')}`} />
          )}
          {courseData.enrolledAt && (
            <SummaryRow label="Enrolled On" value={formatDate(courseData.enrolledAt)} />
          )}
        </Paper>
      </DialogContent>

      <Divider />

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} variant="contained" sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 600 }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
