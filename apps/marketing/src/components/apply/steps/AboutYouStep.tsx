'use client';

import { useRef, useState } from 'react';
import { Alert, Box, Button, Chip, InputAdornment, Menu, MenuItem, Stack, TextField } from '@neram/ui';
import ButtonBase from '@mui/material/ButtonBase';
import ExpandMore from '@mui/icons-material/ExpandMore';
import VerifiedOutlined from '@mui/icons-material/VerifiedOutlined';
import { useTranslations } from 'next-intl';
import StepHeading from '../StepHeading';
import { useFormContext } from '../FormContext';
import { SUPPORTED_COUNTRIES, getCountryConfig } from '../countryConfig';
import { currentlyInOf, type CurrentlyIn } from '../types';
import Field from '../fields/Field';
import Segmented from '../fields/Segmented';
import GoogleCard from '../fields/GoogleCard';
import OrDivider from '../fields/OrDivider';
import PlaceField from '../fields/PlaceField';
import { trackTaxonomyEvent } from '@/lib/funnel-tracker';

interface AboutYouStepProps {
  /** Starts Google sign-in. The Google card shows only while this is set (signed out). */
  onSignIn?: () => void;
  /** Google sign-in is in progress. */
  signInBusy?: boolean;
  /** Shown under the card when Google sign-in failed. */
  signInError?: string | null;
}

const EMPTY_SCHOOL = { current_class: '', school_name: '', board: '', previous_percentage: undefined };

/**
 * Step 1, About you: a sign-in card, then full name and father's name (many
 * students share a name), mobile and email, "I'm currently in", and where the
 * student lives (a PIN code in India, a country and city abroad). Date of
 * birth, gender, address and a parent's mobile are asked on Review.
 */
export default function AboutYouStep({ onSignIn, signInBusy = false, signInError = null }: AboutYouStepProps) {
  const t = useTranslations('apply');
  const { formData, updateFormData, isFieldPrefilled, setShowPhoneVerification, markApplicationStarted } = useFormContext();
  const [countryAnchor, setCountryAnchor] = useState<HTMLElement | null>(null);
  const manualTracked = useRef(false);

  const { personal, academic } = formData;
  const countryConfig = getCountryConfig(personal.phoneCountry);

  /** The mobile's code only (where the student lives is asked separately). A new code is a new number. */
  const handlePhoneCountryChange = (code: string) => {
    markStarted();
    updateFormData('personal', { phoneCountry: code, phone: '', phoneVerified: false, phoneVerifiedAt: null });
  };

  /** The first keystroke or tap starts the application; signed out, it is also the manual path. */
  const markStarted = () => {
    markApplicationStarted();
    if (onSignIn && !manualTracked.current) {
      manualTracked.current = true;
      trackTaxonomyEvent('manual_entry_started');
    }
  };

  const handlePhoneChange = (value: string) => {
    markStarted();
    const cleaned = value.replace(/\D/g, '').slice(0, countryConfig.phoneLength);
    updateFormData('personal', { phone: cleaned, phoneVerified: false, phoneVerifiedAt: null });
  };

  const handleCurrentlyIn = (value: CurrentlyIn) => {
    markStarted();
    if (value === '11' || value === '12' || value === 'repeater') {
      const school =
        academic.applicantCategory === 'school_student' && academic.schoolStudentData ? academic.schoolStudentData : EMPTY_SCHOOL;
      updateFormData('academic', {
        currentlyIn: value,
        applicantCategory: 'school_student',
        schoolStudentData: { ...school, current_class: value === 'repeater' ? '12_completed' : value },
        diplomaStudentData: null,
        collegeStudentData: null,
        workingProfessionalData: null,
      });
    } else if (value === 'other') {
      // A diploma, college or working applicant keeps what Your studies already holds.
      const keep = !!academic.applicantCategory && academic.applicantCategory !== 'school_student';
      updateFormData('academic', keep ? { currentlyIn: 'other' } : { currentlyIn: 'other', applicantCategory: null, schoolStudentData: null });
    }
  };

  const prefilledChip = (field: string) =>
    isFieldPrefilled(field) ? (
      <InputAdornment position="end">
        <Chip label={t('aboutYou.prefilled')} size="small" color="info" variant="outlined" />
      </InputAdornment>
    ) : undefined;

  const phoneLengthOk = personal.phone.length === countryConfig.phoneLength;
  const phonePartial = !personal.phoneVerified && personal.phone.length > 0 && !phoneLengthOk;

  return (
    <Box>
      <StepHeading title={t('aboutYou.title')} subtitle={t('aboutYou.subtitleShort')} />

      <Stack spacing={3}>
        {onSignIn && (
          <>
            <Box>
              <GoogleCard title={t('aboutYou.googleTitle')} body={t('aboutYou.googleBody')} onClick={onSignIn} busy={signInBusy} />
              {signInError && (
                <Alert severity="error" role="alert" sx={{ mt: 1.5 }}>
                  {signInError}
                </Alert>
              )}
            </Box>
            <OrDivider label={t('aboutYou.orTypeIt')} />
          </>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: { xs: 3, sm: 2 }, alignItems: 'start' }}>
          <Field id="apply-first-name" label={t('aboutYou.fullName')}>
            <TextField
              id="apply-first-name"
              fullWidth
              hiddenLabel
              placeholder={t('aboutYou.fullNamePlaceholder')}
              value={personal.firstName}
              onChange={(e) => {
                markStarted();
                updateFormData('personal', { firstName: e.target.value });
              }}
              InputProps={{ endAdornment: prefilledChip('firstName') }}
              inputProps={{ minLength: 2, name: 'firstName', autoComplete: 'name', 'aria-required': true }}
            />
          </Field>

          <Field id="apply-father-name" label={t('aboutYou.fatherName')} helper={t('aboutYou.fatherNameHelper')}>
            <TextField
              id="apply-father-name"
              fullWidth
              hiddenLabel
              placeholder={t('aboutYou.fatherPlaceholder')}
              value={personal.fatherName}
              onChange={(e) => {
                markStarted();
                updateFormData('personal', { fatherName: e.target.value });
              }}
              InputProps={{ endAdornment: prefilledChip('fatherName') }}
              inputProps={{ minLength: 2, name: 'fatherName', 'aria-required': true, 'aria-describedby': 'apply-father-name-helper' }}
            />
          </Field>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: { xs: 3, sm: 2 }, alignItems: 'start' }}>
          <Field
            id="apply-phone"
            label={t('aboutYou.phoneWhatsapp')}
            error={phonePartial}
            helper={phonePartial ? t('aboutYou.phoneInvalid', { length: countryConfig.phoneLength }) : undefined}
          >
            <Box sx={{ display: 'flex' }}>
              <ButtonBase
                onClick={(e) => setCountryAnchor(e.currentTarget)}
                aria-haspopup="menu"
                aria-label={t('aboutYou.countryCode', { country: countryConfig.name })}
                sx={{
                  flex: 'none',
                  minWidth: 64,
                  height: 48,
                  px: 1.25,
                  gap: 0.25,
                  border: '2px solid',
                  borderColor: 'text.primary',
                  borderRight: 0,
                  bgcolor: '#f4f3ef',
                  fontSize: 16,
                  fontWeight: 700,
                  color: 'text.primary',
                  '&.Mui-focusVisible': { boxShadow: '0 0 0 3px rgba(232, 160, 32, 0.35)', zIndex: 1 },
                }}
              >
                {countryConfig.phonePrefix}
                {SUPPORTED_COUNTRIES.length > 1 && <ExpandMore aria-hidden sx={{ fontSize: 18, color: 'text.secondary' }} />}
              </ButtonBase>
              <Menu anchorEl={countryAnchor} open={!!countryAnchor} onClose={() => setCountryAnchor(null)}>
                {SUPPORTED_COUNTRIES.map((c) => (
                  <MenuItem
                    key={c.code}
                    selected={c.code === personal.phoneCountry}
                    onClick={() => {
                      setCountryAnchor(null);
                      if (c.code !== personal.phoneCountry) handlePhoneCountryChange(c.code);
                    }}
                    sx={{ minHeight: 48, gap: 1.5 }}
                  >
                    <Box component="span" sx={{ fontWeight: 700, minWidth: 48 }}>
                      {c.phonePrefix}
                    </Box>
                    {c.name}
                  </MenuItem>
                ))}
              </Menu>
              <TextField
                id="apply-phone"
                fullWidth
                hiddenLabel
                placeholder={countryConfig.code === 'IN' ? t('aboutYou.phonePlaceholder') : countryConfig.phonePlaceholder}
                value={personal.phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                error={phonePartial}
                inputProps={{
                  inputMode: 'numeric',
                  pattern: '[0-9]*',
                  maxLength: countryConfig.phoneLength,
                  name: 'phone',
                  autoComplete: 'tel-national',
                  'aria-required': true,
                  'aria-describedby': phonePartial ? 'apply-phone-helper' : undefined,
                }}
                InputProps={{
                  endAdornment: personal.phoneVerified ? (
                    <InputAdornment position="end" sx={{ ml: 0.5 }}>
                      <Chip
                        icon={<VerifiedOutlined sx={{ fontSize: 14 }} />}
                        label={t('aboutYou.verified')}
                        size="small"
                        color="success"
                        sx={{ height: 24, '& .MuiChip-label': { px: 0.75, fontSize: '0.75rem' } }}
                      />
                    </InputAdornment>
                  ) : phoneLengthOk ? (
                    <InputAdornment position="end" sx={{ ml: 0.5 }}>
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => setShowPhoneVerification(true)}
                        sx={{ minWidth: 'auto', px: 1, minHeight: 44, fontWeight: 700 }}
                      >
                        {t('aboutYou.verify')}
                      </Button>
                    </InputAdornment>
                  ) : null,
                  sx: { '& input': { minWidth: 0 } },
                }}
              />
            </Box>
          </Field>

          <Field id="apply-email" label={t('aboutYou.email')}>
            <TextField
              id="apply-email"
              fullWidth
              hiddenLabel
              type="email"
              placeholder={t('aboutYou.emailPlaceholder')}
              value={personal.email}
              onChange={(e) => {
                markStarted();
                updateFormData('personal', { email: e.target.value });
              }}
              InputProps={{ endAdornment: prefilledChip('email') }}
              inputProps={{ name: 'email', autoComplete: 'email' }}
            />
          </Field>
        </Box>

        <Segmented<Exclude<CurrentlyIn, ''>>
          id="apply-currently-in"
          label={t('aboutYou.currentlyIn')}
          required
          value={currentlyInOf(academic)}
          onChange={(value) => value && handleCurrentlyIn(value)}
          options={[
            { value: '11', label: t('aboutYou.currentlyIn11') },
            { value: '12', label: t('aboutYou.currentlyIn12') },
            { value: 'repeater', label: t('aboutYou.currentlyInRepeater') },
            { value: 'other', label: t('aboutYou.currentlyInOther') },
          ]}
        />

        <PlaceField onTouched={markStarted} />
      </Stack>
    </Box>
  );
}
