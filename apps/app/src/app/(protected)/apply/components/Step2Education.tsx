'use client';

import React from 'react';
import {
  Box,
  Typography,
  TextField,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  Alert,
} from '@neram/ui';
import type { UseApplicationFormReturn } from '../hooks/useApplicationForm';

interface Step2Props {
  form: UseApplicationFormReturn;
  errors: Record<string, string>;
}

const boardOptions = [
  { value: 'cbse', label: 'CBSE' },
  { value: 'icse', label: 'ICSE' },
  { value: 'state', label: 'State Board' },
  { value: 'ib', label: 'IB' },
  { value: 'other', label: 'Other' },
];

const classOptions = [
  { value: '10th', label: '10th Standard' },
  { value: '11th', label: '11th Standard' },
  { value: '12th', label: '12th Standard' },
  { value: 'passed', label: 'Already Passed 12th' },
];

const streamOptions = [
  { value: 'science', label: 'Science' },
  { value: 'commerce', label: 'Commerce' },
  { value: 'arts', label: 'Arts' },
];

const courseOptions = [
  { value: 'nata', label: 'NATA Preparation' },
  { value: 'jee_paper2', label: 'JEE Paper 2 (B.Arch)' },
  { value: 'both', label: 'Both NATA & JEE Paper 2' },
];

const batchOptions = [
  { value: 'morning', label: 'Morning (6 AM - 9 AM)' },
  { value: 'afternoon', label: 'Afternoon (2 PM - 5 PM)' },
  { value: 'evening', label: 'Evening (5 PM - 8 PM)' },
  { value: 'weekend', label: 'Weekends Only' },
];

export default function Step2Education({ form, errors }: Step2Props) {
  const { formData, updateField } = form;

  return (
    <Box>
      <Typography variant="h6" gutterBottom sx={{ mb: 3 }}>
        Educational Background
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <TextField
            fullWidth
            label="School/College Name"
            value={formData.schoolName}
            onChange={(e) => updateField('schoolName', e.target.value)}
            error={!!errors.schoolName}
            helperText={errors.schoolName}
            required
            placeholder="Enter your current school name"
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <FormControl fullWidth error={!!errors.board} required>
            <InputLabel>Board</InputLabel>
            <Select
              value={formData.board}
              label="Board"
              onChange={(e) => updateField('board', e.target.value as typeof formData.board)}
            >
              {boardOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
            {errors.board && <FormHelperText>{errors.board}</FormHelperText>}
          </FormControl>
        </Grid>

        <Grid item xs={12} sm={6}>
          <FormControl fullWidth error={!!errors.currentClass} required>
            <InputLabel>Current Class</InputLabel>
            <Select
              value={formData.currentClass}
              label="Current Class"
              onChange={(e) => updateField('currentClass', e.target.value as typeof formData.currentClass)}
            >
              {classOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
            {errors.currentClass && <FormHelperText>{errors.currentClass}</FormHelperText>}
          </FormControl>
        </Grid>

        <Grid item xs={12} sm={6}>
          <FormControl fullWidth>
            <InputLabel>Stream</InputLabel>
            <Select
              value={formData.stream}
              label="Stream"
              onChange={(e) => updateField('stream', e.target.value as typeof formData.stream)}
            >
              {streamOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12} sm={6}>
          <FormControl fullWidth error={!!errors.courseInterest} required>
            <InputLabel>Course Interested In</InputLabel>
            <Select
              value={formData.courseInterest}
              label="Course Interested In"
              onChange={(e) => updateField('courseInterest', e.target.value as typeof formData.courseInterest)}
            >
              {courseOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
            {errors.courseInterest && <FormHelperText>{errors.courseInterest}</FormHelperText>}
          </FormControl>
        </Grid>

        <Grid item xs={12}>
          <FormControl fullWidth error={!!errors.batchPreference} required>
            <InputLabel>Preferred Batch Timing</InputLabel>
            <Select
              value={formData.batchPreference}
              label="Preferred Batch Timing"
              onChange={(e) => updateField('batchPreference', e.target.value as typeof formData.batchPreference)}
            >
              {batchOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
            {errors.batchPreference && <FormHelperText>{errors.batchPreference}</FormHelperText>}
          </FormControl>
        </Grid>

        <Grid item xs={12}>
          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2">
              <strong>Course Duration:</strong> NATA & JEE Paper 2 courses are designed for comprehensive preparation
              including aptitude, drawing, and mathematics sections.
            </Typography>
          </Alert>
        </Grid>
      </Grid>
    </Box>
  );
}
