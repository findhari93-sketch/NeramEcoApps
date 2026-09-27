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
  Stack,
} from '@neram/ui';
import EditOutlined from '@mui/icons-material/EditOutlined';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import { useTranslations } from 'next-intl';
import { useFormContext } from '../FormContext';
import type { FormStep } from '../types';
import { APPLICANT_CATEGORY_OPTIONS, CASTE_CATEGORY_OPTIONS, SCHOOL_TYPE_OPTIONS } from '@neram/database';
import LegalDrawer from '@/components/legal/LegalDrawer';

const COURSE_KEYS: Record<string, string> = {
  nata: 'yourCourse.nata',
  jee_paper2: 'yourCourse.jee',
  both: 'yourCourse.both',
  not_sure: 'yourCourse.notSure',
};

const GENDER_KEYS: Record<string, string> = {
  male: 'aboutYou.genderMale',
  female: 'aboutYou.genderFemale',
  other: 'aboutYou.genderOther',
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
 * Step 3, Review: three groups (About you, Your course, Contact), each with
 * one Edit that returns to the step that owns it, then the terms. What
 * happens next belongs to the pay step, so no delivery promises here.
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

  const dob = personal.dateOfBirth
    ? new Date(personal.dateOfBirth).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const locationLine = [location.city, location.state, location.country === 'IN' ? 'India' : location.country]
    .filter(Boolean)
    .join(', ');

  const renderStudies = () => {
    const { applicantCategory, schoolStudentData, diplomaStudentData, collegeStudentData, workingProfessionalData } = academic;
    switch (applicantCategory) {
      case 'school_student':
        return (
          <>
            <ReviewItem label="Class" value={schoolStudentData?.current_class} />
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
          sx={{ all: 'unset', color: 'primary.main', textDecoration: 'underline', cursor: 'pointer', minHeight: 44 }}
        >
          {chunks}
        </Box>
      );
    };

  return (
    <Box>
      <Typography variant="h5" component="h1" gutterBottom fontWeight={700}>
        {t('review.title')}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        {t('review.subtitle')}
      </Typography>

      <Section title={t('review.aboutYou')} step={0}>
        <ReviewItem label={t('aboutYou.studentName')} value={personal.firstName} />
        <ReviewItem label={t('aboutYou.fatherName')} value={personal.fatherName} />
        <ReviewItem label={t('aboutYou.dateOfBirth')} value={dob} />
        <ReviewItem label={t('aboutYou.gender')} value={personal.gender ? t(GENDER_KEYS[personal.gender]) : null} />
        <ReviewItem
          label={t('aboutYou.location')}
          value={locationLine}
          trailing={location.pincode ? <Typography variant="caption" color="text.secondary">PIN {location.pincode}</Typography> : null}
        />
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
          value={personal.phone}
          trailing={
            personal.phoneVerified ? (
              <Chip label={t('aboutYou.verified')} size="small" color="success" icon={<CheckCircleOutlined />} />
            ) : null
          }
        />
        <ReviewItem label={t('aboutYou.parentPhone')} value={personal.parentPhone} />
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
