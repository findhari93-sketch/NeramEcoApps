'use client';

import { useState } from 'react';
import { Box, Typography, FormControlLabel, Checkbox, Button, TextField } from '@neram/ui';
import EditOutlined from '@mui/icons-material/EditOutlined';
import VerifiedOutlined from '@mui/icons-material/VerifiedOutlined';
import CheckOutlined from '@mui/icons-material/CheckOutlined';
import { useTranslations } from 'next-intl';
import { tokens as tk } from '@/design-system';
import { INPUT_FOCUS_RING } from '../shell/applyTheme';
import StepHeading from '../StepHeading';
import { useFormContext } from '../FormContext';
import type { FormStep } from '../types';
import Field from '../fields/Field';
import Segmented from '../fields/Segmented';
import { getCountryConfig, residenceLabel } from '../countryConfig';
import { inkRuleTopSx, outlineButtonSx } from '../styles';
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

const fieldGridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
  gap: { xs: '20px 16px', md: '16px' },
} as const;

const focusSx = { outline: tk.focusOutline, outlineOffset: '2px' } as const;

interface ReviewItemProps {
  label: string;
  value?: string | number | null;
  trailing?: React.ReactNode;
}

/** One dt/dd pair of a summary group's description list. */
function ReviewItem({ label, value, trailing }: ReviewItemProps) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography component="dt" sx={{ m: 0, fontSize: 13, lineHeight: 1.45, color: tk.inkMuted }}>
        {label}
      </Typography>
      <Typography
        component="dd"
        sx={{ m: 0, mt: 0.25, fontSize: 15, fontWeight: 600, lineHeight: 1.45, color: tk.ink, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', overflowWrap: 'anywhere' }}
      >
        <span>{value}</span>
        {trailing}
      </Typography>
    </Box>
  );
}

interface SummaryGroupProps {
  title: string;
  editLabel: string;
  editShort: string;
  onEdit: () => void;
  children: React.ReactNode;
}

/** A summary group is a rule, not a card: 1px ink rule on top, heading + Edit, then a dl grid. */
function SummaryGroup({ title, editLabel, editShort, onEdit, children }: SummaryGroupProps) {
  return (
    <Box component="section" sx={{ ...inkRuleTopSx, pt: 2, pb: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Typography component="h2" sx={{ m: 0, fontSize: 17, fontWeight: 700, lineHeight: 1.35, color: tk.ink }}>
          {title}
        </Typography>
        <Button
          variant="outlined"
          startIcon={<EditOutlined sx={{ fontSize: '18px !important' }} />}
          onClick={onEdit}
          aria-label={editLabel}
          sx={{ ...outlineButtonSx, px: 1.5, flexShrink: 0 }}
        >
          {editShort}
        </Button>
      </Box>
      <Box
        component="dl"
        sx={{ m: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '12px 24px' }}
      >
        {children}
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
    <Box component="section" aria-labelledby="apply-more-details" sx={{ mb: 4, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box>
        <Typography id="apply-more-details" component="h2" sx={{ m: 0, fontSize: 22, fontWeight: 800, lineHeight: 1.25, color: tk.ink }}>
          {t('review.moreDetails')}
        </Typography>
        <Typography component="p" sx={{ m: 0, mt: 0.75, fontSize: 15, lineHeight: 1.5, color: tk.inkMuted }}>
          {t('review.moreDetailsBody')}
        </Typography>
      </Box>

      <Box sx={fieldGridSx}>
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

        <Field id="apply-parent-phone" label={t('aboutYou.parentPhone')}>
          {/* One 48px bordered group: the country code segment, then the input. */}
          <Box
            sx={{
              display: 'flex',
              height: { xs: 48, md: 46 },
              boxSizing: 'border-box',
              border: `1px solid ${tk.lineStrong}`,
              borderRadius: `${tk.radius}px`,
              bgcolor: tk.surface,
              overflow: 'hidden',
              '&:hover': { borderColor: tk.inkMuted },
              '&:focus-within': { borderColor: tk.navy900, boxShadow: INPUT_FOCUS_RING },
              '& .MuiOutlinedInput-root': { height: '100%', borderRadius: 0, bgcolor: 'transparent' },
              '& .MuiOutlinedInput-root.Mui-focused': { boxShadow: 'none' },
              '& .MuiOutlinedInput-notchedOutline': { border: 0 },
            }}
          >
            <Box
              component="span"
              aria-hidden
              sx={{
                flex: 'none',
                minWidth: 56,
                px: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRight: `1px solid ${tk.line}`,
                bgcolor: tk.ground,
                fontSize: 16,
                fontWeight: 700,
                color: tk.ink,
              }}
            >
              {phoneConfig.phonePrefix}
            </Box>
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
              inputProps={{
                inputMode: 'numeric',
                pattern: '[0-9]*',
                maxLength: phoneConfig.phoneLength,
                name: 'parentPhone',
                autoComplete: 'tel-national',
              }}
            />
          </Box>
        </Field>
      </Box>

      <Box sx={{ maxWidth: 420, '& .MuiToggleButtonGroup-root': { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' } }}>
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
      </Box>

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
        />
      </Field>
    </Box>
  );
}

/** The 24px terms box: 2px lineStrong, radius 4; checked = navy fill with a paper check. */
const termsBoxSx = {
  width: 24,
  height: 24,
  boxSizing: 'border-box',
  borderRadius: '4px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
} as const;

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

  const group = (title: string, step: FormStep) => ({
    title,
    editLabel: t('review.edit', { section: title }),
    editShort: t('review.editShort'),
    onEdit: () => onEditStep(step),
  });

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
          sx={{
            all: 'unset',
            color: tk.ink,
            fontWeight: 600,
            textDecoration: 'underline',
            textUnderlineOffset: '3px',
            cursor: 'pointer',
            // A taller tap area (44px) that does not push the sentence's line box apart.
            display: 'inline-block',
            py: '10px',
            my: '-10px',
            '&:hover': { color: tk.gold800 },
            '&:focus-visible': focusSx,
          }}
        >
          {chunks}
        </Box>
      );
    };

  return (
    <Box>
      <StepHeading title={t('review.title')} subtitle={t('review.subtitle')} />

      <MoreDetails />

      <SummaryGroup {...group(t('review.aboutYou'), 0)}>
        <ReviewItem label={t('aboutYou.fullName')} value={personal.firstName} />
        <ReviewItem label={t('aboutYou.fatherName')} value={personal.fatherName} />
        <ReviewItem label={t('aboutYou.location')} value={locationLine} />
      </SummaryGroup>

      <SummaryGroup {...group(t('review.yourCourse'), 1)}>
        <ReviewItem label={t('review.course')} value={course.interestCourse ? t(COURSE_KEYS[course.interestCourse]) : null} />
        <ReviewItem label={t('review.programme')} value={course.feeStructureLabel || t('review.notChosen')} />
        <ReviewItem
          label={t('review.mode')}
          value={course.learningMode === 'online_only' ? t('yourCourse.online') : t('yourCourse.hybrid')}
        />
        {course.learningMode === 'hybrid' && course.selectedCenterId && (
          <ReviewItem label={t('review.centre')} value={course.selectedCenterName || course.selectedCenterId} />
        )}
        <ReviewItem label={t('yourCourse.studiesTitle')} value={categoryLabel} />
        {renderStudies()}
        <ReviewItem label={t('yourCourse.examYear')} value={academic.targetExamYear} />
        <ReviewItem label={t('yourCourse.casteCategory')} value={casteLabel} />
      </SummaryGroup>

      <SummaryGroup {...group(t('review.contact'), 0)}>
        <ReviewItem
          label={t('aboutYou.phone')}
          value={phoneLine}
          trailing={
            personal.phoneVerified ? (
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 12, fontWeight: 700, color: tk.success }}>
                <VerifiedOutlined aria-hidden sx={{ fontSize: 16 }} />
                {t('aboutYou.verified')}
              </Box>
            ) : null
          }
        />
        <ReviewItem label={t('aboutYou.email')} value={personal.email} />
      </SummaryGroup>

      <Box sx={{ mt: 1, bgcolor: tk.ground, border: `1px solid ${tk.line}`, borderRadius: `${tk.radius}px`, px: 2.5, py: 2 }}>
        <FormControlLabel
          sx={{ m: 0, width: '100%', alignItems: 'flex-start', gap: '14px' }}
          control={
            <Checkbox
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              inputProps={{ name: 'termsAccepted' } as React.InputHTMLAttributes<HTMLInputElement>}
              icon={<Box component="span" sx={{ ...termsBoxSx, border: `2px solid ${tk.lineStrong}`, bgcolor: tk.surface }} />}
              checkedIcon={
                <Box component="span" sx={{ ...termsBoxSx, bgcolor: tk.navy900, color: tk.paper }}>
                  <CheckOutlined sx={{ fontSize: 18 }} />
                </Box>
              }
              sx={{
                p: 0,
                mt: '1px',
                flexShrink: 0,
                borderRadius: '4px',
                '&.Mui-focusVisible': focusSx,
                '&:hover': { bgcolor: 'transparent' },
              }}
            />
          }
          label={
            <Typography component="span" sx={{ display: 'block', fontSize: 15, lineHeight: 1.6, color: tk.ink }}>
              {t.rich('review.terms', { terms: legalLink(0), refund: legalLink(1) })}
            </Typography>
          }
        />
      </Box>

      <LegalDrawer open={legalOpen} onClose={() => setLegalOpen(false)} initialTab={legalTab} />
    </Box>
  );
}
