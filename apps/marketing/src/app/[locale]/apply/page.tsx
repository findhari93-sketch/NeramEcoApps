'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Stepper,
  Step,
  StepLabel,
  Grid,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Select,
  MenuItem,
  InputLabel,
  Alert,
  Checkbox,
} from '@neram/ui';

const steps = ['Personal Information', 'Academic Details', 'Course Selection', 'Review & Submit'];

const courses = [
  'NEET Preparation',
  'JEE Main & Advanced',
  'Foundation Course (8th-10th)',
  'Class 11 & 12 Boards',
  'NDA Preparation',
  'CA Foundation',
];

export default function ApplyPage() {
  const t = useTranslations('apply');
  const [activeStep, setActiveStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  // Form data state
  const [formData, setFormData] = useState({
    // Step 1: Personal Information
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    gender: '',
    address: '',
    city: '',
    state: '',
    pincode: '',

    // Step 2: Academic Details
    currentClass: '',
    previousClass: '',
    schoolName: '',
    board: '',
    percentage: '',
    subjects: '',

    // Step 3: Course Selection
    course: '',
    batchPreference: '',
    modePreference: '',

    // Terms
    termsAccepted: false,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | any) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value,
    });
  };

  const handleNext = () => {
    setActiveStep((prevStep) => prevStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement form submission logic
    console.log('Application submitted:', formData);
    setSubmitted(true);
  };

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Personal Information
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="First Name"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Last Name"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Email Address"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Phone Number"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Date of Birth"
                name="dateOfBirth"
                type="date"
                value={formData.dateOfBirth}
                onChange={handleChange}
                required
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required>
                <FormLabel>Gender</FormLabel>
                <RadioGroup
                  row
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
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
                name="address"
                value={formData.address}
                onChange={handleChange}
                multiline
                rows={2}
                required
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="City"
                name="city"
                value={formData.city}
                onChange={handleChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="State"
                name="state"
                value={formData.state}
                onChange={handleChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Pincode"
                name="pincode"
                value={formData.pincode}
                onChange={handleChange}
                required
              />
            </Grid>
          </Grid>
        );

      case 1:
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Academic Details
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required>
                <InputLabel>Current Class/Year</InputLabel>
                <Select
                  name="currentClass"
                  value={formData.currentClass}
                  onChange={handleChange}
                  label="Current Class/Year"
                >
                  <MenuItem value="8th">8th Standard</MenuItem>
                  <MenuItem value="9th">9th Standard</MenuItem>
                  <MenuItem value="10th">10th Standard</MenuItem>
                  <MenuItem value="11th">11th Standard</MenuItem>
                  <MenuItem value="12th">12th Standard</MenuItem>
                  <MenuItem value="12th-pass">12th Passed</MenuItem>
                  <MenuItem value="dropout">Dropout</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Previous Class"
                name="previousClass"
                value={formData.previousClass}
                onChange={handleChange}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="School/College Name"
                name="schoolName"
                value={formData.schoolName}
                onChange={handleChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required>
                <InputLabel>Board</InputLabel>
                <Select
                  name="board"
                  value={formData.board}
                  onChange={handleChange}
                  label="Board"
                >
                  <MenuItem value="cbse">CBSE</MenuItem>
                  <MenuItem value="icse">ICSE</MenuItem>
                  <MenuItem value="state">State Board</MenuItem>
                  <MenuItem value="other">Other</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Previous Year Percentage/CGPA"
                name="percentage"
                value={formData.percentage}
                onChange={handleChange}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Subjects (comma separated)"
                name="subjects"
                value={formData.subjects}
                onChange={handleChange}
                placeholder="e.g., Physics, Chemistry, Mathematics"
                multiline
                rows={2}
              />
            </Grid>
          </Grid>
        );

      case 2:
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Course Selection
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth required>
                <InputLabel>Select Course</InputLabel>
                <Select
                  name="course"
                  value={formData.course}
                  onChange={handleChange}
                  label="Select Course"
                >
                  {courses.map((course) => (
                    <MenuItem key={course} value={course}>
                      {course}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required>
                <InputLabel>Batch Preference</InputLabel>
                <Select
                  name="batchPreference"
                  value={formData.batchPreference}
                  onChange={handleChange}
                  label="Batch Preference"
                >
                  <MenuItem value="morning">Morning (6 AM - 12 PM)</MenuItem>
                  <MenuItem value="afternoon">Afternoon (12 PM - 6 PM)</MenuItem>
                  <MenuItem value="evening">Evening (6 PM - 10 PM)</MenuItem>
                  <MenuItem value="weekend">Weekend</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required>
                <InputLabel>Mode of Learning</InputLabel>
                <Select
                  name="modePreference"
                  value={formData.modePreference}
                  onChange={handleChange}
                  label="Mode of Learning"
                >
                  <MenuItem value="offline">Offline (Classroom)</MenuItem>
                  <MenuItem value="online">Online (Live Classes)</MenuItem>
                  <MenuItem value="hybrid">Hybrid (Both)</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        );

      case 3:
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Review Your Application
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Please review all the information before submitting
              </Typography>
            </Grid>

            <Grid item xs={12}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 700 }}>
                    Personal Information
                  </Typography>
                  <Typography variant="body2">
                    Name: {formData.firstName} {formData.lastName}
                  </Typography>
                  <Typography variant="body2">Email: {formData.email}</Typography>
                  <Typography variant="body2">Phone: {formData.phone}</Typography>
                  <Typography variant="body2">
                    Address: {formData.address}, {formData.city}, {formData.state} - {formData.pincode}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 700 }}>
                    Academic Details
                  </Typography>
                  <Typography variant="body2">Current Class: {formData.currentClass}</Typography>
                  <Typography variant="body2">School: {formData.schoolName}</Typography>
                  <Typography variant="body2">Board: {formData.board}</Typography>
                  <Typography variant="body2">Percentage: {formData.percentage}</Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 700 }}>
                    Course Selection
                  </Typography>
                  <Typography variant="body2">Course: {formData.course}</Typography>
                  <Typography variant="body2">Batch: {formData.batchPreference}</Typography>
                  <Typography variant="body2">Mode: {formData.modePreference}</Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Checkbox
                    name="termsAccepted"
                    checked={formData.termsAccepted}
                    onChange={handleChange}
                    required
                  />
                }
                label="I agree to the terms and conditions and confirm that all information provided is accurate"
              />
            </Grid>
          </Grid>
        );

      default:
        return null;
    }
  };

  if (submitted) {
    return (
      <Box sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="md">
          <Card>
            <CardContent sx={{ p: { xs: 3, md: 6 }, textAlign: 'center' }}>
              <Typography variant="h4" gutterBottom sx={{ fontWeight: 700, color: 'success.main' }}>
                Application Submitted Successfully!
              </Typography>
              <Typography variant="body1" paragraph>
                Thank you for applying to Neram Classes. We have received your application and will review it shortly.
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                You will receive a confirmation email at {formData.email} with further details.
                Our admissions team will contact you within 2-3 business days.
              </Typography>
              <Box sx={{ mt: 4 }}>
                <Button variant="contained" size="large" href="/">
                  Back to Home
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Container>
      </Box>
    );
  }

  return (
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          py: { xs: 6, md: 8 },
        }}
      >
        <Container maxWidth="lg">
          <Typography
            variant="h2"
            component="h1"
            gutterBottom
            sx={{ fontWeight: 700 }}
          >
            Apply for Admission
          </Typography>
          <Typography variant="h5" sx={{ maxWidth: '700px', opacity: 0.9 }}>
            Take the first step towards your academic success. Fill out the
            application form below.
          </Typography>
        </Container>
      </Box>

      {/* Application Form */}
      <Box sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="md">
          <Card>
            <CardContent sx={{ p: { xs: 3, md: 4 } }}>
              <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
                {steps.map((label) => (
                  <Step key={label}>
                    <StepLabel>{label}</StepLabel>
                  </Step>
                ))}
              </Stepper>

              <form onSubmit={handleSubmit}>
                {renderStepContent(activeStep)}

                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
                  <Button
                    disabled={activeStep === 0}
                    onClick={handleBack}
                    variant="outlined"
                  >
                    Back
                  </Button>
                  {activeStep === steps.length - 1 ? (
                    <Button
                      variant="contained"
                      type="submit"
                      disabled={!formData.termsAccepted}
                    >
                      Submit Application
                    </Button>
                  ) : (
                    <Button variant="contained" onClick={handleNext}>
                      Next
                    </Button>
                  )}
                </Box>
              </form>
            </CardContent>
          </Card>
        </Container>
      </Box>
    </Box>
  );
}
