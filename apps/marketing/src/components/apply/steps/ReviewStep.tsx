'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Divider,
  Chip,
  FormControlLabel,
  Checkbox,
  Button,
  InputAdornment,
  Stack,
  TextField,
} from '@neram/ui';
import EditOutlined from '@mui/icons-material/EditOutlined';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import { useTranslations } from 'next-intl';
import StepHeading from '../StepHeading';
import { useFormContext } from '../FormContext';
import type { FormStep } from '../types';
import Field from '../fields/Field';
import Segmented from '../fields/Segmented';
import { getCountryConfig, residenceLabel } from '../countryConfig';
import { APPLICANT_CATEGORY_OPTIONS, CASTE_CATEGORY_OPTIONS, SCHOOL_TYPE_OPTIONS } from '@neram/database';
import LegalDrawer from '@/components/legal/LegalDrawer';

const COURSE_KEYS: Record<string, string> = {
  nata: 'yourCourse.nata',
  jee_paper2: 'yourCourse.jee',
  both: 'yourCourse.both',
  not_sure: 'yourCourse.notSure',
};

const CLASS_KEYS: Record<string, string> = {
  '11': 'aboutYou.currentlyIn11',
  '12': 'aboutYou.currentlyIn12',
  '12_completed': 'aboutYou.currentlyInRepeater',
};

interface ReviewItemProps {
  label: string;
  value?: string | number | null;
  trailing?: React.ReactNode;
}

function ReviewItem({ label, value, trailing }: ReviewItemProps) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <Box sx={{ mb: 1.25 }}>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="body2">{value}</Typography>
        {trailing}
      </Box>
    </Box>
  );
}

interface ReviewStepProps {
  onEditStep: (step: FormStep) => void;
}

/**
 * The personal details About you leaves out: date of birth, gender, address
 * and a parent's mobile. Name, father's name and the place are on step 1.
 */
function MoreDetails() {
  const t = useTranslations('apply');
  const { formData, updateFormData } = useFormContext();
  const { personal, location } = formData;
  const phoneConfig = getCountryConfig(personal.phoneCountry);

  return (
    <Box component="section" aria-labelledby="apply-more-details" sx={{ mb: 4 }}>
      <Typography id="apply-more-details" variant="h6" component="h2" sx={{ fontWeight: 700, mb: 0.5 }}>
        {t('review.moreDetails')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        {t('review.moreDetailsBody')}
      </Typography>

      <Stack spacing={3}>
        <Field id="apply-dob" label={t('aboutYou.dateOfBirth')}>
          <TextField
            id="apply-dob"
            fullWidth
            hiddenLabel
            type="date"
            value={personal.dateOfBirth}
            onChange={(e) => updateFormData('personal', { dateOfBirth: e.target.value })}
            inputProps={{ max: new Date().toISOString().split('T')[0], name: 'dateOfBirth', 'aria-required': true }}
          />
        </Field>

        <Segmented<'male' | 'female' | 'other'>
          id="apply-gender"
          label={t('aboutYou.gender')}
          value={personal.gender}
          onChange={(value) => updateFormData('personal', { gender: value })}
          options={[
            { value: 'male', label: t('aboutYou.genderMale') },
            { value: 'female', label: t('aboutYou.genderFemale') },
            { value: 'other', label: t('aboutYou.genderOther') },
          ]}
        />

        <Field id="apply-address" label={t('aboutYou.address')} helper={t('aboutYou.addressHelper')}>
          <TextField
            id="apply-address"
            fullWidth
            hiddenLabel
            multiline
            minRows={2}
            value={location.address}
            onChange={(e) => updateFormData('location', { address: e.target.value })}
            inputProps={{ name: 'address', autoComplete: 'street-address', 'aria-describedby': 'apply-address-helper' }}
            sx={{ '& .MuiOutlinedInput-root': { p: '12.5px 14px' }, '& textarea': { p: 0 } }}
          />
        </Field>

        <Field id="apply-parent-phone" label={t('aboutYou.parentPhone')}>
          <TextField
            id="apply-parent-phone"
            fullWidth
            hiddenLabel
            value={personal.parentPhone}
            onChange={(e) =>
              updateFormData('personal', {
                parentPhone: e.target.value.replace(/\D/g, '').slice(0, phoneConfig.phoneLength),
              })
            }
            inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: phoneConfig.phoneLength, name: 'parentPhone' }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start" sx={{ mr: 0.5 }}>
                  <Typography component="span" sx={{ fontSize: 16, fontWeight: 700, color: 'text.secondary' }}>
                    {phoneConfig.phonePrefix}
                  </Typography>
                </InputAdornment>
              ),
            }}
          />
        </Field>
      </Stack>
    </Box>
  );
}

/**
 * Step 3, Review: first the details About you leaves out, then three summary
 * groups (About you, Your course, Contact), each with one Edit that returns
 * to the step that owns it, then the terms. What happens next belongs to the
 * pay step, so no delivery promises here.
 */
export default function ReviewStep({ onEditStep }: ReviewStepProps) {
  const t = useTranslations('apply');
  const { formData, setTermsAccepted } = useFormContext();
  const { personal, location, academic, course, termsAccepted } = formData;
  const [legalOpen, setLegalOpen] = useState(false);
  const [legalTab, setLegalTab] = useState(0);

  const categoryLabel = APPLICANT_CATEGORY_OPTIONS.find((opt) => opt.value === academic.applicantCategory)?.label || null;
  const casteLabel = CASTE_CATEGORY_OPTIONS.find((opt) => opt.value === academic.casteCategory)?.label || null;
  const schoolTypeLabel = SCHOOL_TYPE_OPTIONS.find((opt) => opt.value === academic.schoolType)?.label || null;

  const locationLine = [
    location.city,
    location.country === 'IN' ? location.state : null,
    residenceLabel(location.country, location.countryName),
    location.country === 'IN' ? location.pincode : null,
  ]
    .filter(Boolean)
    .join(', ');
  const phoneLine = personal.phone ? `${getCountryConfig(personal.phoneCountry).phonePrefix} ${personal.phone}` : '';

  const renderStudies = () => {
    const { applicantCategory, schoolStudentData, diplomaStudentData, collegeStudentData, workingProfessionalData } = academic;
    switch (applicantCategory) {
      case 'school_student':
        return (
          <>
            <ReviewItem
              label="Class"
              value={
                schoolStudentData?.current_class && CLASS_KEYS[schoolStudentData.current_class]
                  ? t(CLASS_KEYS[schoolStudentData.current_class])
                  : schoolStudentData?.current_class
              }
            />
            <ReviewItem label="School" value={schoolStudentData?.school_name} />
            <ReviewItem label="Board" value={schoolStudentData?.board} />
            <ReviewItem label={t('yourCourse.schoolType')} value={schoolTypeLabel} />
          </>
        );
      case 'diploma_student':
        return (
          <>
            <ReviewItem label="College" value={diplomaStudentData?.college_name} />
            <ReviewItem label="Department" value={diplomaStudentData?.department} />
            <ReviewItem label="Completed before diploma" value={diplomaStudentData?.completed_grade} />
          </>
        );
      case 'college_student':
        return (
          <>
            <ReviewItem label="College" value={collegeStudentData?.college_name} />
            <ReviewItem label="Department" value={collegeStudentData?.department} />
            <ReviewItem label="Year of study" value={collegeStudentData?.year_of_study} />
            <ReviewItem label="12th completed in" value={collegeStudentData?.twelfth_year} />
          </>
        );
      case 'working_professional':
        return (
          <>
            <ReviewItem label="12th completed in" value={workingProfessionalData?.twelfth_year} />
            <ReviewItem label="Occupation" value={workingProfessionalData?.occupation} />
          </>
        );
      default:
        return null;
    }
  };

  const Section = ({ title, step, children }: { title: string; step: FormStep; children: React.ReactNode }) => (
    <Card variant="outlined" sx={{ mb: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography variant="subtitle1" fontWeight={600} component="h2">
            {title}
          </Typography>
          <Button
            size="small"
            startIcon={<EditOutlined fontSize="small" />}
            onClick={() => onEditStep(step)}
            aria-label={t('review.edit', { section: title })}
            sx={{ minHeight: 44 }}
          >
            {t('review.editShort')}
          </Button>
        </Box>
        {children}
      </CardContent>
    </Card>
  );

  const legalLink = (tab: number) =>
    function LegalLink(chunks: React.ReactNode) {
      return (
        <Box
          component="button"
          type="button"
          onClick={() => {
            setLegalTab(tab);
            setLegalOpen(true);
          }}
          sx={{ all: 'unset', color: 'text.primary', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', minHeight: 44, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } }}
        >
          {chunks}
        </Box>
      );
    };

  return (
    <Box>
      <StepHeading title={t('review.title')} subtitle={t('review.subtitle')} />

      <MoreDetails />

      <Section title={t('review.aboutYou')} step={0}>
        <ReviewItem label={t('aboutYou.fullName')} value={personal.firstName} />
        <ReviewItem label={t('aboutYou.fatherName')} value={personal.fatherName} />
        <ReviewItem label={t('aboutYou.location')} value={locationLine} />
      </Section>

      <Section title={t('review.yourCourse')} step={1}>
        <ReviewItem label={t('review.course')} value={course.interestCourse ? t(COURSE_KEYS[course.interestCourse]) : null} />
        <ReviewItem label={t('review.programme')} value={course.feeStructureLabel || t('review.notChosen')} />
        <ReviewItem
          label={t('review.mode')}
          value={course.learningMode === 'online_only' ? t('yourCourse.online') : t('yourCourse.hybrid')}
        />
        {course.learningMode === 'hybrid' && course.selectedCenterId && (
          <ReviewItem label={t('review.centre')} value={course.selectedCenterName || course.selectedCenterId} />
        )}
        <Divider sx={{ my: 1.5 }} />
        {categoryLabel && (
          <Box sx={{ mb: 1.5 }}>
            <Chip label={categoryLabel} color="primary" variant="outlined" sx={{ fontWeight: 600 }} />
          </Box>
        )}
        {renderStudies()}
        <ReviewItem label={t('yourCourse.examYear')} value={academic.targetExamYear} />
        <ReviewItem label={t('yourCourse.casteCategory')} value={casteLabel} />
      </Section>

      <Section title={t('review.contact')} step={0}>
        <ReviewItem
          label={t('aboutYou.phone')}
          value={phoneLine}
          trailing={
            personal.phoneVerified ? (
              <Chip label={t('aboutYou.verified')} size="small" color="success" icon={<CheckCircleOutlined />} />
            ) : null
          }
        />
        <ReviewItem label={t('aboutYou.email')} value={personal.email} />
      </Section>

      <Card variant="outlined" sx={{ mb: 2, bgcolor: 'grey.50' }}>
        <CardContent>
          <Stack>
            <FormControlLabel
              control={
                <Checkbox
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  inputProps={{ name: 'termsAccepted' } as React.InputHTMLAttributes<HTMLInputElement>}
                  sx={{ minWidth: 44, minHeight: 44 }}
                />
              }
              label={
                <Typography variant="body2">
                  {t.rich('review.terms', { terms: legalLink(0), refund: legalLink(1) })}
                </Typography>
              }
            />
          </Stack>
        </CardContent>
      </Card>

      <LegalDrawer open={legalOpen} onClose={() => setLegalOpen(false)} initialTab={legalTab} />
    </Box>
  );
}
