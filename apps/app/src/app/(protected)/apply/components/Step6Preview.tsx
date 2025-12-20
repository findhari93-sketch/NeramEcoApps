'use client';

import React from 'react';
import {
  Box,
  Typography,
  Grid,
  Paper,
  Chip,
  FormControlLabel,
  Checkbox,
  FormHelperText,
  Alert,
  Divider,
  Stack,
  Link,
} from '@neram/ui';
import PersonIcon from '@mui/icons-material/Person';
import SchoolIcon from '@mui/icons-material/School';
import CardGiftcardIcon from '@mui/icons-material/CardGiftcard';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import EditIcon from '@mui/icons-material/Edit';
import type { UseApplicationFormReturn } from '../hooks/useApplicationForm';

interface Step6Props {
  form: UseApplicationFormReturn;
  errors: Record<string, string>;
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  onEdit: () => void;
  children: React.ReactNode;
}

function Section({ title, icon, onEdit, children }: SectionProps) {
  return (
    <Paper sx={{ p: 3, mb: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {icon}
          <Typography variant="subtitle1" fontWeight={600}>
            {title}
          </Typography>
        </Box>
        <Link
          component="button"
          variant="body2"
          onClick={onEdit}
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
        >
          <EditIcon fontSize="small" />
          Edit
        </Link>
      </Box>
      {children}
    </Paper>
  );
}

interface InfoRowProps {
  label: string;
  value: string | number | undefined | null;
}

function InfoRow({ label, value }: InfoRowProps) {
  if (!value) return null;
  return (
    <Grid container spacing={1} sx={{ mb: 1 }}>
      <Grid item xs={5}>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </Grid>
      <Grid item xs={7}>
        <Typography variant="body2" fontWeight={500}>
          {value}
        </Typography>
      </Grid>
    </Grid>
  );
}

const displayMappings: Record<string, Record<string, string>> = {
  board: {
    cbse: 'CBSE',
    icse: 'ICSE',
    state: 'State Board',
    ib: 'IB',
    other: 'Other',
  },
  currentClass: {
    '10th': '10th Standard',
    '11th': '11th Standard',
    '12th': '12th Standard',
    passed: 'Already Passed 12th',
  },
  courseInterest: {
    nata: 'NATA Preparation',
    jee_paper2: 'JEE Paper 2 (B.Arch)',
    both: 'Both NATA & JEE',
  },
  batchPreference: {
    morning: 'Morning (6 AM - 9 AM)',
    afternoon: 'Afternoon (2 PM - 5 PM)',
    evening: 'Evening (5 PM - 8 PM)',
    weekend: 'Weekends Only',
  },
  sourceCategory: {
    youtube: 'YouTube',
    instagram: 'Instagram',
    facebook: 'Facebook',
    google_search: 'Google Search',
    friend_referral: 'Friend/Family',
    school_visit: 'School Visit',
    newspaper: 'Newspaper/Magazine',
    whatsapp: 'WhatsApp',
    other: 'Other',
  },
};

export default function Step6Preview({ form, errors }: Step6Props) {
  const { formData, updateField, goToStep } = form;

  const getDisplayValue = (field: string, value: string) => {
    return displayMappings[field]?.[value] || value;
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom sx={{ mb: 1 }}>
        Review Your Application
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Please verify all information before submitting. Click "Edit" to make changes.
      </Typography>

      {/* Personal Details */}
      <Section
        title="Personal Details"
        icon={<PersonIcon color="primary" />}
        onEdit={() => goToStep(0)}
      >
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <InfoRow label="Full Name" value={formData.fullName} />
            <InfoRow label="Email" value={formData.email} />
            <InfoRow label="Phone" value={formData.phone} />
            <InfoRow label="Date of Birth" value={formData.dob} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <InfoRow label="Gender" value={formData.gender ? formData.gender.charAt(0).toUpperCase() + formData.gender.slice(1) : ''} />
            <InfoRow label="City" value={formData.city} />
            <InfoRow label="State" value={formData.state} />
            <InfoRow label="Pincode" value={formData.pincode} />
          </Grid>
        </Grid>
        {formData.address && (
          <Box sx={{ mt: 1 }}>
            <InfoRow label="Address" value={formData.address} />
          </Box>
        )}
      </Section>

      {/* Education */}
      <Section
        title="Education"
        icon={<SchoolIcon color="primary" />}
        onEdit={() => goToStep(1)}
      >
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <InfoRow label="School" value={formData.schoolName} />
            <InfoRow label="Board" value={getDisplayValue('board', formData.board)} />
            <InfoRow label="Class" value={getDisplayValue('currentClass', formData.currentClass)} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <InfoRow label="Course" value={getDisplayValue('courseInterest', formData.courseInterest)} />
            <InfoRow label="Batch" value={getDisplayValue('batchPreference', formData.batchPreference)} />
          </Grid>
        </Grid>
      </Section>

      {/* Scholarship */}
      {formData.scholarshipPercentage > 0 && (
        <Section
          title="Scholarship"
          icon={<LocalOfferIcon color="success" />}
          onEdit={() => goToStep(2)}
        >
          <Alert severity="success" sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="body2">
                You're eligible for {formData.scholarshipPercentage}% scholarship!
              </Typography>
              <Chip
                label={`${formData.scholarshipPercentage}% OFF`}
                color="success"
                size="small"
                sx={{ fontWeight: 600 }}
              />
            </Box>
          </Alert>
          <InfoRow label="Government School" value={formData.isGovernmentSchool ? 'Yes' : 'No'} />
          <InfoRow label="Years in Govt School" value={formData.governmentSchoolYears} />
          <InfoRow label="Low Income" value={formData.isLowIncome ? 'Yes' : 'No'} />
          <InfoRow label="School ID Card" value={formData.schoolIdCardUrl ? 'Uploaded' : 'Not uploaded'} />
          {formData.isLowIncome && (
            <InfoRow label="Income Certificate" value={formData.incomeCertificateUrl ? 'Uploaded' : 'Not uploaded'} />
          )}
        </Section>
      )}

      {/* Cashback */}
      {formData.totalCashbackEligible > 0 && (
        <Section
          title="Cashback Offers"
          icon={<CardGiftcardIcon color="primary" />}
          onEdit={() => goToStep(3)}
        >
          <Stack spacing={1}>
            {formData.youtubeVerified && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">YouTube Subscription</Typography>
                <Chip label="Rs. 50" size="small" color="success" />
              </Box>
            )}
            {formData.instagramFollowed && formData.instagramUsername && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">Instagram Follow (@{formData.instagramUsername})</Typography>
                <Chip label="Rs. 50" size="small" color="success" />
              </Box>
            )}
            <Divider />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" fontWeight={600}>Total Cashback</Typography>
              <Chip label={`Rs. ${formData.totalCashbackEligible}`} color="primary" />
            </Box>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Cashback will be transferred to {formData.cashbackPhoneNumber || formData.phone} after enrollment.
          </Typography>
          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2">
              Pay via UPI/Bank Transfer for an additional Rs. 100 cashback (available at payment step).
            </Typography>
          </Alert>
        </Section>
      )}

      {/* Source */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            How you found us
          </Typography>
          <Link
            component="button"
            variant="body2"
            onClick={() => goToStep(4)}
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
          >
            <EditIcon fontSize="small" />
            Edit
          </Link>
        </Box>
        <Typography variant="body2">
          {getDisplayValue('sourceCategory', formData.sourceCategory)}
          {formData.sourceCategory === 'friend_referral' && formData.friendReferralName && (
            <> - {formData.friendReferralName}</>
          )}
          {formData.sourceDetail && ` (${formData.sourceDetail})`}
        </Typography>
      </Paper>

      {/* Terms & Conditions */}
      <Paper sx={{ p: 3, bgcolor: 'grey.50' }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={formData.termsAccepted}
              onChange={(e) => updateField('termsAccepted', e.target.checked)}
              color="primary"
            />
          }
          label={
            <Typography variant="body2">
              I confirm that all information provided is accurate. I agree to the{' '}
              <Link href="/terms" target="_blank">Terms & Conditions</Link> and{' '}
              <Link href="/privacy" target="_blank">Privacy Policy</Link>.
            </Typography>
          }
        />
        {errors.termsAccepted && (
          <FormHelperText error sx={{ ml: 4 }}>
            {errors.termsAccepted}
          </FormHelperText>
        )}
      </Paper>
    </Box>
  );
}
