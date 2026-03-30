'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Button, Paper, Typography, TextField, MenuItem, Alert,
  Stepper, Step, StepLabel, CircularProgress, Divider, Chip,
} from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useRouter } from 'next/navigation';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

const STEPS = ['Personal', 'Academic', 'Location', 'Fee Status'];

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

// Generate academic year options: current year and next 3 years in "YYYY-YY" format
const generateAcademicYears = () => {
  const now = new Date();
  const currentMonth = now.getMonth(); // 0-indexed
  const currentYear = now.getFullYear();
  // Academic year runs June-June. If before June, start from previous year
  const startYear = currentMonth < 5 ? currentYear - 1 : currentYear;
  return Array.from({ length: 4 }, (_, i) => {
    const yr = startYear + i;
    return { value: yr.toString(), label: `${yr}-${String(yr + 1).slice(2)}` };
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

interface FeeData {
  feeSummary: { total_fee: number; fee_paid: number; fee_due: number } | null;
  payments: any[];
}

export default function CompleteProfilePage() {
  const router = useRouter();
  const { getToken, loading: authLoading, isProfileComplete, refreshOnboardingStatus } = useNexusAuthContext();
  const isMandatory = !isProfileComplete;
  const [activeStep, setActiveStep] = useState(0);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [feeData, setFeeData] = useState<FeeData | null>(null);
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

  // Fee report state
  const [reportAmount, setReportAmount] = useState('');
  const [reportNotes, setReportNotes] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [reportingPayment, setReportingPayment] = useState(false);

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

  const fetchFees = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch('/api/student/fee-report', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      setFeeData(await res.json());
    } catch { /* ignore */ }
  }, [getToken]);

  useEffect(() => {
    if (!authLoading) {
      fetchProfile();
      fetchFees();
    }
  }, [authLoading, fetchProfile, fetchFees]);

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

  const handleReportPayment = async () => {
    if (!reportAmount || parseFloat(reportAmount) <= 0) {
      setError('Enter a valid amount');
      return;
    }
    setReportingPayment(true);
    setError('');
    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append('amount', reportAmount);
      if (reportNotes) formData.append('notes', reportNotes);
      if (proofFile) formData.append('proof', proofFile);

      const res = await fetch('/api/student/fee-report', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to report payment');
      }

      setSuccess('Payment reported! Admin will verify it shortly.');
      setReportAmount('');
      setReportNotes('');
      setProofFile(null);
      fetchFees();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setReportingPayment(false);
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
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField label="City" value={city} onChange={(e) => setCity(e.target.value)} fullWidth size="small" />
              <TextField label="District" value={district} onChange={(e) => setDistrict(e.target.value)} fullWidth size="small" />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField label="State" value={state} onChange={(e) => setState(e.target.value)} fullWidth size="small" />
              <TextField label="Pincode" value={pincode} onChange={(e) => setPincode(e.target.value)} fullWidth size="small" inputProps={{ maxLength: 6 }} />
            </Box>
          </Box>
        )}

        {/* Step 3: Fee Status */}
        {activeStep === 3 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="subtitle2" fontWeight={700}>Fee Status</Typography>

            {feeData?.feeSummary ? (
              <Box sx={{ display: 'flex', gap: 2, mb: 1 }}>
                <Paper variant="outlined" sx={{ flex: 1, p: 2, textAlign: 'center', borderRadius: 2 }}>
                  <Typography variant="caption" color="text.secondary">Total Fee</Typography>
                  <Typography variant="h6" fontWeight={700}>{'\u20B9'}{feeData.feeSummary.total_fee.toLocaleString('en-IN')}</Typography>
                </Paper>
                <Paper variant="outlined" sx={{ flex: 1, p: 2, textAlign: 'center', borderRadius: 2 }}>
                  <Typography variant="caption" color="text.secondary">Paid</Typography>
                  <Typography variant="h6" fontWeight={700} color="success.main">{'\u20B9'}{feeData.feeSummary.fee_paid.toLocaleString('en-IN')}</Typography>
                </Paper>
                <Paper variant="outlined" sx={{ flex: 1, p: 2, textAlign: 'center', borderRadius: 2 }}>
                  <Typography variant="caption" color="text.secondary">Due</Typography>
                  <Typography variant="h6" fontWeight={700} color={feeData.feeSummary.fee_due > 0 ? 'error.main' : 'text.primary'}>
                    {'\u20B9'}{feeData.feeSummary.fee_due.toLocaleString('en-IN')}
                  </Typography>
                </Paper>
              </Box>
            ) : (
              <Alert severity="info" sx={{ borderRadius: 1.5 }}>
                Fee details will be updated by admin. Check back later.
              </Alert>
            )}

            {/* Report Payment */}
            {feeData?.feeSummary && feeData.feeSummary.fee_due > 0 && (
              <>
                <Divider sx={{ my: 1 }} />
                <Typography variant="subtitle2" fontWeight={600}>Report a Payment</Typography>
                <TextField
                  label="Amount Paid (\u20B9)" type="number" value={reportAmount}
                  onChange={(e) => setReportAmount(e.target.value)}
                  fullWidth size="small"
                />
                <TextField
                  label="Notes (optional)" value={reportNotes}
                  onChange={(e) => setReportNotes(e.target.value)}
                  fullWidth size="small" placeholder="e.g. UPI transaction ID, bank reference"
                />
                <Button
                  variant="outlined"
                  component="label"
                  startIcon={<CloudUploadIcon />}
                  sx={{ textTransform: 'none', borderRadius: 1.5 }}
                >
                  {proofFile ? proofFile.name : 'Upload Payment Proof'}
                  <input
                    type="file"
                    hidden
                    accept="image/*,.pdf"
                    onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                  />
                </Button>
                <Button
                  variant="contained"
                  onClick={handleReportPayment}
                  disabled={reportingPayment || !reportAmount}
                  sx={{ textTransform: 'none', borderRadius: 1.5, fontWeight: 600 }}
                >
                  {reportingPayment ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
                  Submit Payment Report
                </Button>
              </>
            )}

            {/* Payment History */}
            {feeData?.payments && feeData.payments.length > 0 && (
              <>
                <Divider sx={{ my: 1 }} />
                <Typography variant="subtitle2" fontWeight={600}>Payment History</Typography>
                {feeData.payments.map((p: any) => (
                  <Box key={p.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'grey.100' }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" fontWeight={600}>{'\u20B9'}{p.amount.toLocaleString('en-IN')}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(p.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </Typography>
                    </Box>
                    <Chip
                      label={p.status}
                      size="small"
                      sx={{
                        textTransform: 'capitalize', fontWeight: 600, fontSize: 11,
                        bgcolor: p.status === 'paid' ? '#4CAF5014' : p.status === 'pending' ? '#F57C0014' : '#D32F2F14',
                        color: p.status === 'paid' ? '#2E7D32' : p.status === 'pending' ? '#F57C00' : '#D32F2F',
                      }}
                    />
                  </Box>
                ))}
              </>
            )}
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
            {activeStep < 3 && !isMandatory && (
              <Button
                variant="text"
                onClick={() => { setActiveStep((prev) => prev + 1); setError(''); setSuccess(''); }}
                sx={{ textTransform: 'none' }}
              >
                Skip
              </Button>
            )}
            {activeStep < 3 ? (
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
                onClick={() => { refreshOnboardingStatus(); router.push('/student/dashboard'); }}
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
