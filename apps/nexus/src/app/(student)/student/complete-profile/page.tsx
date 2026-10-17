'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Button, Paper, Typography, Alert,
  Stepper, Step, StepLabel, CircularProgress,
} from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useRouter } from 'next/navigation';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import ProfileDetailsFields, {
  EMPTY_PROFILE_DETAILS,
  lookupPincodePlace,
  profileDetailsFrom,
  profileDetailsUpdates,
  type ProfileDetailsSection,
  type ProfileDetailsValues,
} from '@/components/student/ProfileDetailsFields';

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

/** One section of the shared fields per step. */
const STEP_SECTIONS: ProfileDetailsSection[] = ['personal', 'academic', 'location'];

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

  // Form state: personal, academic and location (components/student/ProfileDetailsFields).
  const [values, setValues] = useState<ProfileDetailsValues>(EMPTY_PROFILE_DETAILS);
  const [pincodeLoading, setPincodeLoading] = useState(false);
  const setField = useCallback((field: keyof ProfileDetailsValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  }, []);

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
      setValues(profileDetailsFrom(data));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const lookupPincode = useCallback(async (code: string) => {
    setPincodeLoading(true);
    const place = await lookupPincodePlace(code);
    if (place) {
      setValues((prev) => ({
        ...prev,
        ...(place.city ? { city: place.city } : {}),
        ...(place.district ? { district: place.district } : {}),
        ...(place.state ? { state: place.state } : {}),
      }));
    }
    setPincodeLoading(false);
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

      if (activeStep === 0 && isMandatory) {
        if (!values.phone || !values.dob || !values.gender) {
          setError('Phone, date of birth, and gender are required.');
          setSaving(false);
          return;
        }
      }
      const { userUpdates, leadUpdates } = profileDetailsUpdates(values, [STEP_SECTIONS[activeStep]]);

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
        {/* One section per step. */}
        <ProfileDetailsFields
          section={STEP_SECTIONS[activeStep]}
          values={values}
          onChange={setField}
          onPincodeComplete={lookupPincode}
          pincodeLoading={pincodeLoading}
          required={isMandatory}
        />

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
