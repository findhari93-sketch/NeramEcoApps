'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Checkbox,
  FormControlLabel,
  FormControl,
  FormLabel,
  FormGroup,
  FormHelperText,
  RadioGroup,
  Radio,
  Select,
  MenuItem,
  Alert,
  Card,
  CardContent,
  CircularProgress,
} from '@neram/ui';
import type { JobPosting, ScreeningQuestion } from '@neram/database';

interface JobApplicationFormProps {
  jobPosting: JobPosting;
}

interface FormData {
  applicant_name: string;
  applicant_email: string;
  applicant_phone: string;
  portfolio_url: string;
  screening_answers: Record<string, string | number | boolean | string[]>;
  terms_agreed: boolean;
}

interface FormErrors {
  applicant_name?: string;
  applicant_email?: string;
  applicant_phone?: string;
  resume?: string;
  screening_answers?: Record<string, string>;
  terms_agreed?: string;
}

export default function JobApplicationForm({ jobPosting }: JobApplicationFormProps) {
  const [formData, setFormData] = useState<FormData>({
    applicant_name: '',
    applicant_email: '',
    applicant_phone: '',
    portfolio_url: '',
    screening_answers: {},
    terms_agreed: false,
  });
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleChange = useCallback((field: keyof FormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error on change
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field as keyof FormErrors];
        return next;
      });
    }
  }, [errors]);

  const handleScreeningAnswer = useCallback((questionId: string, value: string | number | boolean | string[]) => {
    setFormData((prev) => ({
      ...prev,
      screening_answers: { ...prev.screening_answers, [questionId]: value },
    }));
    if (errors.screening_answers?.[questionId]) {
      setErrors((prev) => {
        const next = { ...prev };
        if (next.screening_answers) {
          const sa = { ...next.screening_answers };
          delete sa[questionId];
          next.screening_answers = Object.keys(sa).length > 0 ? sa : undefined;
        }
        return next;
      });
    }
  }, [errors]);

  const handleMultiSelectToggle = useCallback((questionId: string, option: string) => {
    setFormData((prev) => {
      const current = (prev.screening_answers[questionId] as string[]) || [];
      const updated = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option];
      return {
        ...prev,
        screening_answers: { ...prev.screening_answers, [questionId]: updated },
      };
    });
  }, []);

  const handleResumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];
      if (!allowedTypes.includes(file.type)) {
        setErrors((prev) => ({ ...prev, resume: 'Only PDF, DOC, or DOCX files are allowed' }));
        setResumeFile(null);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setErrors((prev) => ({ ...prev, resume: 'File must be less than 5MB' }));
        setResumeFile(null);
        return;
      }
      setErrors((prev) => {
        const next = { ...prev };
        delete next.resume;
        return next;
      });
      setResumeFile(file);
    } else {
      setResumeFile(null);
    }
  }, []);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.applicant_name.trim() || formData.applicant_name.trim().length < 2) {
      newErrors.applicant_name = 'Name is required (minimum 2 characters)';
    }

    if (!formData.applicant_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.applicant_email)) {
      newErrors.applicant_email = 'A valid email address is required';
    }

    const phoneClean = formData.applicant_phone.replace(/[\s\-()]/g, '');
    if (!phoneClean || !/^(\+91)?[6-9]\d{9}$/.test(phoneClean)) {
      newErrors.applicant_phone = 'A valid Indian phone number is required (10 digits)';
    }

    // Validate required screening questions
    const screeningErrors: Record<string, string> = {};
    if (jobPosting.screening_questions) {
      for (const q of jobPosting.screening_questions) {
        if (q.required) {
          const answer = formData.screening_answers[q.id];
          if (
            answer === undefined ||
            answer === '' ||
            (Array.isArray(answer) && answer.length === 0)
          ) {
            screeningErrors[q.id] = 'This field is required';
          }
        }
      }
    }
    if (Object.keys(screeningErrors).length > 0) {
      newErrors.screening_answers = screeningErrors;
    }

    if (!formData.terms_agreed) {
      newErrors.terms_agreed = 'You must agree to the terms';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitResult(null);

    if (!validate()) return;

    setSubmitting(true);

    try {
      const fd = new FormData();
      fd.append('applicant_name', formData.applicant_name.trim());
      fd.append('applicant_email', formData.applicant_email.trim().toLowerCase());
      fd.append('applicant_phone', formData.applicant_phone.replace(/[\s\-()]/g, ''));
      fd.append('job_posting_id', jobPosting.id);
      fd.append('terms_agreed', 'true');

      if (formData.portfolio_url.trim()) {
        fd.append('portfolio_url', formData.portfolio_url.trim());
      }

      if (resumeFile) {
        fd.append('resume', resumeFile);
      }

      // Format screening answers
      const answers = Object.entries(formData.screening_answers).map(([question_id, answer]) => ({
        question_id,
        answer,
      }));
      if (answers.length > 0) {
        fd.append('screening_answers', JSON.stringify(answers));
      }

      const res = await fetch('/api/careers/apply', {
        method: 'POST',
        body: fd,
      });

      const json = await res.json();

      if (json.success) {
        setSubmitResult({
          type: 'success',
          message: 'Your application has been submitted successfully! We\'ll review it and get back to you soon.',
        });
        // Reset form
        setFormData({
          applicant_name: '',
          applicant_email: '',
          applicant_phone: '',
          portfolio_url: '',
          screening_answers: {},
          terms_agreed: false,
        });
        setResumeFile(null);
        setErrors({});
      } else {
        setSubmitResult({
          type: 'error',
          message: json.error || 'Failed to submit your application. Please try again.',
        });
      }
    } catch {
      setSubmitResult({
        type: 'error',
        message: 'An unexpected error occurred. Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const contractTerms = jobPosting.contract_terms;
  const hasContractTerms =
    contractTerms &&
    (contractTerms.min_duration_months ||
      contractTerms.probation_period_months ||
      contractTerms.remuneration_note ||
      (contractTerms.additional_terms && contractTerms.additional_terms.length > 0));

  return (
    <Card variant="outlined" sx={{ borderColor: 'divider' }}>
      <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
        <form onSubmit={handleSubmit} noValidate>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Result Message */}
            {submitResult && (
              <Alert severity={submitResult.type} onClose={() => setSubmitResult(null)}>
                {submitResult.message}
              </Alert>
            )}

            {/* Full Name */}
            <TextField
              label="Full Name"
              required
              fullWidth
              value={formData.applicant_name}
              onChange={(e) => handleChange('applicant_name', e.target.value)}
              error={!!errors.applicant_name}
              helperText={errors.applicant_name}
              inputProps={{ minLength: 2 }}
              sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
            />

            {/* Email */}
            <TextField
              label="Email Address"
              type="email"
              required
              fullWidth
              value={formData.applicant_email}
              onChange={(e) => handleChange('applicant_email', e.target.value)}
              error={!!errors.applicant_email}
              helperText={errors.applicant_email}
              sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
            />

            {/* Phone */}
            <TextField
              label="Phone Number"
              required
              fullWidth
              placeholder="+91 98765 43210"
              value={formData.applicant_phone}
              onChange={(e) => handleChange('applicant_phone', e.target.value)}
              error={!!errors.applicant_phone}
              helperText={errors.applicant_phone || 'Indian mobile number (10 digits)'}
              inputProps={{ inputMode: 'tel' }}
              sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
            />

            {/* Resume Upload */}
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                Resume (PDF, DOC, DOCX - Max 5MB)
              </Typography>
              <Button
                variant="outlined"
                component="label"
                fullWidth
                sx={{
                  minHeight: 48,
                  justifyContent: 'flex-start',
                  textTransform: 'none',
                  color: resumeFile ? 'text.primary' : 'text.secondary',
                  borderColor: errors.resume ? 'error.main' : 'divider',
                }}
              >
                {resumeFile ? resumeFile.name : 'Choose File'}
                <input
                  type="file"
                  hidden
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleResumeChange}
                />
              </Button>
              {errors.resume && (
                <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
                  {errors.resume}
                </Typography>
              )}
            </Box>

            {/* Portfolio URL */}
            <TextField
              label="Portfolio URL (optional)"
              type="url"
              fullWidth
              placeholder="https://your-portfolio.com"
              value={formData.portfolio_url}
              onChange={(e) => handleChange('portfolio_url', e.target.value)}
              sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
            />

            {/* Screening Questions */}
            {jobPosting.screening_questions && jobPosting.screening_questions.length > 0 && (
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                  Additional Questions
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                  {jobPosting.screening_questions.map((question) => (
                    <ScreeningQuestionField
                      key={question.id}
                      question={question}
                      value={formData.screening_answers[question.id]}
                      onChange={(value) => handleScreeningAnswer(question.id, value)}
                      onMultiToggle={(option) => handleMultiSelectToggle(question.id, option)}
                      error={errors.screening_answers?.[question.id]}
                    />
                  ))}
                </Box>
              </Box>
            )}

            {/* Contract Terms Agreement */}
            <Box>
              {hasContractTerms && (
                <Box
                  sx={{
                    mb: 2,
                    p: 2,
                    bgcolor: 'grey.50',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                    Contract Terms Summary:
                  </Typography>
                  <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                    {contractTerms.min_duration_months && (
                      <Box component="li">
                        <Typography variant="body2" color="text.secondary">
                          Minimum commitment: {contractTerms.min_duration_months} months
                        </Typography>
                      </Box>
                    )}
                    {contractTerms.probation_period_months && (
                      <Box component="li">
                        <Typography variant="body2" color="text.secondary">
                          Probation period: {contractTerms.probation_period_months} months
                        </Typography>
                      </Box>
                    )}
                    <Box component="li">
                      <Typography variant="body2" color="text.secondary">
                        {contractTerms.remuneration_note || 'Remuneration will be discussed during the interview process'}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              )}

              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.terms_agreed}
                    onChange={(e) => handleChange('terms_agreed', e.target.checked)}
                    sx={{ '& .MuiSvgIcon-root': { fontSize: 24 } }}
                  />
                }
                label={
                  <Typography variant="body2">
                    {hasContractTerms
                      ? `I have read and agree to the contract terms${contractTerms.min_duration_months ? ` including the minimum ${contractTerms.min_duration_months} month commitment` : ''}${contractTerms.probation_period_months ? ` and ${contractTerms.probation_period_months} month probation period` : ''}. I understand that remuneration will be discussed during the interview.`
                      : 'I agree to the terms and conditions of this application.'}
                  </Typography>
                }
                sx={{ alignItems: 'flex-start', '& .MuiCheckbox-root': { pt: 0 } }}
              />
              {errors.terms_agreed && (
                <Typography variant="caption" color="error" sx={{ ml: 4 }}>
                  {errors.terms_agreed}
                </Typography>
              )}
            </Box>

            {/* Submit Button */}
            <Button
              type="submit"
              variant="contained"
              color="secondary"
              size="large"
              disabled={submitting}
              fullWidth
              sx={{ minHeight: 52, fontSize: '1rem', fontWeight: 600 }}
            >
              {submitting ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <CircularProgress size={20} color="inherit" />
                  Submitting...
                </Box>
              ) : (
                'Submit Application'
              )}
            </Button>
          </Box>
        </form>
      </CardContent>
    </Card>
  );
}

// ---- Screening Question Renderer ----

interface ScreeningQuestionFieldProps {
  question: ScreeningQuestion;
  value: string | number | boolean | string[] | undefined;
  onChange: (value: string | number | boolean | string[]) => void;
  onMultiToggle: (option: string) => void;
  error?: string;
}

function ScreeningQuestionField({
  question,
  value,
  onChange,
  onMultiToggle,
  error,
}: ScreeningQuestionFieldProps) {
  switch (question.type) {
    case 'text':
      return (
        <TextField
          label={question.question}
          required={question.required}
          fullWidth
          placeholder={question.placeholder}
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          error={!!error}
          helperText={error}
          sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
        />
      );

    case 'number':
      return (
        <TextField
          label={question.question}
          type="number"
          required={question.required}
          fullWidth
          placeholder={question.placeholder}
          value={value !== undefined ? String(value) : ''}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}
          error={!!error}
          helperText={error}
          inputProps={{ inputMode: 'numeric' }}
          sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
        />
      );

    case 'select':
      return (
        <FormControl fullWidth error={!!error} required={question.required}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
            {question.question} {question.required && '*'}
          </Typography>
          <Select
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value as string)}
            displayEmpty
            sx={{ minHeight: 48 }}
          >
            <MenuItem value="" disabled>
              <em>{question.placeholder || 'Select an option'}</em>
            </MenuItem>
            {question.options?.map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </Select>
          {error && <FormHelperText>{error}</FormHelperText>}
        </FormControl>
      );

    case 'multi_select':
      return (
        <FormControl error={!!error} required={question.required}>
          <FormLabel sx={{ fontWeight: 600, fontSize: '0.875rem', mb: 0.5 }}>
            {question.question} {question.required && '*'}
          </FormLabel>
          <FormGroup>
            {question.options?.map((option) => (
              <FormControlLabel
                key={option}
                control={
                  <Checkbox
                    checked={((value as string[]) || []).includes(option)}
                    onChange={() => onMultiToggle(option)}
                    sx={{ '& .MuiSvgIcon-root': { fontSize: 24 } }}
                  />
                }
                label={<Typography variant="body2">{option}</Typography>}
                sx={{ minHeight: 40 }}
              />
            ))}
          </FormGroup>
          {error && <FormHelperText>{error}</FormHelperText>}
        </FormControl>
      );

    case 'boolean':
      return (
        <FormControl error={!!error} required={question.required}>
          <FormLabel sx={{ fontWeight: 600, fontSize: '0.875rem', mb: 0.5 }}>
            {question.question} {question.required && '*'}
          </FormLabel>
          <RadioGroup
            value={value !== undefined ? String(value) : ''}
            onChange={(e) => onChange(e.target.value === 'true')}
          >
            <FormControlLabel
              value="true"
              control={<Radio sx={{ '& .MuiSvgIcon-root': { fontSize: 24 } }} />}
              label={<Typography variant="body2">Yes</Typography>}
              sx={{ minHeight: 40 }}
            />
            <FormControlLabel
              value="false"
              control={<Radio sx={{ '& .MuiSvgIcon-root': { fontSize: 24 } }} />}
              label={<Typography variant="body2">No</Typography>}
              sx={{ minHeight: 40 }}
            />
          </RadioGroup>
          {error && <FormHelperText>{error}</FormHelperText>}
        </FormControl>
      );

    default:
      return null;
  }
}
