'use client';

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Grid,
  FormControlLabel,
  Checkbox,
  TextField,
  Alert,
  Paper,
  Chip,
} from '@neram/ui';
import { DocumentUpload } from '@neram/ui';
import type { UseApplicationFormReturn } from '../hooks/useApplicationForm';

interface Step3Props {
  form: UseApplicationFormReturn;
  errors: Record<string, string>;
}

export default function Step3Scholarship({ form, errors }: Step3Props) {
  const { formData, updateField } = form;
  const [uploading, setUploading] = useState<string | null>(null);

  const handleUpload = async (file: File, type: 'schoolIdCard' | 'incomeCertificate') => {
    setUploading(type);
    try {
      const formDataObj = new FormData();
      formDataObj.append('file', file);
      formDataObj.append('type', type);

      const response = await fetch('/api/upload/document', {
        method: 'POST',
        body: formDataObj,
      });

      if (!response.ok) throw new Error('Upload failed');

      const { url } = await response.json();

      if (type === 'schoolIdCard') {
        updateField('schoolIdCardUrl', url);
      } else {
        updateField('incomeCertificateUrl', url);
      }

      return url;
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    } finally {
      setUploading(null);
    }
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom sx={{ mb: 1 }}>
        Scholarship Eligibility
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Students from government schools can get up to 95% scholarship!
      </Typography>

      <Paper sx={{ p: 3, mb: 3, bgcolor: 'primary.50', border: '1px solid', borderColor: 'primary.200' }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom color="primary.main">
          Government School Scholarship
        </Typography>
        <Typography variant="body2" paragraph>
          Low-income students who have studied in a government school for at least 2 years are eligible for
          <strong> 95% scholarship</strong> on course fees.
        </Typography>

        <FormControlLabel
          control={
            <Checkbox
              checked={formData.isGovernmentSchool}
              onChange={(e) => updateField('isGovernmentSchool', e.target.checked)}
              color="primary"
            />
          }
          label="I have studied in a government school"
        />

        {formData.isGovernmentSchool && (
          <Box sx={{ mt: 2, pl: 4 }}>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Years in Government School"
                  value={formData.governmentSchoolYears || ''}
                  onChange={(e) => updateField('governmentSchoolYears', parseInt(e.target.value) || 0)}
                  error={!!errors.governmentSchoolYears}
                  helperText={errors.governmentSchoolYears || 'Minimum 2 years required'}
                  inputProps={{ min: 0, max: 12 }}
                />
              </Grid>

              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={formData.isLowIncome}
                      onChange={(e) => updateField('isLowIncome', e.target.checked)}
                      color="primary"
                    />
                  }
                  label="My family's annual income is below Rs. 3 lakhs (Low Income)"
                />
              </Grid>

              <Grid item xs={12}>
                <Typography variant="subtitle2" sx={{ mb: 2 }}>
                  Upload Required Documents
                </Typography>

                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <DocumentUpload
                      label="School ID Card"
                      accept="image/*,.pdf"
                      maxSize={5}
                      value={formData.schoolIdCardUrl || undefined}
                      onUpload={(file) => handleUpload(file, 'schoolIdCard')}
                      onChange={(url) => updateField('schoolIdCardUrl', url)}
                      error={errors.schoolIdCardUrl}
                      helperText="Upload your government school ID card"
                      required
                    />
                  </Grid>

                  {formData.isLowIncome && (
                    <Grid item xs={12} sm={6}>
                      <DocumentUpload
                        label="Income Certificate"
                        accept="image/*,.pdf"
                        maxSize={5}
                        value={formData.incomeCertificateUrl || undefined}
                        onUpload={(file) => handleUpload(file, 'incomeCertificate')}
                        onChange={(url) => updateField('incomeCertificateUrl', url)}
                        error={errors.incomeCertificateUrl}
                        helperText="Required for 95% scholarship"
                        required
                      />
                    </Grid>
                  )}
                </Grid>
              </Grid>
            </Grid>
          </Box>
        )}
      </Paper>

      {/* Scholarship Summary */}
      {formData.scholarshipPercentage > 0 && (
        <Alert
          severity="success"
          icon={false}
          sx={{
            display: 'flex',
            alignItems: 'center',
            '& .MuiAlert-message': { width: '100%' }
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={600}>
                Congratulations! You're eligible for scholarship
              </Typography>
              <Typography variant="body2">
                Your scholarship will be applied after document verification by our admin team.
              </Typography>
            </Box>
            <Chip
              label={`${formData.scholarshipPercentage}% OFF`}
              color="success"
              size="medium"
              sx={{ fontWeight: 700, fontSize: '1rem', py: 2.5 }}
            />
          </Box>
        </Alert>
      )}

      {!formData.isGovernmentSchool && (
        <Alert severity="info">
          <Typography variant="body2">
            <strong>Note:</strong> Scholarship is only available for students who have studied in government schools
            for at least 2 years. If you don't qualify for this scholarship, don't worry - you can still avail
            cashback offers in the next step!
          </Typography>
        </Alert>
      )}
    </Box>
  );
}
