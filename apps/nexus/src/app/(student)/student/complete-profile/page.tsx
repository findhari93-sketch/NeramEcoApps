'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Button, Paper, Typography, TextField, MenuItem, Alert,
  Stepper, Step, StepLabel, CircularProgress,
} from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useRouter } from 'next/navigation';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

/**
 * Money is deliberately absent from this wizard.
 *
 * A student does not know their own fee. It is agreed per student by the office
 * and differs between students, so asking them to confirm or report it invites a
 * wrong number into the only figure every balance in every app derives from.
 * Fees are set by staff in Admin, and read there.
 *
 * These three steps are exactly what the no-login WhatsApp form at /s/<token>
 * collects, so a student who fills in either one produces the same record.
 */
const STEPS = ['Personal', 'Academic', 'Location'];
const LAST_STEP = STEPS.length - 1;

const APPLICANT_CATEGORIES = [
  { value: 'school_student', label: 'School Student' },
  { value: 'diploma_student', label: 'Diploma Student' },
  { value: 'college_student', label: 'College Student' },
  { value: 'working_professional', label: 'Working Professional' },
];

const COURSE_OPTIONS = [
  { value: 'nata', label: 'NATA' },
  { value: 'jee_paper2', label: 'JEE Paper 2' },
  { value: 'both', label: 'Both NATA & JEE' },
  { value: 'not_sure', label: 'Not Sure' },
];

const CASTE_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'obc', label: 'OBC' },
  { value: 'sc', label: 'SC' },
  { value: 'st', label: 'ST' },
  { value: 'ews', label: 'EWS' },
  { value: 'other', label: 'Other' },
];

const SCHOOL_TYPES = [
  { value: 'private_school', label: 'Private School' },
  { value: 'government_aided', label: 'Government Aided' },
  { value: 'government_school', label: 'Government School' },
];

// Exam batch options: this academic year and the next three, shown as "YYYY-YY".
// The VALUE is the calendar year that batch writes the exam (2026-27 writes in 2027),
// because lead_profiles.target_exam_year holds exam years everywhere else. It used to
// hold the batch's start year, so every answer saved here landed one year early.
const generateAcademicYears = () => {
  const now = new Date();
  // The academic year starts in April, as in currentAcademicYear from @neram/database.
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({ length: 4 }, (_, i) => {
    const yr = startYear + i;
    const yy = String((yr + 1) % 100).padStart(2, '0');
    return { value: String(yr + 1), label: `${yr}-${yy} (exam in ${yr + 1})` };
  });
};

const ACADEMIC_YEAR_OPTIONS = generateAcademicYears();

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

interface ProfileData {
  user: any;
  leadProfile: any;
  studentProfile: any;
  missingFields: string[];
  isComplete: boolean;
}

export default function CompleteProfilePage() {
  const router = useRouter();
  const { getToken, loading: authLoading } = useNexusAuthContext();
  // Profile completion is no longer a gate — this page is a fully optional
  // editor students can reach from the dashboard nudge. Nothing is required.
  const isMandatory = false;
  const [activeStep, setActiveStep] = useState(0);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state — personal
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [firstName, setFirstName] = useState('');
  const [fatherName, setFatherName] = useState('');

  // Form state — academic
  const [applicantCategory, setApplicantCategory] = useState('');
  const [interestCourse, setInterestCourse] = useState('');
  const [casteCategory, setCasteCategory] = useState('');
  const [targetExamYear, setTargetExamYear] = useState('');
  const [schoolType, setSchoolType] = useState('');

  // Form state — location
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [pincodeLoading, setPincodeLoading] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch('/api/student/profile-completion', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch profile');
      const data = await res.json();
      setProfileData(data);

      // Populate form from existing data
      setPhone(data.user?.phone || '');
      setDob(data.user?.date_of_birth || '');
      setGender(data.user?.gender || '');
      setFirstName(data.user?.first_name || '');
      setFatherName(data.leadProfile?.father_name || '');
      setApplicantCategory(data.leadProfile?.applicant_category || '');
      setInterestCourse(data.leadProfile?.interest_course || '');
      setCasteCategory(data.leadProfile?.caste_category || '');
      setTargetExamYear(data.leadProfile?.target_exam_year?.toString() || '');
      setSchoolType(data.leadProfile?.school_type || '');
      setAddress(data.leadProfile?.address || '');
      setCity(data.leadProfile?.city || '');
      setDistrict(data.leadProfile?.district || '');
      setState(data.leadProfile?.state || '');
      setPincode(data.leadProfile?.pincode || '');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const lookupPincode = useCallback(async (code: string) => {
    if (!/^\d{6}$/.test(code)) return;
    setPincodeLoading(true);
    try {
      const res = await fetch(`/api/pincode/${code}`);
      const data = await res.json();
      if (data.success && data.data) {
        if (data.data.city) setCity(data.data.city);
        if (data.data.district) setDistrict(data.data.district);
        if (data.data.state) setState(data.data.state);
      }
    } catch {
      // Silently fail — user can still type manually
    } finally {
      setPincodeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading) {
      fetchProfile();
    }
  }, [authLoading, fetchProfile]);

  // Restore last saved step from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('nexus_profile_step');
    if (saved) {
      const step = parseInt(saved, 10);
      // Clamped to the CURRENT step list. A returning student whose device still
      // remembers the old fourth step would otherwise land on a step that no
      // longer renders, and see an empty card with no way forward.
      if (step >= 0 && step <= LAST_STEP) setActiveStep(step);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('nexus_profile_step', activeStep.toString());
  }, [activeStep]);

  const handleSaveStep = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const token = await getToken();

      let userUpdates: Record<string, unknown> = {};
      let leadUpdates: Record<string, unknown> = {};

      if (activeStep === 0) {
        // Personal
        if (isMandatory) {
          if (!phone || !dob || !gender) {
            setError('Phone, date of birth, and gender are required.');
            setSaving(false);
            return;
          }
        }
        userUpdates = { phone: phone || null, date_of_birth: dob || null, gender: gender || null, first_name: firstName || null };
        leadUpdates = { father_name: fatherName || null };
      } else if (activeStep === 1) {
        // Academic
        leadUpdates = {
          applicant_category: applicantCategory || null,
          interest_course: interestCourse || null,
          caste_category: casteCategory || null,
          target_exam_year: targetExamYear ? Number(targetExamYear) : null,
          school_type: schoolType || null,
        };
      } else if (activeStep === 2) {
        // Location
        leadUpdates = {
          address: address || null,
          city: city || null,
          district: district || null,
          state: state || null,
          pincode: pincode || null,
        };
      }

      const res = await fetch('/api/student/profile-completion', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userUpdates, leadUpdates }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      setSuccess('Saved successfully!');
      // Move to next step
      if (activeStep < STEPS.length - 1) {
        setTimeout(() => {
          setActiveStep((prev) => prev + 1);
          setSuccess('');
        }, 800);
      }
      // Refresh profile data
      fetchProfile();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading || authLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 640, mx: 'auto', p: { xs: 2, sm: 3 } }}>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Complete Your Profile
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Please fill in your details so we can serve you better. You can save each section and come back later.
      </Typography>

      {isMandatory && (
        <Paper
          elevation={0}
          sx={{
            p: 2.5,
            mb: 3,
            borderRadius: 2,
            bgcolor: 'primary.50',
            border: '1px solid',
            borderColor: 'primary.100',
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'primary.main', mb: 0.5 }}>
            Almost there!
          </Typography>
          <Typography variant="body2" color="text.secondary">
            We need a few more details to complete your profile. This helps us serve you better and is required to continue.
          </Typography>
        </Paper>
      )}

      <Stepper activeStep={activeStep} sx={{ mb: 3 }} alternativeLabel>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'grey.200', borderRadius: 2, p: 3 }}>
        {/* Step 0: Personal */}
        {activeStep === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="subtitle2" fontWeight={700}>Personal Details</Typography>
            <TextField
              label="Phone Number" value={phone} onChange={(e) => setPhone(e.target.value)}
              fullWidth size="small" placeholder="+91XXXXXXXXXX" required={isMandatory}
              helperText="Your primary contact number (WhatsApp preferred)"
            />
            <TextField
              label="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)}
              fullWidth size="small"
            />
            <TextField
              label="Father's Name" value={fatherName} onChange={(e) => setFatherName(e.target.value)}
              fullWidth size="small"
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Date of Birth" type="date" value={dob} onChange={(e) => setDob(e.target.value)}
                fullWidth size="small" InputLabelProps={{ shrink: true }} required={isMandatory}
              />
              <TextField
                label="Gender" select value={gender} onChange={(e) => setGender(e.target.value)}
                fullWidth size="small" required={isMandatory}
              >
                <MenuItem value="">-- Select --</MenuItem>
                {GENDER_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </TextField>
            </Box>
          </Box>
        )}

        {/* Step 1: Academic */}
        {activeStep === 1 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="subtitle2" fontWeight={700}>Academic Details</Typography>
            <TextField
              label="Applicant Category" select value={applicantCategory}
              onChange={(e) => setApplicantCategory(e.target.value)}
              fullWidth size="small"
            >
              <MenuItem value="">-- Select --</MenuItem>
              {APPLICANT_CATEGORIES.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </TextField>
            <TextField
              label="Course Interest" select value={interestCourse}
              onChange={(e) => setInterestCourse(e.target.value)}
              fullWidth size="small"
            >
              <MenuItem value="">-- Select --</MenuItem>
              {COURSE_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </TextField>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Caste Category" select value={casteCategory}
                onChange={(e) => setCasteCategory(e.target.value)}
                fullWidth size="small"
              >
                <MenuItem value="">-- Select --</MenuItem>
                {CASTE_CATEGORIES.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </TextField>
              <TextField
                label="Target Exam Year" select value={targetExamYear}
                onChange={(e) => setTargetExamYear(e.target.value)}
                fullWidth size="small"
              >
                <MenuItem value="">-- Select --</MenuItem>
                {ACADEMIC_YEAR_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </TextField>
            </Box>
            <TextField
              label="School Type" select value={schoolType}
              onChange={(e) => setSchoolType(e.target.value)}
              fullWidth size="small"
            >
              <MenuItem value="">-- Select --</MenuItem>
              {SCHOOL_TYPES.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </TextField>
          </Box>
        )}

        {/* Step 2: Location */}
        {activeStep === 2 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="subtitle2" fontWeight={700}>Location</Typography>
            <TextField
              label="Address" value={address} onChange={(e) => setAddress(e.target.value)}
              fullWidth size="small" multiline rows={2}
            />
            <TextField
              label="Pincode"
              value={pincode}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                setPincode(val);
                if (val.length === 6) lookupPincode(val);
              }}
              fullWidth size="small"
              inputProps={{ maxLength: 6, inputMode: 'numeric' }}
              helperText={pincodeLoading ? 'Looking up...' : pincode.length === 6 ? 'Auto-filled from pincode' : ''}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField label="City" value={city} onChange={(e) => setCity(e.target.value)} fullWidth size="small" />
              <TextField label="District" value={district} onChange={(e) => setDistrict(e.target.value)} fullWidth size="small" />
            </Box>
            <TextField label="State" value={state} onChange={(e) => setState(e.target.value)} fullWidth size="small" />
          </Box>
        )}

        {/* Save / Navigation */}
        {error && <Alert severity="error" sx={{ mt: 2, borderRadius: 1.5 }}>{error}</Alert>}
        {success && <Alert severity="success" icon={<CheckCircleIcon />} sx={{ mt: 2, borderRadius: 1.5 }}>{success}</Alert>}

        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
          <Button
            disabled={activeStep === 0}
            onClick={() => { setActiveStep((prev) => prev - 1); setError(''); setSuccess(''); }}
            sx={{ textTransform: 'none' }}
          >
            Back
          </Button>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {activeStep < LAST_STEP ? (
              <Button
                variant="contained"
                onClick={handleSaveStep}
                disabled={saving}
                sx={{ textTransform: 'none', borderRadius: 1.5, fontWeight: 600, px: 3 }}
              >
                {saving ? 'Saving...' : 'Save & Next'}
              </Button>
            ) : (
              <Button
                variant="contained"
                startIcon={<ArrowBackIcon />}
                onClick={() => { localStorage.removeItem('nexus_profile_step'); router.push('/student/dashboard'); }}
                sx={{ textTransform: 'none', borderRadius: 1.5, fontWeight: 600, px: 3 }}
              >
                Back to Dashboard
              </Button>
            )}
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
