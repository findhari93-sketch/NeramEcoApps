'use client';

import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  Alert,
  Chip,
  Divider,
  Stack,
} from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';

interface ScholarshipData {
  id: string;
  isGovernmentSchool: boolean;
  governmentSchoolYears: number;
  isLowIncome: boolean;
  scholarshipPercentage: number;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  schoolIdCardUrl?: string;
  incomeCertificateUrl?: string;
}

interface ScholarshipReviewProps {
  scholarship: ScholarshipData | null;
  onVerify: (status: 'verified' | 'rejected', notes?: string) => void;
}

export default function ScholarshipReview({
  scholarship,
  onVerify,
}: ScholarshipReviewProps) {
  if (!scholarship) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Scholarship Eligibility
        </Typography>
        <Alert severity="info">
          This student has not applied for scholarship.
        </Alert>
      </Paper>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'verified':
        return 'success';
      case 'rejected':
        return 'error';
      default:
        return 'warning';
    }
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          Scholarship Review
        </Typography>
        <Chip
          label={scholarship.verificationStatus.toUpperCase()}
          color={getStatusColor(scholarship.verificationStatus)}
          size="small"
        />
      </Box>

      <Divider sx={{ mb: 3 }} />

      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <Typography variant="body2" color="text.secondary">
            Government School Student
          </Typography>
          <Typography variant="body1" fontWeight={500}>
            {scholarship.isGovernmentSchool ? 'Yes' : 'No'}
          </Typography>
        </Grid>

        <Grid item xs={12} sm={6}>
          <Typography variant="body2" color="text.secondary">
            Years in Government School
          </Typography>
          <Typography variant="body1" fontWeight={500}>
            {scholarship.governmentSchoolYears} years
          </Typography>
        </Grid>

        <Grid item xs={12} sm={6}>
          <Typography variant="body2" color="text.secondary">
            Low Income Family
          </Typography>
          <Typography variant="body1" fontWeight={500}>
            {scholarship.isLowIncome ? 'Yes (< Rs. 3 Lakhs annual)' : 'No'}
          </Typography>
        </Grid>

        <Grid item xs={12} sm={6}>
          <Typography variant="body2" color="text.secondary">
            Eligible Scholarship
          </Typography>
          <Typography variant="h5" color="success.main" fontWeight={600}>
            {scholarship.scholarshipPercentage}%
          </Typography>
        </Grid>
      </Grid>

      <Divider sx={{ my: 3 }} />

      <Typography variant="subtitle2" gutterBottom>
        Uploaded Documents
      </Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        {scholarship.schoolIdCardUrl ? (
          <Button
            variant="outlined"
            size="small"
            onClick={() => window.open(scholarship.schoolIdCardUrl, '_blank')}
          >
            View School ID Card
          </Button>
        ) : (
          <Chip label="School ID Not Uploaded" color="error" size="small" />
        )}

        {scholarship.isLowIncome && (
          scholarship.incomeCertificateUrl ? (
            <Button
              variant="outlined"
              size="small"
              onClick={() => window.open(scholarship.incomeCertificateUrl, '_blank')}
            >
              View Income Certificate
            </Button>
          ) : (
            <Chip label="Income Certificate Not Uploaded" color="error" size="small" />
          )
        )}
      </Stack>

      {/* Scholarship Criteria Check */}
      <Paper sx={{ p: 2, bgcolor: 'grey.50', mb: 3 }}>
        <Typography variant="subtitle2" gutterBottom>
          Eligibility Criteria Check
        </Typography>

        <Stack spacing={1}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {scholarship.isGovernmentSchool ? (
              <CheckCircleIcon color="success" fontSize="small" />
            ) : (
              <CancelIcon color="error" fontSize="small" />
            )}
            <Typography variant="body2">
              Studied in Government School
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {scholarship.governmentSchoolYears >= 2 ? (
              <CheckCircleIcon color="success" fontSize="small" />
            ) : (
              <CancelIcon color="error" fontSize="small" />
            )}
            <Typography variant="body2">
              At least 2 years in Government School ({scholarship.governmentSchoolYears} years)
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {scholarship.schoolIdCardUrl ? (
              <CheckCircleIcon color="success" fontSize="small" />
            ) : (
              <CancelIcon color="error" fontSize="small" />
            )}
            <Typography variant="body2">
              School ID Card Uploaded
            </Typography>
          </Box>

          {scholarship.isLowIncome && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {scholarship.incomeCertificateUrl ? (
                <CheckCircleIcon color="success" fontSize="small" />
              ) : (
                <CancelIcon color="error" fontSize="small" />
              )}
              <Typography variant="body2">
                Income Certificate Uploaded (for 95% scholarship)
              </Typography>
            </Box>
          )}
        </Stack>
      </Paper>

      {/* Action Buttons */}
      {scholarship.verificationStatus === 'pending' && (
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="contained"
            color="success"
            startIcon={<CheckCircleIcon />}
            onClick={() => onVerify('verified')}
          >
            Approve Scholarship
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<CancelIcon />}
            onClick={() => onVerify('rejected')}
          >
            Reject Scholarship
          </Button>
        </Box>
      )}

      {scholarship.verificationStatus === 'verified' && (
        <Alert severity="success">
          Scholarship has been approved. {scholarship.scholarshipPercentage}% discount will be applied to fees.
        </Alert>
      )}

      {scholarship.verificationStatus === 'rejected' && (
        <Alert severity="error">
          Scholarship application was rejected. Full fees will be charged.
        </Alert>
      )}
    </Paper>
  );
}
