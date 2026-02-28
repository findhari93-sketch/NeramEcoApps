'use client';

import { Box, Chip, Divider, Paper, Typography } from '@neram/ui';
import PersonIcon from '@mui/icons-material/Person';
import SchoolIcon from '@mui/icons-material/School';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import type { UserJourneyDetail, AcademicData, SchoolStudentAcademicData, DiplomaStudentAcademicData, CollegeStudentAcademicData, WorkingProfessionalAcademicData, ApplicantCategory } from '@neram/database';
import { EDUCATION_BOARD_OPTIONS, SCHOOL_TYPE_OPTIONS } from '@neram/database';

interface UserProfileSectionProps {
  detail: UserJourneyDetail;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: 'flex',
        py: 0.75,
        px: 1.5,
        minHeight: 34,
        borderRadius: 1,
        '&:hover': { bgcolor: 'grey.50' },
        transition: 'background-color 0.15s',
      }}
    >
      <Typography
        variant="body2"
        sx={{ width: 150, flexShrink: 0, color: 'text.secondary', fontSize: 13, fontWeight: 500 }}
      >
        {label}
      </Typography>
      <Typography variant="body2" component="div" sx={{ flex: 1, fontSize: 13 }}>
        {value || <span style={{ color: '#bdbdbd' }}>--</span>}
      </Typography>
    </Box>
  );
}

function SectionLabel({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, mt: 0.5 }}>
      <Icon sx={{ fontSize: 16, color: 'primary.main' }} />
      <Typography
        variant="overline"
        sx={{ fontWeight: 700, letterSpacing: 1, color: 'text.secondary', fontSize: 10.5 }}
      >
        {label}
      </Typography>
    </Box>
  );
}

function getBoardLabel(code: string): string {
  const board = EDUCATION_BOARD_OPTIONS.find((b) => b.code === code);
  return board ? board.name : code;
}

function getSchoolTypeLabel(value: string): string {
  const st = SCHOOL_TYPE_OPTIONS.find((s) => s.value === value);
  return st ? st.label : value;
}

function renderAcademicData(data: AcademicData, category: ApplicantCategory | null) {
  switch (category) {
    case 'school_student': {
      const d = data as unknown as SchoolStudentAcademicData;
      return (
        <>
          {d.board && <InfoRow label="Board" value={getBoardLabel(d.board)} />}
          {d.school_name && <InfoRow label="School Name" value={d.school_name} />}
          {d.current_class && <InfoRow label="Current Class" value={`Class ${d.current_class}`} />}
          {d.school_type && <InfoRow label="School Type" value={getSchoolTypeLabel(d.school_type)} />}
          {d.previous_percentage != null && <InfoRow label="Previous Year %" value={`${d.previous_percentage}%`} />}
        </>
      );
    }
    case 'diploma_student': {
      const d = data as unknown as DiplomaStudentAcademicData;
      return (
        <>
          {d.college_name && <InfoRow label="College Name" value={d.college_name} />}
          {d.department && <InfoRow label="Department" value={d.department} />}
          {d.completed_grade && <InfoRow label="Completed Grade" value={d.completed_grade === '10th' ? '10th Standard' : '12th Standard'} />}
          {d.marks != null && <InfoRow label="Marks" value={`${d.marks}%`} />}
        </>
      );
    }
    case 'college_student': {
      const d = data as unknown as CollegeStudentAcademicData;
      return (
        <>
          {d.college_name && <InfoRow label="College Name" value={d.college_name} />}
          {d.department && <InfoRow label="Department" value={d.department} />}
          {d.year_of_study && <InfoRow label="Year of Study" value={`${d.year_of_study} Year`} />}
          {d.twelfth_year && <InfoRow label="12th Completed Year" value={d.twelfth_year} />}
          {d.twelfth_percentage != null && <InfoRow label="12th Percentage" value={`${d.twelfth_percentage}%`} />}
          {d.reason_for_exam && <InfoRow label="Reason for Exam" value={d.reason_for_exam} />}
        </>
      );
    }
    case 'working_professional': {
      const d = data as unknown as WorkingProfessionalAcademicData;
      return (
        <>
          {d.twelfth_year && <InfoRow label="12th Completed Year" value={d.twelfth_year} />}
          {d.occupation && <InfoRow label="Occupation" value={d.occupation} />}
          {d.company && <InfoRow label="Company" value={d.company} />}
        </>
      );
    }
    default: {
      const entries = Object.entries(data as unknown as Record<string, unknown>);
      return (
        <>
          {entries.map(([key, val]) =>
            val != null ? (
              <InfoRow key={key} label={key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} value={String(val)} />
            ) : null
          )}
        </>
      );
    }
  }
}

export default function UserProfileSection({ detail }: UserProfileSectionProps) {
  const { user, leadProfile } = detail;

  return (
    <Paper
      elevation={0}
      sx={{
        mb: 3,
        border: '1px solid',
        borderColor: 'grey.200',
        borderRadius: 1,
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          px: 3, py: 2,
          display: 'flex', alignItems: 'center', gap: 1,
          borderBottom: '1px solid', borderColor: 'grey.100', bgcolor: 'grey.50',
        }}
      >
        <PersonIcon sx={{ color: 'primary.main', fontSize: 20 }} />
        <Typography variant="subtitle1" fontWeight={700}>Profile Information</Typography>
      </Box>

      <Box sx={{ p: 2.5 }}>
        <SectionLabel icon={PersonIcon} label="Personal Details" />
        <InfoRow label="Full Name" value={user.name} />
        <InfoRow label="First Name" value={user.first_name} />
        <InfoRow label="Last Name" value={user.last_name} />
        <InfoRow label="Email" value={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {user.email || '--'}
            {user.email_verified && (
              <Chip label="Verified" size="small" sx={{ height: 20, fontSize: 10, fontWeight: 600, bgcolor: '#4CAF5014', color: '#2E7D32', borderRadius: 1 }} />
            )}
          </Box>
        } />
        <InfoRow label="Phone" value={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{user.phone || '--'}</span>
            {user.phone_verified && (
              <Chip label="Verified" size="small" sx={{ height: 20, fontSize: 10, fontWeight: 600, bgcolor: '#4CAF5014', color: '#2E7D32', borderRadius: 1 }} />
            )}
          </Box>
        } />
        <InfoRow label="Date of Birth" value={user.date_of_birth} />
        <InfoRow label="Gender" value={user.gender ? <span style={{ textTransform: 'capitalize' }}>{user.gender.replace(/_/g, ' ')}</span> : null} />
        <InfoRow label="Language" value={user.preferred_language?.toUpperCase()} />

        {leadProfile && (
          <>
            <Divider sx={{ my: 2 }} />
            <SectionLabel icon={SchoolIcon} label="Academic Details" />
            <InfoRow label="Father's Name" value={leadProfile.father_name} />
            <InfoRow label="Category" value={leadProfile.applicant_category ? <span style={{ textTransform: 'capitalize' }}>{leadProfile.applicant_category.replace(/_/g, ' ')}</span> : null} />
            <InfoRow label="Caste Category" value={leadProfile.caste_category?.toUpperCase()} />
            <InfoRow label="Target Exam Year" value={leadProfile.target_exam_year} />
            {leadProfile.academic_data && renderAcademicData(
              leadProfile.academic_data,
              leadProfile.applicant_category
            )}

            <Divider sx={{ my: 2 }} />
            <SectionLabel icon={LocationOnIcon} label="Location" />
            <InfoRow label="Address" value={leadProfile.address} />
            <InfoRow label="City" value={leadProfile.city} />
            <InfoRow label="District" value={leadProfile.district} />
            <InfoRow label="State" value={leadProfile.state} />
            <InfoRow label="Pincode" value={leadProfile.pincode} />
            <InfoRow label="Country" value={leadProfile.country} />
          </>
        )}
      </Box>
    </Paper>
  );
}
