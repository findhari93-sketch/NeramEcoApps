'use client';

import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Alert,
  Stepper,
  Step,
  StepLabel,
  StepConnector,
  Divider,
} from '@neram/ui';
import {
  CheckCircleOutlined,
  ScheduleOutlined,
  ErrorOutline,
  DescriptionOutlined,
  ReviewsOutlined,
  CelebrationOutlined,
} from '@mui/icons-material';
import type { ScholarshipApplicationStatus } from '@neram/database';

interface ScholarshipStatusProps {
  status: ScholarshipApplicationStatus;
  approvedFee?: number | null;
  revisionNotes?: string | null;
  rejectionReason?: string | null;
  submittedAt?: string | null;
  t: (key: string) => string;
}

// Define the step progression order
const STATUS_STEPS: ScholarshipApplicationStatus[] = [
  'eligible_pending',
  'documents_submitted',
  'under_review',
  'approved',
];

function getActiveStep(status: ScholarshipApplicationStatus): number {
  switch (status) {
    case 'eligible_pending':
      return 0;
    case 'documents_submitted':
      return 1;
    case 'under_review':
      return 2;
    case 'approved':
      return 4; // All complete
    case 'rejected':
      return -1; // Special state
    case 'revision_requested':
      return 1; // Back to documents step
    default:
      return 0;
  }
}

function getStatusColor(status: ScholarshipApplicationStatus) {
  switch (status) {
    case 'approved':
      return 'success';
    case 'rejected':
      return 'error';
    case 'revision_requested':
      return 'warning';
    case 'under_review':
      return 'info';
    case 'documents_submitted':
      return 'primary';
    default:
      return 'default';
  }
}

function getStatusLabel(status: ScholarshipApplicationStatus, t: (key: string) => string) {
  switch (status) {
    case 'eligible_pending':
      return t('eligible');
    case 'documents_submitted':
      return t('documentsSubmitted');
    case 'under_review':
      return t('underReview');
    case 'approved':
      return t('approved');
    case 'rejected':
      return t('rejected');
    case 'revision_requested':
      return t('revisionRequested');
    default:
      return status;
  }
}

export default function ScholarshipStatus({
  status,
  approvedFee,
  revisionNotes,
  rejectionReason,
  submittedAt,
  t,
}: ScholarshipStatusProps) {
  const activeStep = getActiveStep(status);
  const isRejected = status === 'rejected';
  const isRevision = status === 'revision_requested';

  const stepLabels = [
    t('eligible'),
    t('documentsSubmitted'),
    t('underReview'),
    t('approved'),
  ];

  const stepIcons = [
    <ScheduleOutlined key="eligible" />,
    <DescriptionOutlined key="docs" />,
    <ReviewsOutlined key="review" />,
    <CelebrationOutlined key="approved" />,
  ];

  return (
    <Card variant="outlined" sx={{ mb: 3 }}>
      <CardContent sx={{ p: { xs: 2, md: 3 } }}>
        {/* Header */}
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          flexWrap="wrap"
          gap={1}
          mb={2}
        >
          <Typography variant="subtitle1" fontWeight={600}>
            {t('statusTracker')}
          </Typography>
          <Chip
            label={getStatusLabel(status, t)}
            color={getStatusColor(status) as any}
            size="small"
            sx={{ fontWeight: 600 }}
          />
        </Box>

        {/* Stepper */}
        {!isRejected && (
          <Box sx={{ mb: 2 }}>
            <Stepper
              activeStep={activeStep}
              alternativeLabel
              sx={{
                '& .MuiStepLabel-root': {
                  '& .MuiStepLabel-label': {
                    fontSize: { xs: '0.7rem', sm: '0.8rem' },
                    mt: 0.5,
                  },
                },
              }}
            >
              {stepLabels.map((label, index) => (
                <Step
                  key={label}
                  completed={activeStep > index || status === 'approved'}
                >
                  <StepLabel
                    error={isRevision && index === 1}
                    StepIconProps={{
                      sx: {
                        fontSize: { xs: 24, sm: 28 },
                      },
                    }}
                  >
                    {label}
                  </StepLabel>
                </Step>
              ))}
            </Stepper>
          </Box>
        )}

        {/* Approved Fee */}
        {status === 'approved' && approvedFee != null && (
          <Alert
            severity="success"
            icon={<CelebrationOutlined />}
            sx={{ mb: 2 }}
          >
            <Typography variant="body2" fontWeight={600}>
              {t('approvedFee')}
            </Typography>
            <Typography variant="h5" fontWeight={700} color="success.dark" sx={{ mt: 0.5 }}>
              &#x20B9;{approvedFee.toLocaleString('en-IN')}
            </Typography>
          </Alert>
        )}

        {/* Revision Requested */}
        {isRevision && revisionNotes && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2" fontWeight={600} gutterBottom>
              {t('revisionNotes')}
            </Typography>
            <Typography variant="body2">
              {revisionNotes}
            </Typography>
          </Alert>
        )}

        {/* Rejected */}
        {isRejected && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {rejectionReason && (
              <>
                <Typography variant="body2" fontWeight={600} gutterBottom>
                  {t('rejectionReason')}
                </Typography>
                <Typography variant="body2">
                  {rejectionReason}
                </Typography>
              </>
            )}
          </Alert>
        )}

        {/* Submitted timestamp */}
        {submittedAt && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Submitted:{' '}
            {new Date(submittedAt).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
