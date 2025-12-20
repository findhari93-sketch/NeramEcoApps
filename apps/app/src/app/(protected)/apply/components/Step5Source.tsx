'use client';

import React from 'react';
import {
  Box,
  Typography,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  FormHelperText,
  Paper,
  Stack,
} from '@neram/ui';
import YouTubeIcon from '@mui/icons-material/YouTube';
import InstagramIcon from '@mui/icons-material/Instagram';
import FacebookIcon from '@mui/icons-material/Facebook';
import GoogleIcon from '@mui/icons-material/Google';
import PersonIcon from '@mui/icons-material/Person';
import SchoolIcon from '@mui/icons-material/School';
import NewspaperIcon from '@mui/icons-material/Newspaper';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import type { UseApplicationFormReturn } from '../hooks/useApplicationForm';

interface Step5Props {
  form: UseApplicationFormReturn;
  errors: Record<string, string>;
}

const sourceOptions = [
  { value: 'youtube', label: 'YouTube', icon: <YouTubeIcon sx={{ color: '#FF0000' }} /> },
  { value: 'instagram', label: 'Instagram', icon: <InstagramIcon sx={{ color: '#E4405F' }} /> },
  { value: 'facebook', label: 'Facebook', icon: <FacebookIcon sx={{ color: '#1877F2' }} /> },
  { value: 'google_search', label: 'Google Search', icon: <GoogleIcon sx={{ color: '#4285F4' }} /> },
  { value: 'friend_referral', label: 'Friend/Family', icon: <PersonIcon sx={{ color: '#00897B' }} /> },
  { value: 'school_visit', label: 'School Visit', icon: <SchoolIcon sx={{ color: '#FF9800' }} /> },
  { value: 'newspaper', label: 'Newspaper/Magazine', icon: <NewspaperIcon sx={{ color: '#757575' }} /> },
  { value: 'whatsapp', label: 'WhatsApp', icon: <WhatsAppIcon sx={{ color: '#25D366' }} /> },
  { value: 'other', label: 'Other', icon: <MoreHorizIcon sx={{ color: '#9E9E9E' }} /> },
];

export default function Step5Source({ form, errors }: Step5Props) {
  const { formData, updateField } = form;

  const selectedSource = sourceOptions.find((s) => s.value === formData.sourceCategory);

  return (
    <Box>
      <Typography variant="h6" gutterBottom sx={{ mb: 1 }}>
        How did you hear about us?
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Help us understand how you found Neram Classes. This helps us reach more aspiring architects!
      </Typography>

      <Grid container spacing={3}>
        {/* Source Selection as Visual Cards */}
        <Grid item xs={12}>
          <Typography variant="subtitle2" gutterBottom>
            Select one option *
          </Typography>
          <Grid container spacing={2}>
            {sourceOptions.map((source) => (
              <Grid item xs={6} sm={4} md={3} key={source.value}>
                <Paper
                  onClick={() => updateField('sourceCategory', source.value)}
                  sx={{
                    p: 2,
                    cursor: 'pointer',
                    textAlign: 'center',
                    border: '2px solid',
                    borderColor: formData.sourceCategory === source.value ? 'primary.main' : 'grey.200',
                    bgcolor: formData.sourceCategory === source.value ? 'primary.50' : 'white',
                    transition: 'all 0.2s',
                    '&:hover': {
                      borderColor: 'primary.main',
                      bgcolor: 'primary.50',
                    },
                  }}
                >
                  <Box sx={{ mb: 1, '& svg': { fontSize: 28 } }}>
                    {source.icon}
                  </Box>
                  <Typography variant="body2" fontWeight={formData.sourceCategory === source.value ? 600 : 400}>
                    {source.label}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
          {errors.sourceCategory && (
            <FormHelperText error sx={{ mt: 1 }}>
              {errors.sourceCategory}
            </FormHelperText>
          )}
        </Grid>

        {/* Additional Details based on selection */}
        {formData.sourceCategory === 'friend_referral' && (
          <>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Friend's Name"
                value={formData.friendReferralName}
                onChange={(e) => updateField('friendReferralName', e.target.value)}
                error={!!errors.friendReferralName}
                helperText={errors.friendReferralName || 'Who referred you to us?'}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Friend's Phone Number"
                value={formData.friendReferralPhone}
                onChange={(e) => updateField('friendReferralPhone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                helperText="Optional - for referral rewards"
                placeholder="9876543210"
                inputProps={{ maxLength: 10 }}
              />
            </Grid>
          </>
        )}

        {formData.sourceCategory === 'youtube' && (
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Which video helped you?"
              value={formData.sourceDetail}
              onChange={(e) => updateField('sourceDetail', e.target.value)}
              helperText="Optional - Tell us which video you found helpful"
              placeholder="e.g., NATA 2025 Preparation Guide"
            />
          </Grid>
        )}

        {formData.sourceCategory === 'school_visit' && (
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="School Name"
              value={formData.sourceDetail}
              onChange={(e) => updateField('sourceDetail', e.target.value)}
              helperText="Which school did our team visit?"
            />
          </Grid>
        )}

        {formData.sourceCategory === 'other' && (
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Please specify"
              value={formData.sourceDetail}
              onChange={(e) => updateField('sourceDetail', e.target.value)}
              helperText="Tell us how you discovered Neram Classes"
              multiline
              rows={2}
            />
          </Grid>
        )}

        {/* Thank you message */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2, bgcolor: 'grey.50', mt: 2 }}>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              Thank you for helping us understand how students find us.
              Your feedback helps us create better content and reach more aspiring architects!
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
