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

export default function EditApplicationDialog({
  open,
  onClose,
  detail,
  adminId,
  onSaved,
}: EditApplicationDialogProps) {
  const { leadProfile } = detail;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    father_name: '',
    applicant_category: '',
    interest_course: '',
    learning_mode: '',
    city: '',
    state: '',
    pincode: '',
    school_type: '',
    caste_category: '',
    target_exam_year: '',
  });

  useEffect(() => {
    if (open && leadProfile) {
      setFormData({
        father_name: leadProfile.father_name || '',
        applicant_category: leadProfile.applicant_category || '',
        interest_course: leadProfile.interest_course || '',
        learning_mode: leadProfile.learning_mode || '',
        city: leadProfile.city || '',
        state: leadProfile.state || '',
        pincode: leadProfile.pincode || '',
        school_type: leadProfile.school_type || '',
        caste_category: leadProfile.caste_category || '',
        target_exam_year: leadProfile.target_exam_year?.toString() || '',
      });
      setError('');
    }
  }, [open, leadProfile]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!leadProfile) return;
    setSaving(true);
    setError('');

    try {
      // Build updates - only include changed fields
      const updates: Record<string, unknown> = {};
      if (formData.father_name !== (leadProfile.father_name || '')) updates.father_name = formData.father_name || null;
      if (formData.applicant_category !== (leadProfile.applicant_category || '')) updates.applicant_category = formData.applicant_category || null;
      if (formData.interest_course !== (leadProfile.interest_course || '')) updates.interest_course = formData.interest_course;
      if (formData.learning_mode !== (leadProfile.learning_mode || '')) updates.learning_mode = formData.learning_mode;
      if (formData.city !== (leadProfile.city || '')) updates.city = formData.city || null;
      if (formData.state !== (leadProfile.state || '')) updates.state = formData.state || null;
      if (formData.pincode !== (leadProfile.pincode || '')) updates.pincode = formData.pincode || null;
      if (formData.school_type !== (leadProfile.school_type || '')) updates.school_type = formData.school_type || null;
      if (formData.caste_category !== (leadProfile.caste_category || '')) updates.caste_category = formData.caste_category || null;
      if (formData.target_exam_year !== (leadProfile.target_exam_year?.toString() || '')) {
        updates.target_exam_year = formData.target_exam_year ? Number(formData.target_exam_year) : null;
      }

      if (Object.keys(updates).length === 0) {
        onClose();
        return;
      }

      const res = await fetch(`/api/crm/users/${detail.user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId,
          leadUpdates: {
            profileId: leadProfile.id,
            ...updates,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update application');
      }

      onClose();
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!leadProfile) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 1.5 } }}
    >
      <DialogTitle sx={{ fontWeight: 700, fontSize: 18, pb: 1 }}>
        Edit Application
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
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
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0.75 } }}
          />

          <TextField
            select
            label="Applicant Category"
            value={formData.applicant_category}
            onChange={(e) => handleChange('applicant_category', e.target.value)}
            fullWidth
            size="small"
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0.75 } }}
          >
            <MenuItem value="">-- Select --</MenuItem>
            {APPLICANT_CATEGORIES.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </TextField>

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
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0.75 } }}
          >
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
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0.75 } }}
          >
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
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0.75 } }}
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
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0.75 } }}
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
            placeholder="e.g. 2026"
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0.75 } }}
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
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0.75 } }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="State"
                value={formData.state}
                onChange={(e) => handleChange('state', e.target.value)}
                fullWidth
                size="small"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0.75 } }}
              />
            </Grid>
          </Grid>

          <TextField
            label="Pincode"
            value={formData.pincode}
            onChange={(e) => handleChange('pincode', e.target.value)}
            fullWidth
            size="small"
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0.75 } }}
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
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
