'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormLabel,
  Stepper,
  Step,
  StepLabel,
  Alert,
} from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';

const steps = ['Personal Details', 'Academic Information', 'Course Selection', 'Review & Submit'];

export default function ApplyPage() {
  const { user } = useFirebaseAuth();
  const [activeStep, setActiveStep] = useState(0);
  const [formData, setFormData] = useState({
    // Personal Details
    fullName: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    dob: '',
    gender: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    // Academic Information
    schoolName: '',
    board: '',
    class: '',
    stream: '',
    previousScore: '',
    // Course Selection
    course: '',
    batchTiming: '',
    startDate: '',
  });

  const handleNext = () => {
    setActiveStep((prevStep) => prevStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };

  const handleChange = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value });
  };

  const handleSubmit = () => {
    console.log('Form submitted:', formData);
    alert('Application submitted successfully! We will contact you soon.');
  };

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Full Name"
                value={formData.fullName}
                onChange={(e) => handleChange('fullName', e.target.value)}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Phone Number"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Date of Birth"
                type="date"
                value={formData.dob}
                onChange={(e) => handleChange('dob', e.target.value)}
                InputLabelProps={{ shrink: true }}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <FormLabel>Gender</FormLabel>
                <RadioGroup
                  row
                  value={formData.gender}
                  onChange={(e) => handleChange('gender', e.target.value)}
                >
                  <FormControlLabel value="male" control={<Radio />} label="Male" />
                  <FormControlLabel value="female" control={<Radio />} label="Female" />
                  <FormControlLabel value="other" control={<Radio />} label="Other" />
                </RadioGroup>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Address"
                multiline
                rows={2}
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                required
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="City"
                value={formData.city}
                onChange={(e) => handleChange('city', e.target.value)}
                required
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="State"
                value={formData.state}
                onChange={(e) => handleChange('state', e.target.value)}
                required
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Pincode"
                value={formData.pincode}
                onChange={(e) => handleChange('pincode', e.target.value)}
                required
              />
            </Grid>
          </Grid>
        );

      case 1:
        return (
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="School/College Name"
                value={formData.schoolName}
                onChange={(e) => handleChange('schoolName', e.target.value)}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Board</InputLabel>
                <Select
                  value={formData.board}
                  label="Board"
                  onChange={(e) => handleChange('board', e.target.value)}
                >
                  <MenuItem value="CBSE">CBSE</MenuItem>
                  <MenuItem value="ICSE">ICSE</MenuItem>
                  <MenuItem value="State Board">State Board</MenuItem>
                  <MenuItem value="Other">Other</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Current Class</InputLabel>
                <Select
                  value={formData.class}
                  label="Current Class"
                  onChange={(e) => handleChange('class', e.target.value)}
                >
                  <MenuItem value="11th">11th</MenuItem>
                  <MenuItem value="12th">12th</MenuItem>
                  <MenuItem value="Passed">Passed 12th</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Stream</InputLabel>
                <Select
                  value={formData.stream}
                  label="Stream"
                  onChange={(e) => handleChange('stream', e.target.value)}
                >
                  <MenuItem value="Science">Science</MenuItem>
                  <MenuItem value="Commerce">Commerce</MenuItem>
                  <MenuItem value="Arts">Arts</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Previous Exam Score (if any)"
                value={formData.previousScore}
                onChange={(e) => handleChange('previousScore', e.target.value)}
                placeholder="Enter NATA/JEE score if taken"
              />
            </Grid>
          </Grid>
        );

      case 2:
        return (
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Select Course</InputLabel>
                <Select
                  value={formData.course}
                  label="Select Course"
                  onChange={(e) => handleChange('course', e.target.value)}
                >
                  <MenuItem value="NATA Foundation">NATA Foundation Course</MenuItem>
                  <MenuItem value="NATA Regular">NATA Regular Batch</MenuItem>
                  <MenuItem value="NATA Crash Course">NATA Crash Course</MenuItem>
                  <MenuItem value="Drawing Classes">Drawing Classes Only</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Batch Timing</InputLabel>
                <Select
                  value={formData.batchTiming}
                  label="Batch Timing"
                  onChange={(e) => handleChange('batchTiming', e.target.value)}
                >
                  <MenuItem value="Morning">Morning (8 AM - 12 PM)</MenuItem>
                  <MenuItem value="Afternoon">Afternoon (1 PM - 5 PM)</MenuItem>
                  <MenuItem value="Evening">Evening (5 PM - 9 PM)</MenuItem>
                  <MenuItem value="Weekend">Weekend Only</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Preferred Start Date"
                type="date"
                value={formData.startDate}
                onChange={(e) => handleChange('startDate', e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12}>
              <Alert severity="info">
                Our counselor will contact you within 24 hours to discuss course details and fees.
              </Alert>
            </Grid>
          </Grid>
        );

      case 3:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Review Your Application
            </Typography>
            <Paper sx={{ p: 2, mb: 2 }}>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Personal Details
              </Typography>
              <Grid container spacing={1}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Name:
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2">{formData.fullName}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Email:
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2">{formData.email}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Phone:
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2">{formData.phone}</Typography>
                </Grid>
              </Grid>
            </Paper>

            <Paper sx={{ p: 2, mb: 2 }}>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Academic Information
              </Typography>
              <Grid container spacing={1}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    School:
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2">{formData.schoolName}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Class:
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2">{formData.class}</Typography>
                </Grid>
              </Grid>
            </Paper>

            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Course Selection
              </Typography>
              <Grid container spacing={1}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Course:
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2">{formData.course}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Batch Timing:
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2">{formData.batchTiming}</Typography>
                </Grid>
              </Grid>
            </Paper>
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
        Apply for NATA Coaching
      </Typography>

      <Paper sx={{ p: { xs: 2, md: 3 } }}>
        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        <Box sx={{ mb: 3 }}>{renderStepContent(activeStep)}</Box>

        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button disabled={activeStep === 0} onClick={handleBack}>
            Back
          </Button>
          <Box>
            {activeStep === steps.length - 1 ? (
              <Button variant="contained" onClick={handleSubmit}>
                Submit Application
              </Button>
            ) : (
              <Button variant="contained" onClick={handleNext}>
                Next
              </Button>
            )}
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
