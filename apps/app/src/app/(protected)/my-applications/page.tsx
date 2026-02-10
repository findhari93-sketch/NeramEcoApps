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
} from '@mui/icons-material';
import { useFirebaseAuth } from '@neram/auth';
import Link from 'next/link';
import type { ApplicationStatus } from '@neram/database';

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

// Status configuration
const STATUS_CONFIG: Record<string, { label: string; color: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info'; icon: React.ReactNode }> = {
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

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingApp, setDeletingApp] = useState<Application | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteReasonType, setDeleteReasonType] = useState('changed_mind');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // View dialog state
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingApp, setViewingApp] = useState<Application | null>(null);

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

  useEffect(() => {
    fetchApplications();
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
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
            <Button
              variant="contained"
              startIcon={<AddOutlined />}
              component={Link}
              href="/apply"
              sx={{ bgcolor: 'white', color: 'primary.main', '&:hover': { bgcolor: 'grey.100' } }}
            >
              New Application
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

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
    </Box>
  );
}
