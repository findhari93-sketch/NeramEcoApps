'use client';

import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Divider,
  Chip,
  FormControlLabel,
  Checkbox,
  Button,
  Alert,
  IconButton,
} from '@neram/ui';
import {
  PersonOutlined,
  SchoolOutlined,
  MenuBookOutlined,
  EditOutlined,
  CheckCircleOutlined,
  LocationOnOutlined,
  PhoneOutlined,
  EmailOutlined,
  CalendarTodayOutlined,
} from '@mui/icons-material';
import { useFormContext } from '../FormContext';
import { APPLICANT_CATEGORY_OPTIONS, CASTE_CATEGORY_OPTIONS } from '@neram/database';
import Link from 'next/link';

// Course type labels
const COURSE_LABELS: Record<string, string> = {
  nata: 'NATA',
  jee_paper2: 'JEE Paper 2',
  both: 'Both NATA & JEE Paper 2',
};

// Gender labels
const GENDER_LABELS: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  prefer_not_to_say: 'Prefer not to say',
};

interface ReviewSectionProps {
  title: string;
  icon: React.ReactNode;
  stepIndex: number;
  onEdit: (step: number) => void;
  children: React.ReactNode;
}

function ReviewSection({ title, icon, stepIndex, onEdit, children }: ReviewSectionProps) {
  return (
    <Card variant="outlined" sx={{ mb: 2 }}>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Box display="flex" alignItems="center" gap={1}>
            {icon}
            <Typography variant="subtitle1" fontWeight={600}>
              {title}
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => onEdit(stepIndex)} aria-label={`Edit ${title}`}>
            <EditOutlined fontSize="small" />
          </IconButton>
        </Box>
        {children}
      </CardContent>
    </Card>
  );
}

interface ReviewItemProps {
  label: string;
  value?: string | number | null;
  icon?: React.ReactNode;
}

function ReviewItem({ label, value, icon }: ReviewItemProps) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <Box display="flex" alignItems="flex-start" gap={1} mb={1}>
      {icon && <Box sx={{ color: 'text.secondary', mt: 0.25 }}>{icon}</Box>}
      <Box>
        <Typography variant="caption" color="text.secondary" display="block">
          {label}
        </Typography>
        <Typography variant="body2">{value}</Typography>
      </Box>
    </Box>
  );
}

interface ReviewStepProps {
  onEditStep: (step: number) => void;
}

export default function ReviewStep({ onEditStep }: ReviewStepProps) {
  const { formData, setTermsAccepted } = useFormContext();
  const { personal, location, academic, course, termsAccepted } = formData;

  // Get category label
  const getCategoryLabel = () => {
    const category = APPLICANT_CATEGORY_OPTIONS.find(
      (opt) => opt.value === academic.applicantCategory
    );
    return category?.label || academic.applicantCategory || 'Not selected';
  };

  // Get caste category label
  const getCasteCategoryLabel = () => {
    const caste = CASTE_CATEGORY_OPTIONS.find((opt) => opt.value === academic.casteCategory);
    return caste?.label || academic.casteCategory || '';
  };

  // Format date of birth
  const formatDob = () => {
    if (!personal.dateOfBirth) return null;
    return new Date(personal.dateOfBirth).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  // Get academic details based on category
  const renderAcademicDetails = () => {
    const { applicantCategory, schoolStudentData, diplomaStudentData, collegeStudentData, workingProfessionalData } =
      academic;

    switch (applicantCategory) {
      case 'school_student':
        return (
          <>
            <ReviewItem label="Current Class" value={schoolStudentData?.current_class} />
            <ReviewItem label="School Name" value={schoolStudentData?.school_name} />
            <ReviewItem label="Board" value={schoolStudentData?.board} />
            {schoolStudentData?.previous_year_percentage && (
              <ReviewItem
                label="Previous Year Percentage"
                value={`${schoolStudentData.previous_year_percentage}%`}
              />
            )}
          </>
        );

      case 'diploma_student':
        return (
          <>
            <ReviewItem label="College Name" value={diplomaStudentData?.college_name} />
            <ReviewItem label="Department" value={diplomaStudentData?.department} />
            <ReviewItem
              label="Completed Grade Before Diploma"
              value={diplomaStudentData?.completed_grade === '10th' ? '10th Standard' : '12th Standard'}
            />
            {diplomaStudentData?.marks_percentage && (
              <ReviewItem label="Marks/Percentage" value={`${diplomaStudentData.marks_percentage}%`} />
            )}
          </>
        );

      case 'college_student':
        return (
          <>
            <ReviewItem label="College Name" value={collegeStudentData?.college_name} />
            <ReviewItem label="Department" value={collegeStudentData?.department} />
            <ReviewItem label="Year of Study" value={collegeStudentData?.year_of_study ? `${collegeStudentData.year_of_study} Year` : null} />
            <ReviewItem label="12th Completed Year" value={collegeStudentData?.twelfth_year} />
            {collegeStudentData?.twelfth_percentage && (
              <ReviewItem label="12th Percentage" value={`${collegeStudentData.twelfth_percentage}%`} />
            )}
            <ReviewItem label="Reason for Exam" value={collegeStudentData?.reason_for_exam} />
          </>
        );

      case 'working_professional':
        return (
          <>
            <ReviewItem label="12th Completed Year" value={workingProfessionalData?.twelfth_year} />
            <ReviewItem label="Occupation" value={workingProfessionalData?.occupation} />
          </>
        );

      default:
        return null;
    }
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom fontWeight={600}>
        Review Your Application
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Please review all the information before submitting. Click the edit icon to make changes.
      </Typography>

      {/* Personal Information */}
      <ReviewSection
        title="Personal Information"
        icon={<PersonOutlined color="primary" />}
        stepIndex={0}
        onEdit={onEditStep}
      >
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <ReviewItem label="First Name" value={personal.firstName} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <ReviewItem label="Father's Name" value={personal.fatherName} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <ReviewItem
              label="Email"
              value={personal.email}
              icon={<EmailOutlined fontSize="small" />}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Box display="flex" alignItems="center" gap={1}>
              <ReviewItem
                label="Phone"
                value={personal.phone}
                icon={<PhoneOutlined fontSize="small" />}
              />
              {personal.phoneVerified && (
                <Chip
                  label="Verified"
                  size="small"
                  color="success"
                  icon={<CheckCircleOutlined />}
                  sx={{ ml: 1 }}
                />
              )}
            </Box>
          </Grid>
          <Grid item xs={12} sm={6}>
            <ReviewItem
              label="Date of Birth"
              value={formatDob()}
              icon={<CalendarTodayOutlined fontSize="small" />}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <ReviewItem label="Gender" value={GENDER_LABELS[personal.gender || ''] || null} />
          </Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />

        <Box display="flex" alignItems="flex-start" gap={1}>
          <LocationOnOutlined color="action" sx={{ mt: 0.25 }} />
          <Box>
            <Typography variant="caption" color="text.secondary" display="block">
              Location
            </Typography>
            <Typography variant="body2">
              {[location.city, location.state, location.country === 'IN' ? 'India' : location.country].filter(Boolean).join(', ')}
            </Typography>
            {location.pincode && (
              <Typography variant="caption" color="text.secondary">
                PIN: {location.pincode}
              </Typography>
            )}
          </Box>
        </Box>
      </ReviewSection>

      {/* Academic Details */}
      <ReviewSection
        title="Academic Details"
        icon={<SchoolOutlined color="primary" />}
        stepIndex={1}
        onEdit={onEditStep}
      >
        <Box mb={2}>
          <Chip
            label={getCategoryLabel()}
            color="primary"
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
        </Box>

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            {renderAcademicDetails()}
          </Grid>
          <Grid item xs={12} sm={6}>
            <ReviewItem label="Caste Category" value={getCasteCategoryLabel()} />
            <ReviewItem label="Target Exam Year" value={academic.targetExamYear} />
          </Grid>
        </Grid>
      </ReviewSection>

      {/* Course Selection */}
      <ReviewSection
        title="Course Selection"
        icon={<MenuBookOutlined color="primary" />}
        stepIndex={2}
        onEdit={onEditStep}
      >
        <Box mb={2}>
          <Typography variant="body2" fontWeight={600}>
            Selected Course
          </Typography>
          <Typography variant="h6" color="primary.main">
            {COURSE_LABELS[course.interestCourse || ''] || 'Not selected'}
          </Typography>
        </Box>

        {course.hybridLearningAccepted && (
          <Chip
            label="Hybrid Learning Accepted"
            color="success"
            size="small"
            icon={<CheckCircleOutlined />}
            sx={{ mb: 2 }}
          />
        )}

        {course.selectedCenterId && (
          <Box>
            <Typography variant="body2" color="text.secondary">
              Preferred Offline Center Selected
            </Typography>
          </Box>
        )}
      </ReviewSection>

      {/* Phone Verification Warning */}
      {!personal.phoneVerified && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="body2" fontWeight={600}>
            Phone Not Verified
          </Typography>
          <Typography variant="body2">
            Please go back to Step 1 and verify your phone number to submit your application.
          </Typography>
          <Button
            variant="outlined"
            size="small"
            sx={{ mt: 1 }}
            onClick={() => onEditStep(0)}
          >
            Go to Personal Info
          </Button>
        </Alert>
      )}

      {/* Terms and Conditions */}
      <Card variant="outlined" sx={{ mb: 3, bgcolor: 'grey.50' }}>
        <CardContent>
          <FormControlLabel
            control={
              <Checkbox
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
              />
            }
            label={
              <Typography variant="body2">
                I confirm that all the information provided is accurate and I agree to the{' '}
                <Link href="/terms" target="_blank" style={{ color: 'inherit' }}>
                  Terms & Conditions
                </Link>{' '}
                and{' '}
                <Link href="/privacy" target="_blank" style={{ color: 'inherit' }}>
                  Privacy Policy
                </Link>
                .
              </Typography>
            }
          />
        </CardContent>
      </Card>

      {/* Submission Info */}
      <Alert severity="info" icon={false}>
        <Typography variant="body2">
          <strong>What happens next?</strong>
        </Typography>
        <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
          <li>You will receive a confirmation email with your application number</li>
          <li>Our team will review your application within 24-48 hours</li>
          <li>You will be notified about the next steps via email and SMS</li>
          <li>You can track your application status in your dashboard</li>
        </ul>
      </Alert>
    </Box>
  );
}
