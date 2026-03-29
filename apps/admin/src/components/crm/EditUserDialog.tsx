'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Alert,
  Typography,
  Tab,
  Tabs,
  Divider,
} from '@neram/ui';
import type { UserJourneyDetail } from '@neram/database';

interface EditUserDialogProps {
  open: boolean;
  onClose: () => void;
  detail: UserJourneyDetail;
  adminId: string;
  onSaved: () => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return value === index ? <Box sx={{ pt: 2 }}>{children}</Box> : null;
}

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

const LEARNING_MODES = [
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'online_only', label: 'Online Only' },
];

const SCHOOL_TYPES = [
  { value: 'private_school', label: 'Private School' },
  { value: 'government_aided', label: 'Government Aided' },
  { value: 'government_school', label: 'Government School' },
];

export default function EditUserDialog({
  open,
  onClose,
  detail,
  adminId,
  onSaved,
}: EditUserDialogProps) {
  const { user, leadProfile, studentProfile } = detail;
  const [tab, setTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // User fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');

  // Lead fields - personal
  const [fatherName, setFatherName] = useState('');

  // Lead fields - academic
  const [applicantCategory, setApplicantCategory] = useState('');
  const [interestCourse, setInterestCourse] = useState('');
  const [casteCategory, setCasteCategory] = useState('');
  const [targetExamYear, setTargetExamYear] = useState('');
  const [learningMode, setLearningMode] = useState('');
  const [schoolType, setSchoolType] = useState('');

  // Lead fields - location
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [district, setDistrict] = useState('');
  const [address, setAddress] = useState('');

  // Lead fields - fee
  const [assignedFee, setAssignedFee] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  // Student profile fees
  const [totalFee, setTotalFee] = useState('');
  const [feePaid, setFeePaid] = useState('');

  useEffect(() => {
    if (open) {
      // Reset UI state
      setTab(0);
      setError('');

      // User fields
      setFirstName(user.first_name || '');
      setLastName(user.last_name || '');
      setName(user.name || '');
      setEmail(user.email || '');
      setPhone(user.phone || '');
      setDob(user.date_of_birth || '');
      setGender(user.gender || '');

      // Lead fields — always reset (prevents stale data from previous user)
      setFatherName(leadProfile?.father_name || '');
      setApplicantCategory(leadProfile?.applicant_category || '');
      setInterestCourse(leadProfile?.interest_course || '');
      setCasteCategory(leadProfile?.caste_category || '');
      setTargetExamYear(leadProfile?.target_exam_year?.toString() || '');
      setLearningMode(leadProfile?.learning_mode || '');
      setSchoolType(leadProfile?.school_type || '');
      setCity(leadProfile?.city || '');
      setState(leadProfile?.state || '');
      setPincode(leadProfile?.pincode || '');
      setDistrict(leadProfile?.district || '');
      setAddress(leadProfile?.address || '');
      setAssignedFee(leadProfile?.assigned_fee?.toString() || '');
      setDiscountAmount(leadProfile?.discount_amount?.toString() || '');
      setAdminNotes(leadProfile?.admin_notes || '');

      // Student profile fees — always reset
      setTotalFee(studentProfile?.total_fee?.toString() || '');
      setFeePaid(studentProfile?.fee_paid?.toString() || '');
    }
  }, [open, user, leadProfile, studentProfile]);

  const handleSave = async () => {
    setSaving(true);
    setError('');

    try {
      const userUpdates: Record<string, unknown> = {};
      if (firstName !== (user.first_name || '')) userUpdates.first_name = firstName || null;
      if (lastName !== (user.last_name || '')) userUpdates.last_name = lastName || null;
      if (name !== (user.name || '')) userUpdates.name = name;
      if (email !== (user.email || '')) userUpdates.email = email || null;
      if (phone !== (user.phone || '')) userUpdates.phone = phone || null;
      if (dob !== (user.date_of_birth || '')) userUpdates.date_of_birth = dob || null;
      if (gender !== (user.gender || '')) userUpdates.gender = gender || null;

      const leadUpdates: Record<string, unknown> = leadProfile ? { profileId: leadProfile.id } : {};
      if (leadProfile) {
        if (fatherName !== (leadProfile.father_name || '')) leadUpdates.father_name = fatherName || null;
        if (applicantCategory !== (leadProfile.applicant_category || '')) leadUpdates.applicant_category = applicantCategory || null;
        if (interestCourse !== (leadProfile.interest_course || '')) leadUpdates.interest_course = interestCourse || null;
        if (casteCategory !== (leadProfile.caste_category || '')) leadUpdates.caste_category = casteCategory || null;
        if (targetExamYear !== (leadProfile.target_exam_year?.toString() || '')) {
          leadUpdates.target_exam_year = targetExamYear ? Number(targetExamYear) : null;
        }
        if (learningMode !== (leadProfile.learning_mode || '')) leadUpdates.learning_mode = learningMode || null;
        if (schoolType !== (leadProfile.school_type || '')) leadUpdates.school_type = schoolType || null;
        if (city !== (leadProfile.city || '')) leadUpdates.city = city || null;
        if (state !== (leadProfile.state || '')) leadUpdates.state = state || null;
        if (pincode !== (leadProfile.pincode || '')) leadUpdates.pincode = pincode || null;
        if (district !== (leadProfile.district || '')) leadUpdates.district = district || null;
        if (address !== (leadProfile.address || '')) leadUpdates.address = address || null;
        if (assignedFee !== (leadProfile.assigned_fee?.toString() || ''))
          leadUpdates.assigned_fee = assignedFee ? parseFloat(assignedFee) : null;
        if (discountAmount !== (leadProfile.discount_amount?.toString() || ''))
          leadUpdates.discount_amount = discountAmount ? parseFloat(discountAmount) : null;
        if (adminNotes !== (leadProfile.admin_notes || '')) leadUpdates.admin_notes = adminNotes || null;
      }

      // Student profile fee updates
      let studentProfileUpdates: Record<string, unknown> | undefined;
      if (studentProfile) {
        const spUpdates: Record<string, unknown> = {};
        if (totalFee !== (studentProfile.total_fee?.toString() || ''))
          spUpdates.total_fee = totalFee ? parseFloat(totalFee) : null;
        if (feePaid !== (studentProfile.fee_paid?.toString() || ''))
          spUpdates.fee_paid = feePaid ? parseFloat(feePaid) : null;
        // Auto-calculate fee_due
        if (Object.keys(spUpdates).length > 0) {
          const tf = spUpdates.total_fee !== undefined ? (spUpdates.total_fee as number) : (studentProfile.total_fee || 0);
          const fp = spUpdates.fee_paid !== undefined ? (spUpdates.fee_paid as number) : (studentProfile.fee_paid || 0);
          spUpdates.fee_due = Math.max(0, (tf || 0) - (fp || 0));
          studentProfileUpdates = { studentProfileId: studentProfile.id, ...spUpdates };
        }
      }

      const hasUserUpdates = Object.keys(userUpdates).length > 0;
      const hasLeadUpdates = leadProfile && Object.keys(leadUpdates).length > 1; // >1 because profileId is always there
      const hasStudentUpdates = studentProfileUpdates && Object.keys(studentProfileUpdates).length > 1;

      if (!hasUserUpdates && !hasLeadUpdates && !hasStudentUpdates) {
        onClose();
        return;
      }

      const res = await fetch(`/api/crm/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userUpdates: hasUserUpdates ? userUpdates : undefined,
          leadUpdates: hasLeadUpdates ? leadUpdates : undefined,
          studentProfileUpdates: hasStudentUpdates ? studentProfileUpdates : undefined,
          adminId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const feeDue = (() => {
    const tf = totalFee ? parseFloat(totalFee) : 0;
    const fp = feePaid ? parseFloat(feePaid) : 0;
    return Math.max(0, tf - fp);
  })();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit User Profile</DialogTitle>
      <DialogContent>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="Personal" />
          <Tab label="Academic" disabled={!leadProfile} />
          <Tab label="Location" disabled={!leadProfile} />
          <Tab label="Fee & Notes" disabled={!leadProfile} />
        </Tabs>

        {/* Tab 0: Personal */}
        <TabPanel value={tab} index={0}>
          <TextField fullWidth size="small" label="Full Name" value={name} onChange={(e) => setName(e.target.value)} sx={{ mb: 2 }} />
          <TextField
            fullWidth
            size="small"
            label="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            helperText="Student's primary contact number"
            sx={{ mb: 2 }}
          />
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField fullWidth size="small" label="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            <TextField fullWidth size="small" label="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Box>
          <TextField fullWidth size="small" label="Email" value={email} onChange={(e) => setEmail(e.target.value)} sx={{ mb: 2 }} />
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField fullWidth size="small" label="Date of Birth" type="date" InputLabelProps={{ shrink: true }} value={dob} onChange={(e) => setDob(e.target.value)} />
            <TextField fullWidth size="small" label="Gender" select value={gender} onChange={(e) => setGender(e.target.value)}>
              <MenuItem value="">None</MenuItem>
              <MenuItem value="male">Male</MenuItem>
              <MenuItem value="female">Female</MenuItem>
              <MenuItem value="other">Other</MenuItem>
            </TextField>
          </Box>
          {leadProfile && (
            <TextField fullWidth size="small" label="Father's Name" value={fatherName} onChange={(e) => setFatherName(e.target.value)} />
          )}
        </TabPanel>

        {/* Tab 1: Academic */}
        <TabPanel value={tab} index={1}>
          <TextField
            select fullWidth size="small" label="Applicant Category"
            value={applicantCategory} onChange={(e) => setApplicantCategory(e.target.value)}
            sx={{ mb: 2 }}
          >
            <MenuItem value="">-- Select --</MenuItem>
            {APPLICANT_CATEGORIES.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>
          <TextField
            select fullWidth size="small" label="Course Interest"
            value={interestCourse} onChange={(e) => setInterestCourse(e.target.value)}
            sx={{ mb: 2 }}
          >
            <MenuItem value="">-- Select --</MenuItem>
            {COURSE_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField
              select fullWidth size="small" label="Caste Category"
              value={casteCategory} onChange={(e) => setCasteCategory(e.target.value)}
            >
              <MenuItem value="">-- Select --</MenuItem>
              {CASTE_CATEGORIES.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </TextField>
            <TextField
              fullWidth size="small" label="Target Exam Year" type="number"
              value={targetExamYear} onChange={(e) => setTargetExamYear(e.target.value)}
              placeholder="e.g. 2026"
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              select fullWidth size="small" label="Learning Mode"
              value={learningMode} onChange={(e) => setLearningMode(e.target.value)}
            >
              <MenuItem value="">-- Select --</MenuItem>
              {LEARNING_MODES.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </TextField>
            <TextField
              select fullWidth size="small" label="School Type"
              value={schoolType} onChange={(e) => setSchoolType(e.target.value)}
            >
              <MenuItem value="">-- Select --</MenuItem>
              {SCHOOL_TYPES.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </TextField>
          </Box>
        </TabPanel>

        {/* Tab 2: Location */}
        <TabPanel value={tab} index={2}>
          <TextField fullWidth size="small" label="Address" multiline rows={2} value={address} onChange={(e) => setAddress(e.target.value)} sx={{ mb: 2 }} />
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField fullWidth size="small" label="City" value={city} onChange={(e) => setCity(e.target.value)} />
            <TextField fullWidth size="small" label="State" value={state} onChange={(e) => setState(e.target.value)} />
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField fullWidth size="small" label="District" value={district} onChange={(e) => setDistrict(e.target.value)} />
            <TextField fullWidth size="small" label="Pincode" value={pincode} onChange={(e) => setPincode(e.target.value)} />
          </Box>
        </TabPanel>

        {/* Tab 3: Fee & Notes */}
        <TabPanel value={tab} index={3}>
          <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: 1, color: 'text.secondary', fontSize: 10.5 }}>
            Application Fee
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, mb: 2, mt: 0.5 }}>
            <TextField fullWidth size="small" label="Assigned Fee (\u20B9)" type="number" value={assignedFee} onChange={(e) => setAssignedFee(e.target.value)} />
            <TextField fullWidth size="small" label="Discount (\u20B9)" type="number" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} />
          </Box>

          {studentProfile && (
            <>
              <Divider sx={{ my: 1.5 }} />
              <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: 1, color: 'text.secondary', fontSize: 10.5 }}>
                Student Fees
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, mb: 2, mt: 0.5 }}>
                <TextField fullWidth size="small" label="Total Fee (\u20B9)" type="number" value={totalFee} onChange={(e) => setTotalFee(e.target.value)} />
                <TextField fullWidth size="small" label="Fee Paid (\u20B9)" type="number" value={feePaid} onChange={(e) => setFeePaid(e.target.value)} />
              </Box>
              <TextField
                fullWidth size="small" label="Fee Due (\u20B9)" type="number"
                value={feeDue.toFixed(2)}
                InputProps={{ readOnly: true }}
                helperText="Auto-calculated: Total Fee - Fee Paid"
                sx={{ mb: 2 }}
              />
            </>
          )}

          <Divider sx={{ my: 1.5 }} />
          <TextField fullWidth size="small" label="Admin Notes" multiline rows={3} value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} />
        </TabPanel>

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
