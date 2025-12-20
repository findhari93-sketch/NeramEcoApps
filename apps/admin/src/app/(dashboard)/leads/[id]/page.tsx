'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Paper,
  Grid,
  Chip,
  Divider,
  Tabs,
  Tab,
  Alert,
  TextField,
  Stack,
  Snackbar,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PersonIcon from '@mui/icons-material/Person';
import SchoolIcon from '@mui/icons-material/School';
import PaymentIcon from '@mui/icons-material/Payment';
import DescriptionIcon from '@mui/icons-material/Description';
import SendIcon from '@mui/icons-material/Send';
import DocumentViewer from '@/components/DocumentViewer';
import FeeCalculator, { FeeDetails } from '@/components/FeeCalculator';
import CouponGenerator, { CouponData } from '@/components/CouponGenerator';
import ScholarshipReview from '@/components/ScholarshipReview';
import CashbackSummary from '@/components/CashbackSummary';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index, ...other }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

// Mock data - replace with actual API calls
const mockLeadData = {
  id: '1',
  fullName: 'Rahul Kumar',
  email: 'rahul.kumar@gmail.com',
  phone: '9876543210',
  dob: '2006-05-15',
  gender: 'male',
  address: '123, Anna Nagar, Chennai',
  city: 'Chennai',
  state: 'Tamil Nadu',
  pincode: '600040',
  schoolName: 'Government Higher Secondary School',
  board: 'State Board',
  currentClass: '12th',
  stream: 'Science',
  courseInterest: 'both',
  batchPreference: 'evening',
  status: 'new' as 'new' | 'under_review' | 'approved' | 'rejected' | 'enrolled',
  createdAt: '2025-01-15T10:30:00Z',
  formCompletedAt: '2025-01-15T11:00:00Z',
  assignedFee: null as number | null,
  finalFee: null as number | null,
  paymentScheme: null as 'full' | 'installment' | null,
  totalCashbackEligible: 100,
  scholarship: {
    id: 'sch-1',
    isGovernmentSchool: true,
    governmentSchoolYears: 5,
    isLowIncome: true,
    scholarshipPercentage: 95,
    verificationStatus: 'pending' as 'pending' | 'verified' | 'rejected',
    schoolIdCardUrl: 'https://example.com/school-id.jpg',
    incomeCertificateUrl: 'https://example.com/income-cert.pdf',
  },
  cashbackClaims: [
    {
      id: 'cb-1',
      cashbackType: 'youtube_subscription' as const,
      amount: 50,
      status: 'verified' as 'pending' | 'verified' | 'rejected' | 'processed',
      youtubeChannelSubscribed: true,
      cashbackPhone: '9876543210',
    },
    {
      id: 'cb-2',
      cashbackType: 'instagram_follow' as const,
      amount: 50,
      status: 'pending' as 'pending' | 'verified' | 'rejected' | 'processed',
      instagramUsername: 'rahul_kumar_06',
      cashbackPhone: '9876543210',
    },
  ],
  documents: [
    {
      id: 'doc-1',
      documentType: 'school_id_card',
      fileUrl: 'https://example.com/school-id.jpg',
      fileName: 'school_id.jpg',
      isVerified: true,
      uploadedAt: '2025-01-15T10:45:00Z',
    },
    {
      id: 'doc-2',
      documentType: 'income_certificate',
      fileUrl: 'https://example.com/income-cert.pdf',
      fileName: 'income_certificate.pdf',
      isVerified: false,
      uploadedAt: '2025-01-15T10:46:00Z',
    },
  ],
  source: {
    category: 'youtube',
    detail: 'NATA 2025 Preparation Tips video',
    friendReferralName: null,
    friendReferralPhone: null,
  },
};

export default function LeadDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [lead, setLead] = useState(mockLeadData);
  const [activeTab, setActiveTab] = useState(0);
  const [adminNotes, setAdminNotes] = useState('');
  const [feeDetails, setFeeDetails] = useState<FeeDetails | null>(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  const [paymentDeadline, setPaymentDeadline] = useState('');

  // In production, fetch lead data from API
  useEffect(() => {
    // Fetch lead data by params.id
    console.log('Fetching lead:', params.id);
  }, [params.id]);

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const handleScholarshipVerify = async (status: 'verified' | 'rejected', notes?: string) => {
    // API call to update scholarship status
    setLead((prev) => ({
      ...prev,
      scholarship: {
        ...prev.scholarship,
        verificationStatus: status,
      },
    }));
    setSnackbar({
      open: true,
      message: `Scholarship ${status === 'verified' ? 'approved' : 'rejected'}!`,
      severity: status === 'verified' ? 'success' : 'error',
    });
  };

  const handleCashbackVerify = async (claimId: string, status: 'verified' | 'rejected') => {
    // API call to update cashback claim
    setLead((prev) => ({
      ...prev,
      cashbackClaims: prev.cashbackClaims.map((c) =>
        c.id === claimId ? { ...c, status } : c
      ),
    }));
    setSnackbar({
      open: true,
      message: `Cashback claim ${status}!`,
      severity: status === 'verified' ? 'success' : 'error',
    });
  };

  const handleCashbackProcess = async (claimId: string) => {
    // API call to mark cashback as processed
    setLead((prev) => ({
      ...prev,
      cashbackClaims: prev.cashbackClaims.map((c) =>
        c.id === claimId ? { ...c, status: 'processed' as const } : c
      ),
    }));
    setSnackbar({ open: true, message: 'Cashback marked as processed!', severity: 'success' });
  };

  const handleDocumentVerify = async (docId: string, verified: boolean) => {
    // API call to update document verification
    setLead((prev) => ({
      ...prev,
      documents: prev.documents.map((d) =>
        d.id === docId ? { ...d, isVerified: verified } : d
      ),
    }));
    setSnackbar({
      open: true,
      message: `Document ${verified ? 'verified' : 'unverified'}!`,
      severity: 'success',
    });
  };

  const handleCouponGenerate = async (couponData: CouponData) => {
    // API call to save coupon and send to student
    console.log('Generating coupon:', couponData);
    setSnackbar({ open: true, message: 'Coupon generated and sent to student!', severity: 'success' });
  };

  const handleApprove = async () => {
    if (!feeDetails) {
      setSnackbar({ open: true, message: 'Please configure fees first', severity: 'error' });
      return;
    }

    // API call to approve lead with fee details
    setLead((prev) => ({
      ...prev,
      status: 'approved',
      assignedFee: feeDetails.baseFee,
      finalFee: feeDetails.finalFee,
      paymentScheme: feeDetails.paymentScheme,
    }));
    setSnackbar({ open: true, message: 'Lead approved! Payment link will be sent to student.', severity: 'success' });
  };

  const handleReject = async () => {
    // API call to reject lead
    setLead((prev) => ({ ...prev, status: 'rejected' }));
    setSnackbar({ open: true, message: 'Lead rejected.', severity: 'error' });
  };

  const handleSendPaymentLink = async () => {
    // API call to send payment link via email/WhatsApp
    setSnackbar({ open: true, message: 'Payment link sent to student!', severity: 'success' });
  };

  const getStatusColor = (status: string): 'success' | 'warning' | 'error' | 'info' | 'default' => {
    switch (status) {
      case 'enrolled':
        return 'success';
      case 'approved':
        return 'info';
      case 'rejected':
        return 'error';
      case 'new':
        return 'warning';
      default:
        return 'default';
    }
  };

  const courseLabels: Record<string, string> = {
    nata: 'NATA Preparation',
    jee_paper2: 'JEE Paper 2',
    both: 'NATA & JEE Combined',
  };

  const baseFees: Record<string, number> = {
    nata: 25000,
    jee_paper2: 30000,
    both: 45000,
  };

  return (
    <Box>
      <Button
        onClick={() => router.back()}
        startIcon={<ArrowBackIcon />}
        sx={{ mb: 3 }}
        variant="outlined"
      >
        Back to Leads
      </Button>

      {/* Header */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="h4" fontWeight={600} gutterBottom>
              {lead.fullName}
            </Typography>
            <Stack direction="row" spacing={2} alignItems="center">
              <Typography variant="body1" color="text.secondary">
                {lead.email} • {lead.phone}
              </Typography>
              <Chip
                label={lead.status.toUpperCase()}
                color={getStatusColor(lead.status)}
                size="small"
              />
            </Stack>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="body2" color="text.secondary">
              Applied on
            </Typography>
            <Typography variant="body1">
              {new Date(lead.createdAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={activeTab} onChange={handleTabChange}>
          <Tab icon={<PersonIcon />} iconPosition="start" label="Profile" />
          <Tab icon={<SchoolIcon />} iconPosition="start" label="Scholarship" />
          <Tab icon={<DescriptionIcon />} iconPosition="start" label="Documents" />
          <Tab icon={<PaymentIcon />} iconPosition="start" label="Fee & Payment" />
        </Tabs>
      </Paper>

      {/* Profile Tab */}
      <TabPanel value={activeTab} index={0}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Personal Information
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Full Name</Typography>
                  <Typography variant="body1" fontWeight={500}>{lead.fullName}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Gender</Typography>
                  <Typography variant="body1" fontWeight={500} textTransform="capitalize">{lead.gender}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Date of Birth</Typography>
                  <Typography variant="body1" fontWeight={500}>
                    {lead.dob ? new Date(lead.dob).toLocaleDateString() : '-'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Phone</Typography>
                  <Typography variant="body1" fontWeight={500}>{lead.phone}</Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary">Email</Typography>
                  <Typography variant="body1" fontWeight={500}>{lead.email}</Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary">Address</Typography>
                  <Typography variant="body1" fontWeight={500}>
                    {lead.address}, {lead.city}, {lead.state} - {lead.pincode}
                  </Typography>
                </Grid>
              </Grid>
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Education & Course
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary">School</Typography>
                  <Typography variant="body1" fontWeight={500}>{lead.schoolName}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Board</Typography>
                  <Typography variant="body1" fontWeight={500}>{lead.board}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Class</Typography>
                  <Typography variant="body1" fontWeight={500}>{lead.currentClass}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Course Interest</Typography>
                  <Typography variant="body1" fontWeight={500}>
                    {courseLabels[lead.courseInterest] || lead.courseInterest}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Batch Preference</Typography>
                  <Typography variant="body1" fontWeight={500} textTransform="capitalize">
                    {lead.batchPreference}
                  </Typography>
                </Grid>
              </Grid>
            </Paper>

            <Paper sx={{ p: 3, mt: 3 }}>
              <Typography variant="h6" gutterBottom>
                Source
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="body2" color="text.secondary">How they found us</Typography>
              <Typography variant="body1" fontWeight={500} textTransform="capitalize">
                {lead.source.category.replace('_', ' ')}
                {lead.source.detail && ` - ${lead.source.detail}`}
              </Typography>
              {lead.source.friendReferralName && (
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Referred by: {lead.source.friendReferralName} ({lead.source.friendReferralPhone})
                </Typography>
              )}
            </Paper>
          </Grid>
        </Grid>
      </TabPanel>

      {/* Scholarship Tab */}
      <TabPanel value={activeTab} index={1}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <ScholarshipReview
              scholarship={lead.scholarship}
              onVerify={handleScholarshipVerify}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <CashbackSummary
              claims={lead.cashbackClaims}
              onVerify={handleCashbackVerify}
              onProcess={handleCashbackProcess}
              isEnrolled={lead.status === 'enrolled'}
            />
          </Grid>
        </Grid>
      </TabPanel>

      {/* Documents Tab */}
      <TabPanel value={activeTab} index={2}>
        <DocumentViewer
          documents={lead.documents}
          onVerify={handleDocumentVerify}
        />
      </TabPanel>

      {/* Fee & Payment Tab */}
      <TabPanel value={activeTab} index={3}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <FeeCalculator
              baseFee={baseFees[lead.courseInterest] || 25000}
              scholarshipPercentage={
                lead.scholarship?.verificationStatus === 'verified'
                  ? lead.scholarship.scholarshipPercentage
                  : 0
              }
              scholarshipVerified={lead.scholarship?.verificationStatus === 'verified'}
              cashbackEligible={lead.totalCashbackEligible}
              onChange={setFeeDetails}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <CouponGenerator
              leadName={lead.fullName}
              leadId={lead.id}
              onGenerate={handleCouponGenerate}
            />

            <Paper sx={{ p: 3, mt: 3 }}>
              <Typography variant="h6" gutterBottom>
                Payment Deadline
              </Typography>
              <TextField
                fullWidth
                type="date"
                value={paymentDeadline}
                onChange={(e) => setPaymentDeadline(e.target.value)}
                helperText="Set a deadline for payment"
                InputLabelProps={{ shrink: true }}
              />
            </Paper>
          </Grid>
        </Grid>
      </TabPanel>

      {/* Admin Notes & Actions */}
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Admin Notes & Actions
        </Typography>
        <Divider sx={{ mb: 2 }} />

        <TextField
          fullWidth
          multiline
          rows={3}
          label="Internal Notes"
          value={adminNotes}
          onChange={(e) => setAdminNotes(e.target.value)}
          placeholder="Add notes about this lead..."
          sx={{ mb: 3 }}
        />

        <Stack direction="row" spacing={2} flexWrap="wrap">
          {lead.status === 'new' && (
            <>
              <Button
                variant="contained"
                color="success"
                onClick={handleApprove}
              >
                Approve & Assign Fee
              </Button>
              <Button
                variant="outlined"
                color="error"
                onClick={handleReject}
              >
                Reject Application
              </Button>
            </>
          )}

          {lead.status === 'approved' && (
            <Button
              variant="contained"
              color="primary"
              startIcon={<SendIcon />}
              onClick={handleSendPaymentLink}
            >
              Send Payment Link
            </Button>
          )}
        </Stack>
      </Paper>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        message={snackbar.message}
      />
    </Box>
  );
}
