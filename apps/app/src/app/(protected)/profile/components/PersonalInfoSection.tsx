'use client';

import {
  Box,
  Typography,
  TextField,
  Button,
  Grid,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Autocomplete,
} from '@neram/ui';
import { AREA_OF_INTEREST_LABELS, type AreaOfInterest, type Gender } from '@neram/database';
import type { PersonalInfoFormData } from '../types';

const AREA_OPTIONS: { value: AreaOfInterest; label: string }[] = Object.entries(
  AREA_OF_INTEREST_LABELS
).map(([value, label]) => ({ value: value as AreaOfInterest, label }));

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

interface PersonalInfoSectionProps {
  profile: { email: string | null; phone: string | null; phone_verified: boolean } | null;
  fatherName?: string | null;
  formData: PersonalInfoFormData;
  setFormData: (data: PersonalInfoFormData) => void;
  isEditing: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export default function PersonalInfoSection({
  profile,
  fatherName,
  formData,
  setFormData,
  isEditing,
  saving,
  onSave,
  onCancel,
}: PersonalInfoSectionProps) {
  return (
    <Box>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="First Name"
            value={formData.first_name}
            onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
            disabled={!isEditing}
            required
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Last Name"
            value={formData.last_name}
            onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
            disabled={!isEditing}
            required
          />
        </Grid>
        {fatherName && (
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Father's Name"
              value={fatherName}
              disabled
              helperText="From your application"
            />
          </Grid>
        )}
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Email"
            value={profile?.email || ''}
            disabled
            helperText="Email cannot be changed"
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Phone Number"
            value={profile?.phone || ''}
            disabled
            helperText={profile?.phone_verified ? 'Verified' : 'Verify via phone verification'}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Nickname"
            value={formData.nickname}
            onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
            disabled={!isEditing}
            placeholder="Display name"
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth disabled={!isEditing}>
            <InputLabel>Gender</InputLabel>
            <Select
              value={formData.gender}
              label="Gender"
              onChange={(e) => setFormData({ ...formData, gender: e.target.value as Gender })}
            >
              <MenuItem value="">
                <em>Select</em>
              </MenuItem>
              {GENDER_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Date of Birth"
            type="date"
            value={formData.date_of_birth}
            onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
            disabled={!isEditing}
            InputLabelProps={{ shrink: true }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <Autocomplete
            multiple
            options={AREA_OPTIONS}
            getOptionLabel={(option) => option.label}
            value={AREA_OPTIONS.filter((opt) => formData.area_of_interest.includes(opt.value))}
            onChange={(_, newValue) =>
              setFormData({ ...formData, area_of_interest: newValue.map((v) => v.value) })
            }
            disabled={!isEditing}
            renderInput={(params) => <TextField {...params} label="Area of Interest" />}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip label={option.label} size="small" {...getTagProps({ index })} key={option.value} />
              ))
            }
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            fullWidth
            label="About Me"
            multiline
            rows={3}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            disabled={!isEditing}
            placeholder="Tell us a little about yourself..."
            inputProps={{ maxLength: 500 }}
            helperText={isEditing ? `${formData.description?.length || 0}/500 characters` : ''}
          />
        </Grid>
      </Grid>

      {isEditing && (
        <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
          <Button variant="contained" onClick={onSave} disabled={saving}>
            {saving ? <CircularProgress size={24} /> : 'Save Changes'}
          </Button>
          <Button variant="outlined" onClick={onCancel}>
            Cancel
          </Button>
        </Box>
      )}
    </Box>
  );
}
