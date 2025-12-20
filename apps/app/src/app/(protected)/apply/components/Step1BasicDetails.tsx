'use client';

import React from 'react';
import {
  Box,
  Typography,
  TextField,
  Grid,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormHelperText,
} from '@neram/ui';
import type { UseApplicationFormReturn } from '../hooks/useApplicationForm';

interface Step1Props {
  form: UseApplicationFormReturn;
  errors: Record<string, string>;
}

export default function Step1BasicDetails({ form, errors }: Step1Props) {
  const { formData, updateField } = form;

  return (
    <Box>
      <Typography variant="h6" gutterBottom sx={{ mb: 3 }}>
        Tell us about yourself
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Full Name"
            value={formData.fullName}
            onChange={(e) => updateField('fullName', e.target.value)}
            error={!!errors.fullName}
            helperText={errors.fullName}
            required
            placeholder="Enter your full name as per official records"
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Email Address"
            type="email"
            value={formData.email}
            onChange={(e) => updateField('email', e.target.value)}
            error={!!errors.email}
            helperText={errors.email || 'We will send updates to this email'}
            required
            placeholder="your.email@example.com"
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Mobile Number"
            value={formData.phone}
            onChange={(e) => updateField('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
            error={!!errors.phone}
            helperText={errors.phone || '10-digit mobile number'}
            required
            placeholder="9876543210"
            inputProps={{ maxLength: 10 }}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Date of Birth"
            type="date"
            value={formData.dob}
            onChange={(e) => updateField('dob', e.target.value)}
            error={!!errors.dob}
            helperText={errors.dob}
            InputLabelProps={{ shrink: true }}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <FormControl error={!!errors.gender} required>
            <FormLabel>Gender</FormLabel>
            <RadioGroup
              row
              value={formData.gender}
              onChange={(e) => updateField('gender', e.target.value as 'male' | 'female' | 'other')}
            >
              <FormControlLabel value="male" control={<Radio />} label="Male" />
              <FormControlLabel value="female" control={<Radio />} label="Female" />
              <FormControlLabel value="other" control={<Radio />} label="Other" />
            </RadioGroup>
            {errors.gender && <FormHelperText>{errors.gender}</FormHelperText>}
          </FormControl>
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Address"
            multiline
            rows={2}
            value={formData.address}
            onChange={(e) => updateField('address', e.target.value)}
            placeholder="Street address, area, landmark"
          />
        </Grid>

        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            label="City"
            value={formData.city}
            onChange={(e) => updateField('city', e.target.value)}
            placeholder="Chennai"
          />
        </Grid>

        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            label="State"
            value={formData.state}
            onChange={(e) => updateField('state', e.target.value)}
            placeholder="Tamil Nadu"
          />
        </Grid>

        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            label="Pincode"
            value={formData.pincode}
            onChange={(e) => updateField('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="600001"
            inputProps={{ maxLength: 6 }}
          />
        </Grid>
      </Grid>
    </Box>
  );
}
