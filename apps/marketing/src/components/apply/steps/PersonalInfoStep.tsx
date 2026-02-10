'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  TextField,
  Grid,
  Typography,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  IconButton,
  InputAdornment,
  Chip,
  Alert,
  Button,
  CircularProgress,
} from '@neram/ui';
import {
  CheckCircleOutlined,
  EditOutlined,
  MyLocationOutlined,
  VerifiedOutlined,
} from '@mui/icons-material';
import { useFormContext } from '../FormContext';
import { GENDER_OPTIONS } from '../types';

export default function PersonalInfoStep() {
  const {
    formData,
    updateFormData,
    isFieldPrefilled,
    setShowPhoneVerification,
  } = useFormContext();

  // Location auto-fill state
  const [isPincodeLooking, setIsPincodeLooking] = useState(false);
  const [pincodeError, setPincodeError] = useState<string | null>(null);
  const [isLocationEditable, setIsLocationEditable] = useState(false);
  const [isGeolocating, setIsGeolocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Request geolocation on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && !formData.location.latitude) {
      requestGeolocation();
    }
  }, []);

  const requestGeolocation = async () => {
    if (!('geolocation' in navigator)) {
      return;
    }

    setIsGeolocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        updateFormData('location', {
          latitude,
          longitude,
          locationSource: 'geolocation',
        });

        // Try to reverse geocode
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
          );
          const data = await response.json();

          if (data.address) {
            updateFormData('location', {
              city: data.address.city || data.address.town || data.address.village || '',
              state: data.address.state || '',
              district: data.address.county || data.address.state_district || '',
              pincode: data.address.postcode || '',
            });
          }
        } catch {
          // Ignore reverse geocode errors
        }

        setIsGeolocating(false);
      },
      (error) => {
        console.log('Geolocation error:', error.message);
        setGeoError('Location access denied. Please enter your address manually.');
        setIsGeolocating(false);
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  };

  // Pin code lookup
  const lookupPincode = useCallback(async (pincode: string) => {
    if (pincode.length !== 6) return;

    setIsPincodeLooking(true);
    setPincodeError(null);

    try {
      const response = await fetch(`/api/pincode/${pincode}`);
      const data = await response.json();

      if (data.success && data.data) {
        updateFormData('location', {
          city: data.data.city || data.data.district,
          state: data.data.state,
          district: data.data.district,
          locationSource: 'pincode',
        });
        setIsLocationEditable(false);
      } else {
        setPincodeError(data.error || 'Could not find location for this pin code');
        setIsLocationEditable(true);
      }
    } catch {
      setPincodeError('Failed to lookup pin code. Please enter location manually.');
      setIsLocationEditable(true);
    } finally {
      setIsPincodeLooking(false);
    }
  }, [updateFormData]);

  const handlePincodeChange = (value: string) => {
    // Only allow digits
    const cleaned = value.replace(/\D/g, '').slice(0, 6);
    updateFormData('location', { pincode: cleaned });
    setPincodeError(null);

    // Auto-lookup when 6 digits entered
    if (cleaned.length === 6) {
      lookupPincode(cleaned);
    }
  };

  const handlePhoneChange = (value: string) => {
    // Only allow digits
    const cleaned = value.replace(/\D/g, '').slice(0, 10);
    updateFormData('personal', { phone: cleaned, phoneVerified: false, phoneVerifiedAt: null });
  };

  const handleVerifyPhone = () => {
    if (formData.personal.phone.length === 10) {
      setShowPhoneVerification(true);
    }
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom fontWeight={600}>
        Personal Information
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Please provide your personal details. Fields marked with * are required.
      </Typography>

      <Grid container spacing={3}>
        {/* First Name */}
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="First Name"
            required
            value={formData.personal.firstName}
            onChange={(e) => updateFormData('personal', { firstName: e.target.value })}
            InputProps={{
              endAdornment: isFieldPrefilled('firstName') && (
                <InputAdornment position="end">
                  <Chip label="Pre-filled" size="small" color="info" variant="outlined" />
                </InputAdornment>
              ),
            }}
            inputProps={{ minLength: 2 }}
          />
        </Grid>

        {/* Father's Name */}
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Father's Name"
            required
            value={formData.personal.fatherName}
            onChange={(e) => updateFormData('personal', { fatherName: e.target.value })}
            helperText="As per official documents"
            inputProps={{ minLength: 2 }}
          />
        </Grid>

        {/* Email */}
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Email Address"
            type="email"
            required
            value={formData.personal.email}
            onChange={(e) => updateFormData('personal', { email: e.target.value })}
            InputProps={{
              endAdornment: isFieldPrefilled('email') && (
                <InputAdornment position="end">
                  <Chip label="Pre-filled" size="small" color="info" variant="outlined" />
                </InputAdornment>
              ),
            }}
          />
        </Grid>

        {/* Phone with Verification */}
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Phone Number"
            required
            value={formData.personal.phone}
            onChange={(e) => handlePhoneChange(e.target.value)}
            placeholder="9876543210"
            inputProps={{
              inputMode: 'numeric',
              pattern: '[0-9]*',
              maxLength: 10,
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">+91</InputAdornment>
              ),
              endAdornment: formData.personal.phoneVerified ? (
                <InputAdornment position="end">
                  <Chip
                    icon={<VerifiedOutlined />}
                    label="Verified"
                    size="small"
                    color="success"
                  />
                </InputAdornment>
              ) : formData.personal.phone.length === 10 ? (
                <InputAdornment position="end">
                  <Button size="small" variant="text" onClick={handleVerifyPhone}>
                    Verify
                  </Button>
                </InputAdornment>
              ) : null,
            }}
            error={formData.personal.phone.length > 0 && formData.personal.phone.length !== 10}
            helperText={
              formData.personal.phone.length > 0 && formData.personal.phone.length !== 10
                ? 'Please enter a valid 10-digit number'
                : !formData.personal.phoneVerified
                ? 'Phone verification is required'
                : ''
            }
          />
        </Grid>

        {/* Date of Birth */}
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Date of Birth"
            type="date"
            required
            value={formData.personal.dateOfBirth}
            onChange={(e) => updateFormData('personal', { dateOfBirth: e.target.value })}
            InputLabelProps={{ shrink: true }}
            inputProps={{
              max: new Date().toISOString().split('T')[0],
            }}
          />
        </Grid>

        {/* Gender */}
        <Grid item xs={12} sm={6}>
          <FormControl required>
            <FormLabel>Gender</FormLabel>
            <RadioGroup
              row
              value={formData.personal.gender}
              onChange={(e) =>
                updateFormData('personal', { gender: e.target.value as 'male' | 'female' | 'other' })
              }
            >
              {GENDER_OPTIONS.map((option) => (
                <FormControlLabel
                  key={option.value}
                  value={option.value}
                  control={<Radio />}
                  label={option.label}
                />
              ))}
            </RadioGroup>
          </FormControl>
        </Grid>

        {/* Location Section Header */}
        <Grid item xs={12}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mt: 2,
              mb: 1,
            }}
          >
            <Typography variant="h6" fontWeight={600}>
              Location
            </Typography>
            {!isGeolocating && !formData.location.latitude && (
              <Button
                size="small"
                startIcon={<MyLocationOutlined />}
                onClick={requestGeolocation}
              >
                Detect Location
              </Button>
            )}
            {isGeolocating && (
              <Box display="flex" alignItems="center" gap={1}>
                <CircularProgress size={16} />
                <Typography variant="body2" color="text.secondary">
                  Detecting location...
                </Typography>
              </Box>
            )}
          </Box>
          {geoError && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {geoError}
            </Alert>
          )}
        </Grid>

        {/* Pin Code - First! */}
        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            label="Pin Code"
            required
            value={formData.location.pincode}
            onChange={(e) => handlePincodeChange(e.target.value)}
            placeholder="600001"
            inputProps={{
              inputMode: 'numeric',
              pattern: '[0-9]*',
              maxLength: 6,
            }}
            InputProps={{
              endAdornment: isPincodeLooking ? (
                <InputAdornment position="end">
                  <CircularProgress size={20} />
                </InputAdornment>
              ) : formData.location.city && !isLocationEditable ? (
                <InputAdornment position="end">
                  <CheckCircleOutlined color="success" />
                </InputAdornment>
              ) : null,
            }}
            error={!!pincodeError}
            helperText={pincodeError || 'Enter 6-digit pin code for auto-fill'}
          />
        </Grid>

        {/* City - Auto-filled */}
        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            label="City"
            required
            value={formData.location.city}
            onChange={(e) => updateFormData('location', { city: e.target.value })}
            disabled={!isLocationEditable && !!formData.location.city}
            InputProps={{
              endAdornment:
                !isLocationEditable && formData.location.city ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setIsLocationEditable(true)}>
                      <EditOutlined fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
            }}
          />
        </Grid>

        {/* State - Auto-filled */}
        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            label="State"
            required
            value={formData.location.state}
            onChange={(e) => updateFormData('location', { state: e.target.value })}
            disabled={!isLocationEditable && !!formData.location.state}
            InputProps={{
              endAdornment:
                !isLocationEditable && formData.location.state ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setIsLocationEditable(true)}>
                      <EditOutlined fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
            }}
          />
        </Grid>

        {/* Address - Optional */}
        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Full Address (Optional)"
            multiline
            rows={2}
            value={formData.location.address}
            onChange={(e) => updateFormData('location', { address: e.target.value })}
            placeholder="House/Flat number, Street name, Area"
            helperText="This helps us if you want to visit our offline center"
          />
        </Grid>
      </Grid>
    </Box>
  );
}
