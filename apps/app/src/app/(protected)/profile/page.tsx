'use client';

import {
  Box,
  Typography,
  Paper,
  Grid,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
  useTheme,
  useMediaQuery,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PersonIcon from '@mui/icons-material/Person';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import SchoolIcon from '@mui/icons-material/School';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import AssignmentIcon from '@mui/icons-material/Assignment';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PaymentIcon from '@mui/icons-material/Payment';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail';
import SecurityIcon from '@mui/icons-material/Security';

import { useFullProfile } from './hooks/useFullProfile';
import ProfileHeader from './components/ProfileHeader';
import PersonalInfoSection from './components/PersonalInfoSection';
import LocationSection from './components/LocationSection';
import AcademicSection from './components/AcademicSection';
import CourseSection from './components/CourseSection';
import ApplicationStatusSection from './components/ApplicationStatusSection';
import EnrollmentSection from './components/EnrollmentSection';
import FinancialSection from './components/FinancialSection';
import ScholarshipSection from './components/ScholarshipSection';
import UsernameSection from './components/UsernameSection';
import AccountSection from './components/AccountSection';
import ProfileSkeleton from './components/ProfileSkeleton';

interface SectionConfig {
  id: string;
  title: string;
  icon: React.ReactNode;
  visible: boolean;
  content: React.ReactNode;
  defaultExpanded?: boolean;
}

export default function ProfilePage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const {
    basicProfile,
    basicLoading,
    fullProfile,
    fullLoading,
    isEditing,
    setIsEditing,
    formData,
    setFormData,
    saving,
    error,
    setError,
    success,
    setSuccess,
    handleSave,
    handleCancel,
    handleAvatarUpload,
    handleAvatarRemove,
    username,
    setUsername,
    usernameAvailable,
    setUsernameAvailable,
    usernameSuggestions,
    setUsernameSuggestions,
    checkingUsername,
    checkUsernameAvailability,
    handleSetUsername,
  } = useFullProfile();

  if (basicLoading) return <ProfileSkeleton />;

  const lp = fullProfile?.leadProfile;
  const sp = fullProfile?.studentProfile;
  const hasLocation = lp && (lp.address || lp.city || lp.state || lp.pincode);
  const hasAcademic = lp && (lp.applicant_category || lp.academic_data || lp.caste_category);
  const hasCourse = lp && lp.interest_course;
  const hasAppStatus = lp && lp.status && lp.status !== 'draft';
  const hasFinancial = (lp && lp.final_fee != null) || (fullProfile?.payments && fullProfile.payments.length > 0);
  const hasScholarship = fullProfile?.scholarshipApplication != null;

  // Build sections - only visible sections render
  const sections: SectionConfig[] = [
    {
      id: 'personal',
      title: 'Personal Information',
      icon: <PersonIcon fontSize="small" />,
      visible: true,
      defaultExpanded: true,
      content: (
        <PersonalInfoSection
          profile={basicProfile}
          fatherName={lp?.father_name}
          formData={formData}
          setFormData={setFormData}
          isEditing={isEditing}
          saving={saving}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      ),
    },
    {
      id: 'location',
      title: 'Location & Address',
      icon: <LocationOnIcon fontSize="small" />,
      visible: !!hasLocation,
      content: lp ? <LocationSection leadProfile={lp} /> : null,
    },
    {
      id: 'academic',
      title: 'Academic Background',
      icon: <SchoolIcon fontSize="small" />,
      visible: !!hasAcademic,
      content: lp ? <AcademicSection leadProfile={lp} /> : null,
    },
    {
      id: 'course',
      title: 'Course & Learning',
      icon: <MenuBookIcon fontSize="small" />,
      visible: !!hasCourse,
      content: lp ? (
        <CourseSection
          leadProfile={lp}
          courseName={fullProfile?.courseName || null}
          centerName={fullProfile?.centerName || null}
          centerCity={fullProfile?.centerCity || null}
        />
      ) : null,
    },
    {
      id: 'application',
      title: 'Application Status',
      icon: <AssignmentIcon fontSize="small" />,
      visible: !!hasAppStatus,
      content: lp ? <ApplicationStatusSection leadProfile={lp} /> : null,
    },
    {
      id: 'enrollment',
      title: 'Enrollment & Progress',
      icon: <TrendingUpIcon fontSize="small" />,
      visible: !!sp,
      content: sp ? (
        <EnrollmentSection
          studentProfile={sp}
          courseName={fullProfile?.courseName || null}
          batchName={fullProfile?.batchName || null}
        />
      ) : null,
    },
    {
      id: 'financial',
      title: 'Fees & Payments',
      icon: <PaymentIcon fontSize="small" />,
      visible: !!hasFinancial,
      content: (
        <FinancialSection
          leadProfile={lp || null}
          payments={fullProfile?.payments || []}
          installments={fullProfile?.installments || []}
          courseName={fullProfile?.courseName || null}
          studentName={basicProfile?.name || 'Student'}
        />
      ),
    },
    {
      id: 'scholarship',
      title: 'Scholarship',
      icon: <EmojiEventsIcon fontSize="small" />,
      visible: !!hasScholarship,
      content: fullProfile?.scholarshipApplication ? (
        <ScholarshipSection scholarship={fullProfile.scholarshipApplication} />
      ) : null,
    },
    {
      id: 'username',
      title: 'Username',
      icon: <AlternateEmailIcon fontSize="small" />,
      visible: true,
      content: (
        <UsernameSection
          currentUsername={basicProfile?.username || null}
          username={username}
          setUsername={setUsername}
          usernameAvailable={usernameAvailable}
          setUsernameAvailable={setUsernameAvailable}
          usernameSuggestions={usernameSuggestions}
          setUsernameSuggestions={setUsernameSuggestions}
          checkingUsername={checkingUsername}
          checkUsernameAvailability={checkUsernameAvailability}
          handleSetUsername={handleSetUsername}
          saving={saving}
        />
      ),
    },
  ];

  const visibleSections = sections.filter((s) => s.visible);

  // ─── MOBILE LAYOUT: Accordion ────────────────────
  if (isMobile) {
    return (
      <Box sx={{ pb: 8 }}>
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
          My Profile
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        )}

        {/* Profile Header Card */}
        <Paper sx={{ p: 3, mb: 2 }}>
          <ProfileHeader
            profile={basicProfile as any}
            isEditing={isEditing}
            onToggleEdit={() => (isEditing ? handleCancel() : setIsEditing(true))}
            onAvatarUpload={handleAvatarUpload}
            onAvatarRemove={handleAvatarRemove}
          />
        </Paper>

        {/* Accordion Sections */}
        {visibleSections.map((section) => (
          <Accordion
            key={section.id}
            defaultExpanded={section.defaultExpanded}
            sx={{
              mb: 1,
              '&:before': { display: 'none' },
              borderRadius: '8px !important',
              overflow: 'hidden',
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{ minHeight: 56 }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ color: 'primary.main' }}>{section.icon}</Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {section.title}
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              {section.content}
            </AccordionDetails>
          </Accordion>
        ))}

        {/* Account Section at bottom */}
        {basicProfile && (
          <Paper sx={{ p: 2, mt: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
              <Box sx={{ color: 'primary.main' }}><SecurityIcon fontSize="small" /></Box>
              <Typography variant="subtitle2" fontWeight={600}>
                Account & Security
              </Typography>
            </Box>
            <AccountSection profile={basicProfile as any} />
          </Paper>
        )}
      </Box>
    );
  }

  // ─── DESKTOP LAYOUT: Two Column Grid ─────────────
  return (
    <Box sx={{ pb: 4 }}>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
        My Profile
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Sidebar */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3 }}>
            <ProfileHeader
              profile={basicProfile as any}
              isEditing={isEditing}
              onToggleEdit={() => (isEditing ? handleCancel() : setIsEditing(true))}
              onAvatarUpload={handleAvatarUpload}
              onAvatarRemove={handleAvatarRemove}
            />
          </Paper>

          {/* Account & Security in sidebar */}
          {basicProfile && (
            <Paper sx={{ p: 2, mt: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                <Box sx={{ color: 'primary.main' }}><SecurityIcon fontSize="small" /></Box>
                <Typography variant="subtitle2" fontWeight={600}>
                  Account & Security
                </Typography>
              </Box>
              <AccountSection profile={basicProfile as any} />
            </Paper>
          )}
        </Grid>

        {/* Main Content */}
        <Grid item xs={12} md={8}>
          {visibleSections.map((section) => (
            <Paper key={section.id} sx={{ p: 3, mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                <Box sx={{ color: 'primary.main' }}>{section.icon}</Box>
                <Typography variant="h6">{section.title}</Typography>
              </Box>
              <Divider sx={{ mb: 2.5 }} />
              {section.content}
            </Paper>
          ))}
        </Grid>
      </Grid>
    </Box>
  );
}
