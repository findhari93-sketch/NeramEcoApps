'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  CardActions,
  Grid,
  Chip,
  Button,
  IconButton,
  Skeleton,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Snackbar,
  RadioGroup,
  Radio,
  FormControlLabel,
  FormLabel,
  CircularProgress,
  LinearProgress,
} from '@neram/ui';
import {
  DescriptionOutlined,
  VisibilityOutlined,
  DeleteOutlined,
  RefreshOutlined,
  AddOutlined,
  CheckCircleOutlined,
  HourglassEmptyOutlined,
  CancelOutlined,
  PendingOutlined,
  EditOutlined,
  LibraryAddOutlined,
  SchoolOutlined,
  OpenInNewOutlined,
} from '@mui/icons-material';
import { useFirebaseAuth } from '@neram/auth';
import Link from 'next/link';
import type { ApplicationStatus, ScholarshipApplication, ScholarshipApplicationStatus } from '@neram/database';

interface Application {
  id: string;
  application_number: string | null;
  status: ApplicationStatus;
  interest_course: string | null;
  applicant_category: string | null;
  target_exam_year: number | null;
  city: string | null;
  state: string | null;
  created_at: string;
  form_completed_at: string | null;
}

interface ScholarshipData {
  scholarship: ScholarshipApplication | null;
  leadProfile: {
    scholarship_eligible: boolean;
    school_type: string | null;
  } | null;
}

// Scholarship banner config by status
const SCHOLARSHIP_BANNER_CONFIG: Record<
  ScholarshipApplicationStatus,
  {
    message: string;
    severity: 'info' | 'success' | 'warning' | 'error';
    bgGradient: string;
    borderColor: string;
    textColor: string;
    showButton?: boolean;
    buttonLabel?: string;
    showProgress?: boolean;
  }
> = {
  not_eligible: {
    message: '',
    severity: 'info',
    bgGradient: 'linear-gradient(135deg, #F5F5F5 0%, #EEEEEE 100%)',
    borderColor: '#BDBDBD',
    textColor: '#616161',
  },
  eligible_pending: {
    message: 'You are eligible for our scholarship program! Submit your documents to apply.',
    severity: 'info',
    bgGradient: 'linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%)',
    borderColor: '#42A5F5',
    textColor: '#1565C0',
    showButton: true,
    buttonLabel: 'Apply for Scholarship',
  },
  documents_submitted: {
    message: 'Your scholarship application is under review. We\'ll notify you once a decision is made.',
    severity: 'info',
    bgGradient: 'linear-gradient(135deg, #F3E5F5 0%, #E1BEE7 100%)',
    borderColor: '#AB47BC',
    textColor: '#7B1FA2',
    showProgress: true,
  },
  under_review: {
    message: 'Your scholarship application is under review. We\'ll notify you once a decision is made.',
    severity: 'info',
    bgGradient: 'linear-gradient(135deg, #F3E5F5 0%, #E1BEE7 100%)',
    borderColor: '#AB47BC',
    textColor: '#7B1FA2',
    showProgress: true,
  },
  approved: {
    message: 'Congratulations! Your scholarship has been approved.',
    severity: 'success',
    bgGradient: 'linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)',
    borderColor: '#66BB6A',
    textColor: '#2E7D32',
  },
  rejected: {
    message: 'We\'re sorry, your scholarship application was not approved.',
    severity: 'error',
    bgGradient: 'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)',
    borderColor: '#FFA726',
    textColor: '#E65100',
  },
  revision_requested: {
    message: 'Please update your scholarship documents.',
    severity: 'warning',
    bgGradient: 'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)',
    borderColor: '#FF9800',
    textColor: '#E65100',
    showButton: true,
    buttonLabel: 'Update Documents',
  },
};

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || 'https://neramclasses.com';

// Status configuration
const STATUS_CONFIG: Record<string, { label: string; color: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info'; icon: React.ReactElement }> = {
  draft: { label: 'Draft', color: 'default', icon: <EditOutlined fontSize="small" /> },
  pending_verification: { label: 'Pending Verification', color: 'warning', icon: <HourglassEmptyOutlined fontSize="small" /> },
  submitted: { label: 'Submitted', color: 'info', icon: <PendingOutlined fontSize="small" /> },
  under_review: { label: 'Under Review', color: 'primary', icon: <HourglassEmptyOutlined fontSize="small" /> },
  approved: { label: 'Approved', color: 'success', icon: <CheckCircleOutlined fontSize="small" /> },
  rejected: { label: 'Rejected', color: 'error', icon: <CancelOutlined fontSize="small" /> },
  deleted: { label: 'Deleted', color: 'default', icon: <DeleteOutlined fontSize="small" /> },
};

// Course labels
const COURSE_LABELS: Record<string, string> = {
  nata: 'NATA',
  jee_paper2: 'JEE Paper 2',
  both: 'NATA & JEE Paper 2',
};

// Category labels
const CATEGORY_LABELS: Record<string, string> = {
  school_student: 'School Student',
  diploma_student: 'Diploma Student',
  college_student: 'College Student',
  working_professional: 'Working Professional',
};

// Deletion reasons
const DELETION_REASONS = [
  { value: 'changed_mind', label: 'Changed my mind' },
  { value: 'duplicate', label: 'Duplicate application' },
  { value: 'wrong_info', label: 'Submitted wrong information' },
  { value: 'other', label: 'Other reason' },
];

export default function MyApplicationsPage() {
  const { user } = useFirebaseAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Scholarship state
  const [scholarshipData, setScholarshipData] = useState<ScholarshipData | null>(null);
  const [scholarshipLoading, setScholarshipLoading] = useState(true);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingApp, setDeletingApp] = useState<Application | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteReasonType, setDeleteReasonType] = useState('changed_mind');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // View dialog state
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingApp, setViewingApp] = useState<Application | null>(null);

  // Add Course dialog state
  const [addCourseOpen, setAddCourseOpen] = useState(false);
  const [addCourseData, setAddCourseData] = useState({
    interest_course: '',
    learning_mode: 'hybrid',
  });
  const [addCourseLoading, setAddCourseLoading] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const fetchApplications = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const idToken = await (user.raw as any)?.getIdToken?.();
      if (!idToken) {
        setError('Unable to authenticate. Please try refreshing the page.');
        return;
      }

      const response = await fetch('/api/application', {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        setApplications(data.data || []);
      } else {
        setError(data.error || 'Failed to fetch applications');
      }
    } catch (err) {
      console.error('Error fetching applications:', err);
      setError('An error occurred while fetching your applications');
    } finally {
      setLoading(false);
    }
  };

  const fetchScholarshipStatus = async () => {
    if (!user) return;

    setScholarshipLoading(true);

    try {
      const idToken = await (user.raw as any)?.getIdToken?.();
      if (!idToken) return;

      const response = await fetch('/api/scholarship/status', {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        setScholarshipData(data.data || null);
      }
    } catch (err) {
      console.error('Error fetching scholarship status:', err);
    } finally {
      setScholarshipLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
    fetchScholarshipStatus();
  }, [user]);

  const handleDeleteClick = (app: Application) => {
    setDeletingApp(app);
    setDeleteReason('');
    setDeleteReasonType('changed_mind');
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingApp || !user) return;

    setDeleteLoading(true);

    try {
      const idToken = await (user.raw as any)?.getIdToken?.();
      if (!idToken) {
        setError('Unable to authenticate');
        return;
      }

      const reason = deleteReasonType === 'other' ? deleteReason : DELETION_REASONS.find(r => r.value === deleteReasonType)?.label || deleteReasonType;

      const response = await fetch(`/api/application/${deletingApp.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason }),
      });

      const data = await response.json();

      if (data.success) {
        setDeleteDialogOpen(false);
        setDeletingApp(null);
        fetchApplications(); // Refresh the list
      } else {
        setError(data.error || 'Failed to delete application');
      }
    } catch (err) {
      console.error('Error deleting application:', err);
      setError('An error occurred while deleting the application');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleViewClick = (app: Application) => {
    setViewingApp(app);
    setViewDialogOpen(true);
  };

  const handleAddCourseSubmit = async () => {
    if (!user || !addCourseData.interest_course) return;

    setAddCourseLoading(true);

    try {
      const idToken = await (user.raw as any)?.getIdToken?.();
      if (!idToken) {
        setSnackbar({ open: true, message: 'Unable to authenticate. Please try refreshing.', severity: 'error' });
        return;
      }

      const response = await fetch('/api/application/add-course', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(addCourseData),
      });

      const data = await response.json();

      if (data.success) {
        setAddCourseOpen(false);
        setAddCourseData({ interest_course: '', learning_mode: 'hybrid' });
        setSnackbar({ open: true, message: 'Course application submitted successfully!', severity: 'success' });
        fetchApplications();
      } else {
        setSnackbar({ open: true, message: data.error || 'Failed to submit. Please try again.', severity: 'error' });
      }
    } catch (err) {
      console.error('Error adding course:', err);
      setSnackbar({ open: true, message: 'An error occurred. Please try again.', severity: 'error' });
    } finally {
      setAddCourseLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const renderScholarshipBanner = () => {
    // Don't render if still loading or no data
    if (scholarshipLoading || !scholarshipData) return null;

    const { scholarship, leadProfile } = scholarshipData;

    // Only show if user is scholarship eligible
    if (!leadProfile?.scholarship_eligible) return null;

    // Determine the effective status
    const status: ScholarshipApplicationStatus = scholarship?.scholarship_status || 'eligible_pending';

    // Don't show banner for not_eligible
    if (status === 'not_eligible') return null;

    const config = SCHOLARSHIP_BANNER_CONFIG[status];
    if (!config) return null;

    // Build the message with dynamic data
    let displayMessage = config.message;
    if (status === 'approved' && scholarship?.approved_fee != null) {
      displayMessage = `Congratulations! Your scholarship has been approved. Your fee is \u20B9${scholarship.approved_fee.toLocaleString('en-IN')}.`;
    }
    if (status === 'rejected' && scholarship?.rejection_reason) {
      displayMessage = `${config.message} Reason: ${scholarship.rejection_reason}`;
    }
    if (status === 'revision_requested' && scholarship?.revision_notes) {
      displayMessage = `${config.message} ${scholarship.revision_notes}`;
    }

    const scholarshipLink = `${MARKETING_URL}/scholarship`;

    return (
      <Card
        variant="outlined"
        sx={{
          mb: 3,
          background: config.bgGradient,
          borderColor: config.borderColor,
          borderWidth: 1.5,
          overflow: 'hidden',
        }}
      >
        {config.showProgress && (
          <LinearProgress
            variant="indeterminate"
            sx={{
              height: 3,
              '& .MuiLinearProgress-bar': {
                backgroundColor: config.borderColor,
              },
              backgroundColor: 'rgba(0,0,0,0.06)',
            }}
          />
        )}
        <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
          <Box display="flex" alignItems="flex-start" gap={1.5}>
            <SchoolOutlined
              sx={{
                color: config.textColor,
                fontSize: { xs: 28, sm: 32 },
                mt: 0.25,
                flexShrink: 0,
              }}
            />
            <Box flex={1} minWidth={0}>
              <Typography
                variant="subtitle1"
                sx={{
                  fontWeight: 600,
                  color: config.textColor,
                  mb: 0.5,
                  fontSize: { xs: '0.9rem', sm: '1rem' },
                }}
              >
                {status === 'approved'
                  ? 'Scholarship Approved'
                  : status === 'rejected'
                    ? 'Scholarship Update'
                    : status === 'revision_requested'
                      ? 'Action Required'
                      : status === 'eligible_pending'
                        ? 'Scholarship Available'
                        : 'Scholarship Under Review'}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: config.textColor,
                  opacity: 0.9,
                  lineHeight: 1.5,
                  fontSize: { xs: '0.825rem', sm: '0.875rem' },
                }}
              >
                {displayMessage}
              </Typography>

              {config.showButton && (
                <Button
                  variant="contained"
                  size="small"
                  endIcon={<OpenInNewOutlined sx={{ fontSize: 16 }} />}
                  href={scholarshipLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    mt: 1.5,
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.8125rem',
                    bgcolor: config.borderColor,
                    color: '#fff',
                    '&:hover': {
                      bgcolor: config.textColor,
                    },
                    minHeight: 36,
                    px: 2,
                  }}
                >
                  {config.buttonLabel}
                </Button>
              )}
            </Box>
          </Box>
        </CardContent>
      </Card>
    );
  };

  const renderApplicationCard = (app: Application) => {
    const statusConfig = STATUS_CONFIG[app.status] || STATUS_CONFIG.draft;
    const canEdit = app.status === 'draft';
    const canDelete = ['draft', 'submitted'].includes(app.status);

    return (
      <Card key={app.id} variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <CardContent sx={{ flex: 1 }}>
          <Box display="flex" alignItems="flex-start" justifyContent="space-between" mb={2}>
            <Box>
              {app.application_number ? (
                <Typography variant="subtitle2" fontWeight={600} sx={{ fontFamily: 'monospace' }}>
                  {app.application_number}
                </Typography>
              ) : (
                <Typography variant="subtitle2" color="text.secondary">
                  Draft Application
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary">
                Created on {formatDate(app.created_at)}
              </Typography>
            </Box>
            <Chip
              size="small"
              icon={statusConfig.icon}
              label={statusConfig.label}
              color={statusConfig.color}
            />
          </Box>

          <Divider sx={{ my: 1.5 }} />

          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Course Interest
            </Typography>
            <Typography variant="body1" fontWeight={500}>
              {app.interest_course ? COURSE_LABELS[app.interest_course] || app.interest_course : 'Not selected'}
            </Typography>
          </Box>

          <Box mt={2}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Category
            </Typography>
            <Typography variant="body1">
              {app.applicant_category ? CATEGORY_LABELS[app.applicant_category] || app.applicant_category : 'Not selected'}
            </Typography>
          </Box>

          {app.target_exam_year && (
            <Box mt={2}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Target Exam Year
              </Typography>
              <Typography variant="body1">{app.target_exam_year}</Typography>
            </Box>
          )}

          {(app.city || app.state) && (
            <Box mt={2}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Location
              </Typography>
              <Typography variant="body1">
                {[app.city, app.state].filter(Boolean).join(', ')}
              </Typography>
            </Box>
          )}
        </CardContent>

        <CardActions sx={{ px: 2, pb: 2, pt: 0 }}>
          <Button
            size="small"
            startIcon={<VisibilityOutlined />}
            onClick={() => handleViewClick(app)}
          >
            View
          </Button>
          {canEdit && (
            <Button
              size="small"
              startIcon={<EditOutlined />}
              component={Link}
              href="/apply"
            >
              Edit
            </Button>
          )}
          {canDelete && (
            <IconButton
              size="small"
              color="error"
              onClick={() => handleDeleteClick(app)}
              sx={{ ml: 'auto' }}
            >
              <DeleteOutlined fontSize="small" />
            </IconButton>
          )}
        </CardActions>
      </Card>
    );
  };

  return (
    <Box>
      {/* Header */}
      <Paper
        sx={{
          p: { xs: 2, md: 3 },
          mb: 3,
          background: 'linear-gradient(135deg, #1565C0 0%, #0D47A1 100%)',
        }}
      >
        <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
          <Box display="flex" alignItems="center" gap={2}>
            <DescriptionOutlined sx={{ color: 'white', fontSize: 40 }} />
            <Box>
              <Typography variant="h5" sx={{ color: 'white', fontWeight: 600 }}>
                My Applications
              </Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                Track and manage your course applications
              </Typography>
            </Box>
          </Box>
          <Box display="flex" gap={1}>
            <IconButton onClick={fetchApplications} sx={{ color: 'white' }}>
              <RefreshOutlined />
            </IconButton>
            {applications.length > 0 && (
              <Button
                variant="contained"
                startIcon={<LibraryAddOutlined />}
                onClick={() => setAddCourseOpen(true)}
                sx={{ bgcolor: 'white', color: 'primary.main', '&:hover': { bgcolor: 'grey.100' } }}
              >
                Add Course
              </Button>
            )}
          </Box>
        </Box>
      </Paper>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Scholarship Status Banner */}
      {renderScholarshipBanner()}

      {/* Loading State */}
      {loading && (
        <Grid container spacing={2}>
          {[1, 2, 3].map((i) => (
            <Grid item xs={12} sm={6} md={4} key={i}>
              <Skeleton variant="rectangular" height={280} sx={{ borderRadius: 1 }} />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Empty State */}
      {!loading && applications.length === 0 && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <DescriptionOutlined sx={{ fontSize: 64, color: 'grey.400', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            No Applications Yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Start your journey with Neram Classes by submitting your first application.
          </Typography>
          <Button variant="contained" startIcon={<AddOutlined />} component={Link} href="/apply">
            Apply Now
          </Button>
        </Paper>
      )}

      {/* Applications Grid */}
      {!loading && applications.length > 0 && (
        <Grid container spacing={2}>
          {applications.map((app) => (
            <Grid item xs={12} sm={6} md={4} key={app.id}>
              {renderApplicationCard(app)}
            </Grid>
          ))}
        </Grid>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Delete Application</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 3 }}>
            Are you sure you want to delete this application? This action can be reversed by contacting support.
          </Typography>

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Reason for deletion</InputLabel>
            <Select
              value={deleteReasonType}
              onChange={(e) => setDeleteReasonType(e.target.value)}
              label="Reason for deletion"
            >
              {DELETION_REASONS.map((reason) => (
                <MenuItem key={reason.value} value={reason.value}>
                  {reason.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {deleteReasonType === 'other' && (
            <TextField
              fullWidth
              label="Please specify"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              multiline
              rows={2}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleteLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={deleteLoading || (deleteReasonType === 'other' && !deleteReason.trim())}
          >
            {deleteLoading ? 'Deleting...' : 'Delete Application'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* View Application Dialog */}
      <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Application Details
          {viewingApp?.application_number && (
            <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
              {viewingApp.application_number}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent dividers>
          {viewingApp && (
            <Box>
              <Box mb={2}>
                <Typography variant="caption" color="text.secondary">Status</Typography>
                <Box mt={0.5}>
                  <Chip
                    size="small"
                    icon={STATUS_CONFIG[viewingApp.status]?.icon}
                    label={STATUS_CONFIG[viewingApp.status]?.label || viewingApp.status}
                    color={STATUS_CONFIG[viewingApp.status]?.color || 'default'}
                  />
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Course Interest</Typography>
                  <Typography variant="body2" fontWeight={500}>
                    {viewingApp.interest_course ? COURSE_LABELS[viewingApp.interest_course] || viewingApp.interest_course : 'Not selected'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Category</Typography>
                  <Typography variant="body2" fontWeight={500}>
                    {viewingApp.applicant_category ? CATEGORY_LABELS[viewingApp.applicant_category] || viewingApp.applicant_category : 'Not selected'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Target Year</Typography>
                  <Typography variant="body2" fontWeight={500}>
                    {viewingApp.target_exam_year || 'Not selected'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Location</Typography>
                  <Typography variant="body2" fontWeight={500}>
                    {[viewingApp.city, viewingApp.state].filter(Boolean).join(', ') || 'Not provided'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Created</Typography>
                  <Typography variant="body2">{formatDate(viewingApp.created_at)}</Typography>
                </Grid>
                {viewingApp.form_completed_at && (
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">Submitted</Typography>
                    <Typography variant="body2">{formatDate(viewingApp.form_completed_at)}</Typography>
                  </Grid>
                )}
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialogOpen(false)}>Close</Button>
          {viewingApp?.status === 'draft' && (
            <Button variant="contained" component={Link} href="/apply">
              Continue Editing
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Add Course Dialog */}
      <Dialog
        open={addCourseOpen}
        onClose={() => !addCourseLoading && setAddCourseOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Apply for Another Course</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Your personal and academic details will be copied from your existing application.
            Just select the new course you want to apply for.
          </Typography>

          <FormControl component="fieldset" sx={{ mb: 3, width: '100%' }}>
            <FormLabel component="legend" sx={{ mb: 1 }}>Select Course</FormLabel>
            <RadioGroup
              value={addCourseData.interest_course}
              onChange={(e) => setAddCourseData({ ...addCourseData, interest_course: e.target.value })}
            >
              <FormControlLabel value="nata" control={<Radio />} label="NATA" />
              <FormControlLabel value="jee_paper2" control={<Radio />} label="JEE Paper 2" />
              <FormControlLabel value="both" control={<Radio />} label="Both NATA & JEE Paper 2" />
            </RadioGroup>
          </FormControl>

          <FormControl component="fieldset" sx={{ width: '100%' }}>
            <FormLabel component="legend" sx={{ mb: 1 }}>Learning Mode</FormLabel>
            <RadioGroup
              value={addCourseData.learning_mode}
              onChange={(e) => setAddCourseData({ ...addCourseData, learning_mode: e.target.value })}
            >
              <FormControlLabel value="hybrid" control={<Radio />} label="Hybrid (Online + Offline)" />
              <FormControlLabel value="online_only" control={<Radio />} label="100% Online" />
            </RadioGroup>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddCourseOpen(false)} disabled={addCourseLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleAddCourseSubmit}
            variant="contained"
            disabled={addCourseLoading || !addCourseData.interest_course}
            startIcon={addCourseLoading ? <CircularProgress size={16} color="inherit" /> : <LibraryAddOutlined />}
          >
            {addCourseLoading ? 'Submitting...' : 'Submit Application'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        message={snackbar.message}
      />
    </Box>
  );
}
