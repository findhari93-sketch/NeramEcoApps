'use client';

import { Box, Typography, Chip, Stepper, Step, StepLabel, IconButton, Tooltip } from '@neram/ui';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useState } from 'react';
import type { LeadProfile, ApplicationStatus } from '@neram/database';

interface ApplicationStatusSectionProps {
  leadProfile: LeadProfile;
}

const STATUS_CONFIG: Record<ApplicationStatus, { label: string; color: 'default' | 'warning' | 'info' | 'success' | 'error' | 'primary' }> = {
  draft: { label: 'Draft', color: 'default' },
  pending_verification: { label: 'Pending Verification', color: 'warning' },
  submitted: { label: 'Submitted', color: 'info' },
  under_review: { label: 'Under Review', color: 'primary' },
  approved: { label: 'Approved', color: 'success' },
  rejected: { label: 'Rejected', color: 'error' },
  deleted: { label: 'Deleted', color: 'default' },
};

const STEPS = ['Draft', 'Submitted', 'Under Review', 'Decision'];

function getActiveStep(status: ApplicationStatus): number {
  switch (status) {
    case 'draft':
    case 'pending_verification':
      return 0;
    case 'submitted':
      return 1;
    case 'under_review':
      return 2;
    case 'approved':
    case 'rejected':
      return 3;
    default:
      return 0;
  }
}

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function ApplicationStatusSection({ leadProfile }: ApplicationStatusSectionProps) {
  const [copied, setCopied] = useState(false);
  const config = STATUS_CONFIG[leadProfile.status] || STATUS_CONFIG.draft;
  const activeStep = getActiveStep(leadProfile.status);

  const handleCopy = () => {
    if (leadProfile.application_number) {
      navigator.clipboard.writeText(leadProfile.application_number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Box>
      {/* Application number + status */}
      {leadProfile.application_number && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">
            Application:
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
            {leadProfile.application_number}
          </Typography>
          <Tooltip title={copied ? 'Copied!' : 'Copy'}>
            <IconButton size="small" onClick={handleCopy}>
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Chip label={config.label} size="small" color={config.color} />
        </Box>
      )}

      {/* Progress stepper */}
      {leadProfile.status !== 'deleted' && (
        <Stepper
          activeStep={activeStep}
          alternativeLabel
          sx={{
            mb: 2,
            '& .MuiStepLabel-label': { fontSize: '0.75rem' },
          }}
        >
          {STEPS.map((label, index) => (
            <Step
              key={label}
              completed={index < activeStep || (index === activeStep && (leadProfile.status === 'approved' || leadProfile.status === 'rejected'))}
            >
              <StepLabel
                error={index === activeStep && leadProfile.status === 'rejected'}
              >
                {label}
              </StepLabel>
            </Step>
          ))}
        </Stepper>
      )}

      {/* Timestamps */}
      <Box sx={{ mt: 1 }}>
        {leadProfile.created_at && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Applied: {formatDate(leadProfile.created_at)}
          </Typography>
        )}
        {leadProfile.form_completed_at && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Submitted: {formatDate(leadProfile.form_completed_at)}
          </Typography>
        )}
        {leadProfile.reviewed_at && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Reviewed: {formatDate(leadProfile.reviewed_at)}
          </Typography>
        )}
      </Box>

      {leadProfile.rejection_reason && (
        <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'error.50', borderRadius: 1 }}>
          <Typography variant="caption" color="error.main">
            Reason: {leadProfile.rejection_reason}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
