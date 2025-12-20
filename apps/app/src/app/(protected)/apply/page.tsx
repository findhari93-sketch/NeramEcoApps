'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Stepper,
  Step,
  StepLabel,
  Alert,
  CircularProgress,
  Snackbar,
  Container,
} from '@neram/ui';
import { ChatWidget, applicationFormFlow } from '@neram/ui';
import { useApplicationForm } from './hooks/useApplicationForm';
import Step1BasicDetails from './components/Step1BasicDetails';
import Step2Education from './components/Step2Education';
import Step3Scholarship from './components/Step3Scholarship';
import Step4Cashback from './components/Step4Cashback';
import Step5Source from './components/Step5Source';
import Step6Preview from './components/Step6Preview';

const steps = [
  'Basic Details',
  'Education',
  'Scholarship',
  'Cashback',
  'Source',
  'Review',
];

export default function ApplyPage() {
  const form = useApplicationForm();
  const {
    activeStep,
    isSubmitting,
    submitError,
    validateStep,
    nextStep,
    prevStep,
    submitForm,
    updateField,
  } = form;

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [showSuccess, setShowSuccess] = useState(false);
  const [chatComplete, setChatComplete] = useState(false);

  const handleNext = () => {
    const validation = validateStep(activeStep);
    if (validation.isValid) {
      setValidationErrors({});
      nextStep();
    } else {
      setValidationErrors(validation.errors);
    }
  };

  const handleSubmit = async () => {
    const validation = validateStep(activeStep);
    if (!validation.isValid) {
      setValidationErrors(validation.errors);
      return;
    }

    try {
      await submitForm();
      setShowSuccess(true);
    } catch {
      // Error is handled in the hook
    }
  };

  // Handle chat widget field updates
  const handleChatFieldUpdate = (field: string, value: unknown) => {
    updateField(field as keyof typeof form.formData, value as string);
  };

  const handleChatComplete = () => {
    setChatComplete(true);
  };

  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return <Step1BasicDetails form={form} errors={validationErrors} />;
      case 1:
        return <Step2Education form={form} errors={validationErrors} />;
      case 2:
        return <Step3Scholarship form={form} errors={validationErrors} />;
      case 3:
        return <Step4Cashback form={form} errors={validationErrors} />;
      case 4:
        return <Step5Source form={form} errors={validationErrors} />;
      case 5:
        return <Step6Preview form={form} errors={validationErrors} />;
      default:
        return null;
    }
  };

  // Success screen
  if (showSuccess) {
    return (
      <Container maxWidth="sm">
        <Paper sx={{ p: 4, textAlign: 'center', mt: 4 }}>
          <Box
            sx={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              bgcolor: 'success.light',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 3,
            }}
          >
            <Typography variant="h3">✓</Typography>
          </Box>
          <Typography variant="h5" gutterBottom fontWeight={600}>
            Application Submitted!
          </Typography>
          <Typography color="text.secondary" paragraph>
            Thank you for applying to Neram Classes. Our team will review your application
            and contact you within 24-48 hours.
          </Typography>
          <Alert severity="info" sx={{ textAlign: 'left', mb: 3 }}>
            <Typography variant="body2">
              <strong>What happens next?</strong>
              <br />
              1. Our counselor will call you to discuss course details
              <br />
              2. After verification, you'll receive fee details via email
              <br />
              3. Complete payment to confirm your admission
            </Typography>
          </Alert>
          {form.formData.scholarshipPercentage > 0 && (
            <Alert severity="success" sx={{ textAlign: 'left', mb: 3 }}>
              <Typography variant="body2">
                Your {form.formData.scholarshipPercentage}% scholarship documents will be verified.
                You'll be notified once approved!
              </Typography>
            </Alert>
          )}
          {form.formData.totalCashbackEligible > 0 && (
            <Alert severity="success" sx={{ textAlign: 'left', mb: 3 }}>
              <Typography variant="body2">
                You've earned Rs. {form.formData.totalCashbackEligible} cashback!
                It will be processed after your enrollment is complete.
              </Typography>
            </Alert>
          )}
          <Button
            variant="contained"
            href="/dashboard"
            sx={{ mt: 2 }}
          >
            Go to Dashboard
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, mb: 1 }}>
        Apply to Neram Classes
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Complete the form below to apply for NATA / JEE Paper 2 coaching
      </Typography>

      <Paper sx={{ p: { xs: 2, md: 3 } }}>
        {/* Stepper - Hidden on mobile, shown on larger screens */}
        <Box sx={{ display: { xs: 'none', md: 'block' }, mb: 4 }}>
          <Stepper activeStep={activeStep}>
            {steps.map((label, index) => (
              <Step key={label} completed={index < activeStep}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>

        {/* Mobile step indicator */}
        <Box sx={{ display: { xs: 'flex', md: 'none' }, mb: 3, alignItems: 'center', gap: 1 }}>
          <Typography variant="subtitle2" color="primary">
            Step {activeStep + 1} of {steps.length}
          </Typography>
          <Typography variant="subtitle1" fontWeight={600}>
            {steps[activeStep]}
          </Typography>
        </Box>

        {/* Error display */}
        {submitError && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {submitError}
          </Alert>
        )}

        {/* Step content */}
        <Box sx={{ mb: 4, minHeight: 300 }}>
          {renderStepContent()}
        </Box>

        {/* Navigation buttons */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Button
            disabled={activeStep === 0 || isSubmitting}
            onClick={prevStep}
            variant="outlined"
          >
            Back
          </Button>
          <Box sx={{ display: 'flex', gap: 2 }}>
            {activeStep === steps.length - 1 ? (
              <Button
                variant="contained"
                onClick={handleSubmit}
                disabled={isSubmitting}
                startIcon={isSubmitting ? <CircularProgress size={20} color="inherit" /> : null}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Application'}
              </Button>
            ) : (
              <Button
                variant="contained"
                onClick={handleNext}
              >
                Next
              </Button>
            )}
          </Box>
        </Box>
      </Paper>

      {/* Progress indicator */}
      <Box sx={{ mt: 2, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          {Math.round(((activeStep + 1) / steps.length) * 100)}% complete
        </Typography>
      </Box>

      {/* Chat Widget for guided form filling */}
      <ChatWidget
        flowConfig={applicationFormFlow}
        formData={form.formData as unknown as Record<string, unknown>}
        onFieldUpdate={handleChatFieldUpdate}
        onComplete={handleChatComplete}
        title="Nera"
        subtitle="Application Assistant"
      />

      {/* Snackbar for chat completion */}
      <Snackbar
        open={chatComplete && !showSuccess}
        autoHideDuration={5000}
        onClose={() => setChatComplete(false)}
        message="Chat complete! Review your form and click Submit when ready."
      />
    </Box>
  );
}
