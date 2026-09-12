'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  MenuItem,
  TextField,
  Typography,
  Divider,
  Grid,
} from '@neram/ui';
import type { UserJourneyDetail } from '@neram/database';

interface EditApplicationDialogProps {
  open: boolean;
  onClose: () => void;
  detail: UserJourneyDetail;
  adminId: string;
  onSaved: () => void;
}

const COURSE_OPTIONS = [
  { value: 'nata', label: 'NATA' },
  { value: 'jee_paper2', label: 'JEE Paper 2' },
  { value: 'both', label: 'Both NATA & JEE' },
  { value: 'not_sure', label: 'Not Sure' },
];

const LEARNING_MODES = [
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'online_only', label: 'Online Only' },
];

const APPLICANT_CATEGORIES = [
  { value: 'school_student', label: 'School Student' },
  { value: 'diploma_student', label: 'Diploma Student' },
  { value: 'college_student', label: 'College Student' },
  { value: 'working_professional', label: 'Working Professional' },
];

/** The values the apply form stores in academic_data.current_class. Nexus reads them. */
const CLASS_OPTIONS = [
  { value: '10', label: 'Class 10' },
  { value: '11', label: 'Class 11' },
  { value: '12', label: 'Class 12' },
  { value: '12_completed', label: '12th completed' },
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

const TEXT_FIELDS = [
  'father_name',
  'applicant_category',
  'interest_course',
  'learning_mode',
  'city',
  'state',
  'pincode',
  'school_type',
  'caste_category',
] as const;

const EMPTY_FORM = {
  father_name: '',
  applicant_category: '',
  current_class: '',
  interest_course: '',
  learning_mode: '',
  city: '',
  state: '',
  pincode: '',
  school_type: '',
  caste_category: '',
  target_exam_year: '',
};

type FormState = typeof EMPTY_FORM;

const FIELD_SX = { '& .MuiOutlinedInput-root': { borderRadius: 0.75 } };

/**
 * Edit a student's application, or fill one in for a student who has none.
 *
 * The second case is how a student who joined without applying (or whose form was
 * never found) gets a class and exam year in Nexus: staff enter what the student
 * told them, and Nexus reads the current class and exam year from here.
 */
export default function EditApplicationDialog({
  open,
  onClose,
  detail,
  adminId,
  onSaved,
}: EditApplicationDialogProps) {
  const { leadProfile } = detail;
  const isNew = !leadProfile;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    if (!open) return;
    const current = (leadProfile || {}) as Record<string, any>;
    const academic = (current.academic_data || {}) as Record<string, unknown>;
    setFormData({
      father_name: current.father_name || '',
      applicant_category: current.applicant_category || '',
      current_class: academic.current_class ? String(academic.current_class) : '',
      interest_course: current.interest_course || '',
      learning_mode: current.learning_mode || '',
      city: current.city || '',
      state: current.state || '',
      pincode: current.pincode || '',
      school_type: current.school_type || '',
      caste_category: current.caste_category || '',
      target_exam_year: current.target_exam_year?.toString() || '',
    });
    setError('');
  }, [open, leadProfile]);

  const handleChange = (field: keyof FormState, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');

    try {
      const current = (leadProfile || {}) as Record<string, any>;
      const updates: Record<string, unknown> = {};

      // Only include changed fields
      for (const field of TEXT_FIELDS) {
        if (formData[field] !== (current[field] || '')) updates[field] = formData[field] || null;
      }

      if (formData.target_exam_year !== (current.target_exam_year?.toString() || '')) {
        const year = formData.target_exam_year ? Number(formData.target_exam_year) : null;
        if (year !== null && (!Number.isInteger(year) || year < 2000 || year > 2100)) {
          setError('Target exam year must be a year such as 2027.');
          return;
        }
        updates.target_exam_year = year;
      }

      const academic = (current.academic_data || {}) as Record<string, unknown>;
      if (formData.current_class !== (academic.current_class ? String(academic.current_class) : '')) {
        updates.academic_data = { ...academic, current_class: formData.current_class || null };
      }

      if (isNew) {
        // A new application starts from nothing, so a blank is simply not sent.
        for (const [field, value] of Object.entries(updates)) if (value === null) delete updates[field];
        if (Object.keys(updates).length === 0) {
          setError('Fill in at least one field.');
          return;
        }
      } else if (Object.keys(updates).length === 0) {
        onClose();
        return;
      }

      const res = await fetch(`/api/crm/users/${detail.user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId,
          leadUpdates: isNew ? updates : { profileId: leadProfile!.id, ...updates },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || (isNew ? 'Failed to save the application' : 'Failed to update application'));
      }

      onClose();
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 1.5 } }}
    >
      <DialogTitle sx={{ fontWeight: 700, fontSize: 18, pb: 1 }}>
        {isNew ? 'Fill application form' : 'Edit Application'}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {isNew && (
            <Alert severity="info" sx={{ borderRadius: 0.75 }}>
              This student has no application. Fill in what they told you. Nexus sets their class and exam
              year from the current class and the target exam year.
            </Alert>
          )}

          {/* Personal */}
          <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: 1, color: 'text.secondary', fontSize: 10.5 }}>
            Personal Details
          </Typography>

          <TextField
            label="Father's Name"
            value={formData.father_name}
            onChange={(e) => handleChange('father_name', e.target.value)}
            fullWidth
            size="small"
            sx={FIELD_SX}
          />

          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField
                select
                label="Applicant Category"
                value={formData.applicant_category}
                onChange={(e) => handleChange('applicant_category', e.target.value)}
                fullWidth
                size="small"
                sx={FIELD_SX}
              >
                <MenuItem value="">-- Select --</MenuItem>
                {APPLICANT_CATEGORIES.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={6}>
              <TextField
                select
                label="Current Class"
                value={formData.current_class}
                onChange={(e) => handleChange('current_class', e.target.value)}
                fullWidth
                size="small"
                helperText="For school students"
                sx={FIELD_SX}
              >
                <MenuItem value="">-- Select --</MenuItem>
                {CLASS_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>

          <Divider sx={{ my: 0.5 }} />
          <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: 1, color: 'text.secondary', fontSize: 10.5 }}>
            Course & Learning
          </Typography>

          <TextField
            select
            label="Course Interest"
            value={formData.interest_course}
            onChange={(e) => handleChange('interest_course', e.target.value)}
            fullWidth
            size="small"
            sx={FIELD_SX}
          >
            {isNew && <MenuItem value="">-- Select --</MenuItem>}
            {COURSE_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Learning Mode"
            value={formData.learning_mode}
            onChange={(e) => handleChange('learning_mode', e.target.value)}
            fullWidth
            size="small"
            sx={FIELD_SX}
          >
            {isNew && <MenuItem value="">-- Select --</MenuItem>}
            {LEARNING_MODES.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </TextField>

          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField
                select
                label="School Type"
                value={formData.school_type}
                onChange={(e) => handleChange('school_type', e.target.value)}
                fullWidth
                size="small"
                sx={FIELD_SX}
              >
                <MenuItem value="">-- Select --</MenuItem>
                {SCHOOL_TYPES.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={6}>
              <TextField
                select
                label="Caste Category"
                value={formData.caste_category}
                onChange={(e) => handleChange('caste_category', e.target.value)}
                fullWidth
                size="small"
                sx={FIELD_SX}
              >
                <MenuItem value="">-- Select --</MenuItem>
                {CASTE_CATEGORIES.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>

          <TextField
            label="Target Exam Year"
            type="number"
            value={formData.target_exam_year}
            onChange={(e) => handleChange('target_exam_year', e.target.value)}
            fullWidth
            size="small"
            placeholder="e.g. 2027"
            helperText="The calendar year they write the exam. The 2026-27 batch writes in 2027."
            sx={FIELD_SX}
          />

          <Divider sx={{ my: 0.5 }} />
          <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: 1, color: 'text.secondary', fontSize: 10.5 }}>
            Location
          </Typography>

          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField
                label="City"
                value={formData.city}
                onChange={(e) => handleChange('city', e.target.value)}
                fullWidth
                size="small"
                sx={FIELD_SX}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="State"
                value={formData.state}
                onChange={(e) => handleChange('state', e.target.value)}
                fullWidth
                size="small"
                sx={FIELD_SX}
              />
            </Grid>
          </Grid>

          <TextField
            label="Pincode"
            value={formData.pincode}
            onChange={(e) => handleChange('pincode', e.target.value)}
            fullWidth
            size="small"
            sx={FIELD_SX}
          />

          {error && <Alert severity="error" sx={{ borderRadius: 0.75 }}>{error}</Alert>}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button
          onClick={onClose}
          sx={{ borderRadius: 1.5, textTransform: 'none', fontWeight: 500 }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
          sx={{ borderRadius: 1.5, textTransform: 'none', fontWeight: 600, boxShadow: 'none', px: 3, '&:hover': { boxShadow: 'none' } }}
        >
          {saving ? 'Saving...' : isNew ? 'Save application' : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
