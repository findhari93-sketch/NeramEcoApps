'use client';

import { useState } from 'react';
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
} from '@neram/ui';
import {
  EditIcon,
  AddIcon,
  SchoolIcon,
  PersonIcon,
  LocationOnIcon,
  CalendarTodayIcon,
  DeleteIcon,
} from '@neram/ui';
import { useFormContext } from '../hooks/useApplicationForm';
import type { FormStep } from '../types';

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
// APPLICATION CARD
// ============================================

interface ApplicationCardProps {
  application: any;
  onEdit: (app: any) => void;
  onDelete: (app: any) => void;
}

function ApplicationCard({ application, onEdit, onDelete }: ApplicationCardProps) {
  const status = STATUS_CONFIG[application.status] || STATUS_CONFIG.submitted;
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

      <Box display="flex" alignItems="center" gap={1} mb={0.75}>
        <SchoolIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
        <Typography variant="body2" fontWeight={500}>
          {course}
        </Typography>
      </Box>

      {formattedDate && (
        <Box display="flex" alignItems="center" gap={1} mb={1.5}>
          <CalendarTodayIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
          <Typography variant="caption" color="text.secondary">
            {application.status === 'draft' ? 'Last saved' : 'Submitted'}: {formattedDate}
          </Typography>
        </Box>
      )}

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
// MAIN DASHBOARD
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
  } = useFormContext();

  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
      <Box mb={3}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          {userName ? `Welcome back, ${userName}!` : 'Welcome back!'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Manage your applications or add another course.
        </Typography>
      </Box>

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
          />
        ))}
      </Box>

      <Divider sx={{ my: 3 }} />

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

      {latestApp && (
        <Box mt={3}>
          <PersonalSummary application={latestApp} />
        </Box>
      )}

      <Alert severity="info" sx={{ mt: 3 }}>
        <Typography variant="body2">
          Your personal and academic details are automatically carried over when adding a new course.
        </Typography>
      </Alert>

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
            This will remove it from your dashboard.
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
