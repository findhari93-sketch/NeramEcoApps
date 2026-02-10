'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Grid,
  Divider,
  Card,
  CardContent,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Autocomplete,
  Collapse,
  IconButton,
  useTheme,
  useMediaQuery,
} from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';
import ProfilePictureUpload from '@/components/ProfilePictureUpload';
import type { CropData } from '@/components/ProfilePictureUpload';
import { AREA_OF_INTEREST_LABELS, type AreaOfInterest, type Gender } from '@neram/database';

// Area of interest options
const AREA_OPTIONS: { value: AreaOfInterest; label: string }[] = Object.entries(
  AREA_OF_INTEREST_LABELS
).map(([value, label]) => ({ value: value as AreaOfInterest, label }));

// Gender options
const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

interface ProfileData {
  id: string;
  email: string | null;
  phone: string | null;
  name: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  nickname: string | null;
  description: string | null;
  area_of_interest: AreaOfInterest[] | null;
  date_of_birth: string | null;
  gender: Gender | null;
  avatar_url: string | null;
  phone_verified: boolean;
  email_verified: boolean;
  has_password: boolean;
}

export default function ProfilePage() {
  const { user, signOut } = useFirebaseAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    nickname: '',
    description: '',
    area_of_interest: [] as AreaOfInterest[],
    date_of_birth: '',
    gender: '' as Gender | '',
  });

  // Username state
  const [username, setUsername] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);
  const [checkingUsername, setCheckingUsername] = useState(false);

  // Fetch profile on mount
  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const idToken = await (user?.raw as any)?.getIdToken?.();
      if (!idToken) throw new Error('Not authenticated');

      const response = await fetch('/api/profile', {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!response.ok) throw new Error('Failed to fetch profile');

      const data = await response.json();
      setProfile(data.user);

      // Initialize form data
      setFormData({
        first_name: data.user.first_name || '',
        last_name: data.user.last_name || '',
        nickname: data.user.nickname || '',
        description: data.user.description || '',
        area_of_interest: data.user.area_of_interest || [],
        date_of_birth: data.user.date_of_birth || '',
        gender: data.user.gender || '',
      });
      setUsername(data.user.username || '');
    } catch (err) {
      console.error('Error fetching profile:', err);
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const idToken = await (user?.raw as any)?.getIdToken?.();
      if (!idToken) throw new Error('Not authenticated');

      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update profile');
      }

      const data = await response.json();
      setProfile(data.user);
      setIsEditing(false);
      setSuccess('Profile updated successfully!');

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (file: File, cropData: CropData) => {
    try {
      const idToken = await (user?.raw as any)?.getIdToken?.();
      if (!idToken) throw new Error('Not authenticated');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('cropData', JSON.stringify(cropData));

      const response = await fetch('/api/profile/avatar', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to upload avatar');
      }

      const data = await response.json();
      setProfile((prev) =>
        prev ? { ...prev, avatar_url: data.avatar.url } : null
      );
      setSuccess('Profile picture updated!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      throw err;
    }
  };

  const handleAvatarRemove = async () => {
    try {
      const idToken = await (user?.raw as any)?.getIdToken?.();
      if (!idToken) throw new Error('Not authenticated');

      const response = await fetch('/api/profile/avatar', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to remove avatar');
      }

      setProfile((prev) => (prev ? { ...prev, avatar_url: null } : null));
      setSuccess('Profile picture removed');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      throw err;
    }
  };

  const checkUsernameAvailability = async (value: string) => {
    if (!value || value.length < 3) {
      setUsernameAvailable(null);
      setUsernameSuggestions([]);
      return;
    }

    setCheckingUsername(true);
    try {
      const response = await fetch(
        `/api/auth/check-username?username=${encodeURIComponent(value)}&excludeUserId=${profile?.id}`
      );
      const data = await response.json();
      setUsernameAvailable(data.available);
      setUsernameSuggestions(data.suggestions || []);
    } catch (err) {
      console.error('Error checking username:', err);
    } finally {
      setCheckingUsername(false);
    }
  };

  const handleSetUsername = async () => {
    if (!usernameAvailable || !username) return;

    try {
      setSaving(true);
      const idToken = await (user?.raw as any)?.getIdToken?.();
      if (!idToken) throw new Error('Not authenticated');

      const response = await fetch('/api/auth/set-username', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ username }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to set username');
      }

      const data = await response.json();
      setProfile((prev) =>
        prev ? { ...prev, username: data.user.username } : null
      );
      setSuccess('Username set successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to set username');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset form data to profile values
    if (profile) {
      setFormData({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        nickname: profile.nickname || '',
        description: profile.description || '',
        area_of_interest: profile.area_of_interest || [],
        date_of_birth: profile.date_of_birth || '',
        gender: profile.gender || '',
      });
    }
    setIsEditing(false);
    setError(null);
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '50vh',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

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
        {/* Profile Overview - Sidebar on desktop, top on mobile */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3 }}>
            {/* Profile Picture */}
            <ProfilePictureUpload
              currentAvatarUrl={profile?.avatar_url}
              userName={profile?.name || 'User'}
              onUpload={handleAvatarUpload}
              onRemove={handleAvatarRemove}
              size={isMobile ? 100 : 120}
              editable={true}
            />

            {/* Name and Email */}
            <Typography variant="h6" sx={{ mt: 2, textAlign: 'center' }}>
              {profile?.name || 'User'}
            </Typography>
            {profile?.nickname && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ textAlign: 'center' }}
              >
                @{profile.nickname}
              </Typography>
            )}
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ textAlign: 'center', mt: 0.5 }}
            >
              {profile?.email}
            </Typography>

            {/* Edit/Sign out buttons */}
            <Box sx={{ mt: 3 }}>
              <Button
                variant={isEditing ? 'text' : 'outlined'}
                fullWidth
                onClick={() => (isEditing ? handleCancel() : setIsEditing(true))}
              >
                {isEditing ? 'Cancel' : 'Edit Profile'}
              </Button>
              <Button
                variant="text"
                color="error"
                fullWidth
                sx={{ mt: 1 }}
                onClick={() => signOut()}
              >
                Sign Out
              </Button>
            </Box>
          </Paper>

          {/* Account Status */}
          <Paper sx={{ p: 2, mt: 2 }}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              Account Status
            </Typography>
            <Box sx={{ mt: 1 }}>
              <Box
                sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}
              >
                <Typography variant="body2">Email Verified</Typography>
                <Chip
                  label={profile?.email_verified ? 'Yes' : 'No'}
                  size="small"
                  color={profile?.email_verified ? 'success' : 'default'}
                />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">Phone Verified</Typography>
                <Chip
                  label={profile?.phone_verified ? 'Yes' : 'No'}
                  size="small"
                  color={profile?.phone_verified ? 'success' : 'default'}
                />
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* Profile Details */}
        <Grid item xs={12} md={8}>
          {/* Personal Information */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Personal Information
            </Typography>
            <Divider sx={{ mb: 3 }} />

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="First Name"
                  value={formData.first_name}
                  onChange={(e) =>
                    setFormData({ ...formData, first_name: e.target.value })
                  }
                  disabled={!isEditing}
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Last Name"
                  value={formData.last_name}
                  onChange={(e) =>
                    setFormData({ ...formData, last_name: e.target.value })
                  }
                  disabled={!isEditing}
                  required
                />
              </Grid>
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
                  helperText={
                    profile?.phone_verified
                      ? 'Verified'
                      : 'Verify via phone verification'
                  }
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Nickname"
                  value={formData.nickname}
                  onChange={(e) =>
                    setFormData({ ...formData, nickname: e.target.value })
                  }
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
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        gender: e.target.value as Gender,
                      })
                    }
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
                  onChange={(e) =>
                    setFormData({ ...formData, date_of_birth: e.target.value })
                  }
                  disabled={!isEditing}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Autocomplete
                  multiple
                  options={AREA_OPTIONS}
                  getOptionLabel={(option) => option.label}
                  value={AREA_OPTIONS.filter((opt) =>
                    formData.area_of_interest.includes(opt.value)
                  )}
                  onChange={(_, newValue) =>
                    setFormData({
                      ...formData,
                      area_of_interest: newValue.map((v) => v.value),
                    })
                  }
                  disabled={!isEditing}
                  renderInput={(params) => (
                    <TextField {...params} label="Area of Interest" />
                  )}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => (
                      <Chip
                        label={option.label}
                        size="small"
                        {...getTagProps({ index })}
                        key={option.value}
                      />
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
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  disabled={!isEditing}
                  placeholder="Tell us a little about yourself..."
                  inputProps={{ maxLength: 500 }}
                  helperText={
                    isEditing
                      ? `${formData.description?.length || 0}/500 characters`
                      : ''
                  }
                />
              </Grid>
            </Grid>

            {isEditing && (
              <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
                <Button
                  variant="contained"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? <CircularProgress size={24} /> : 'Save Changes'}
                </Button>
                <Button variant="outlined" onClick={handleCancel}>
                  Cancel
                </Button>
              </Box>
            )}
          </Paper>

          {/* Username Section */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Username
            </Typography>
            <Divider sx={{ mb: 3 }} />

            {profile?.username ? (
              <Box>
                <Typography variant="body1">
                  Your username: <strong>@{profile.username}</strong>
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  You can use this username to login instead of your email.
                </Typography>
              </Box>
            ) : (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Set a unique username to login more easily
                </Typography>
                <Grid container spacing={2} alignItems="flex-start">
                  <Grid item xs={12} sm={8}>
                    <TextField
                      fullWidth
                      label="Username"
                      value={username}
                      onChange={(e) => {
                        const value = e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9_.]/g, '');
                        setUsername(value);
                        checkUsernameAvailability(value);
                      }}
                      placeholder="e.g., john_doe"
                      helperText={
                        checkingUsername
                          ? 'Checking...'
                          : usernameAvailable === true
                          ? 'Username is available!'
                          : usernameAvailable === false
                          ? 'Username is taken'
                          : '3-30 characters, letters, numbers, underscores, dots'
                      }
                      error={usernameAvailable === false}
                      InputProps={{
                        endAdornment: checkingUsername ? (
                          <CircularProgress size={20} />
                        ) : null,
                      }}
                    />
                    {usernameSuggestions.length > 0 && (
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                          Suggestions:{' '}
                          {usernameSuggestions.map((s, i) => (
                            <Chip
                              key={s}
                              label={s}
                              size="small"
                              onClick={() => {
                                setUsername(s);
                                setUsernameAvailable(true);
                                setUsernameSuggestions([]);
                              }}
                              sx={{ ml: i > 0 ? 0.5 : 0, cursor: 'pointer' }}
                            />
                          ))}
                        </Typography>
                      </Box>
                    )}
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Button
                      variant="contained"
                      fullWidth
                      onClick={handleSetUsername}
                      disabled={
                        !usernameAvailable || saving || username.length < 3
                      }
                      sx={{ height: 56 }}
                    >
                      {saving ? <CircularProgress size={24} /> : 'Set Username'}
                    </Button>
                  </Grid>
                </Grid>
              </Box>
            )}
          </Paper>

          {/* Activity Overview */}
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Activity Overview
            </Typography>
            <Divider sx={{ mb: 3 }} />

            <Grid container spacing={2}>
              {[
                { label: 'Tools Used', value: 12, color: 'primary.main' },
                { label: 'Predictions', value: 5, color: 'success.main' },
                { label: 'Applications', value: 3, color: 'warning.main' },
                { label: 'Days Active', value: 24, color: 'info.main' },
              ].map((stat) => (
                <Grid item xs={6} sm={3} key={stat.label}>
                  <Card variant="outlined">
                    <CardContent sx={{ textAlign: 'center', py: 2 }}>
                      <Typography variant="h4" color={stat.color}>
                        {stat.value}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {stat.label}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
