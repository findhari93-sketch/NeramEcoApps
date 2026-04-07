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
import { useFormContext } from '../hooks/useApplicationForm';
import { GENDER_OPTIONS } from '../types';
import { trackFunnelEvent } from '@/lib/funnel-tracker';

export default function PersonalInfoStep() {
  const {
    formData,
    updateFormData,
    isFieldPrefilled,
    setShowPhoneVerification,
  } = useFormContext();

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
    if (!('geolocation' in navigator)) return;

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

        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
          );
          const data = await response.json();

          if (data.address) {
            const detectedCity = data.address.city || data.address.town || data.address.village || '';
            const detectedState = data.address.state || '';
            const detectedDistrict = data.address.county || data.address.state_district || '';
            const detectedPincode = data.address.postcode || '';

            updateFormData('location', {
              detectedLocation: {
                pincode: detectedPincode,
                city: detectedCity,
                state: detectedState,
                district: detectedDistrict,
                country: data.address.country_code?.toUpperCase() || null,
              },
            });

            const updates: Record<string, string> = {};
            if (!formData.location.city && detectedCity) updates.city = detectedCity;
            if (!formData.location.state && detectedState) updates.state = detectedState;
            if (!formData.location.district && detectedDistrict) updates.district = detectedDistrict;
            if (!formData.location.pincode && detectedPincode) updates.pincode = detectedPincode;

            if (Object.keys(updates).length > 0) {
              updateFormData('location', updates);
            }
          }
        } catch {
          // Ignore reverse geocode errors
        }

        setIsGeolocating(false);
      },
      () => {
        setGeoError('Location access denied. Please enter your address manually.');
        setIsGeolocating(false);
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  };

  // Pincode lookup (India only)
  const lookupPincode = useCallback(
    async (pincode: string) => {
      if (!/^\d{6}$/.test(pincode)) return;

      setIsPincodeLooking(true);
      setPincodeError(null);

      try {
        const response = await fetch(`/api/pincode/${pincode}?country=IN`);
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
          setPincodeError(data.error || 'Could not find location for this pincode');
          setIsLocationEditable(true);
        }
      } catch {
        setPincodeError('Failed to lookup pincode. Please enter location manually.');
        setIsLocationEditable(true);
      } finally {
        setIsPincodeLooking(false);
      }
    },
    [updateFormData]
  );

  const handlePincodeChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 6);
    updateFormData('location', { pincode: cleaned });
    setPincodeError(null);

    if (/^\d{6}$/.test(cleaned)) {
      lookupPincode(cleaned);
    }
  };

  const handlePhoneChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 10);
    updateFormData('personal', { phone: cleaned, phoneVerified: false, phoneVerifiedAt: null });
  };

  const handleVerifyPhone = () => {
    if (formData.personal.phone.length === 10) {
      trackFunnelEvent({ funnel: 'auth', event: 'phone_number_entered', status: 'started' });
      trackFunnelEvent({ funnel: 'auth', event: 'phone_screen_shown', status: 'started' });
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
              endAdornment: isFieldPrefilled('firstName') ? (
                <InputAdornment position="end">
                  <Chip label="Pre-filled" size="small" color="info" variant="outlined" />
                </InputAdornment>
              ) : undefined,
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
            InputProps={{
              endAdornment: isFieldPrefilled('fatherName') ? (
                <InputAdornment position="end">
                  <Chip label="Pre-filled" size="small" color="info" variant="outlined" />
                </InputAdornment>
              ) : undefined,
            }}
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
              endAdornment: isFieldPrefilled('email') ? (
                <InputAdornment position="end">
                  <Chip label="Pre-filled" size="small" color="info" variant="outlined" />
                </InputAdornment>
              ) : undefined,
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
                <InputAdornment position="start" sx={{ mr: 0.5 }}>
                  <Typography variant="body1" color="text.secondary" sx={{ whiteSpace: 'nowrap', fontSize: '0.875rem' }}>
                    +91
                  </Typography>
                </InputAdornment>
              ),
              endAdornment: formData.personal.phoneVerified ? (
                <InputAdornment position="end" sx={{ ml: 0.5 }}>
                  <Chip
                    icon={<VerifiedOutlined sx={{ fontSize: 14 }} />}
                    label="Verified"
                    size="small"
                    color="success"
                    sx={{ height: 24, '& .MuiChip-label': { px: 0.75, fontSize: '0.75rem' } }}
                  />
                </InputAdornment>
              ) : formData.personal.phone.length === 10 ? (
                <InputAdornment position="end" sx={{ ml: 0.5 }}>
                  <Button size="small" variant="text" onClick={handleVerifyPhone} sx={{ minWidth: 'auto', px: 1 }}>
                    Verify
                  </Button>
                </InputAdornment>
              ) : undefined,
              sx: { '& input': { minWidth: 0 } },
            }}
            error={
              !formData.personal.phoneVerified &&
              formData.personal.phone.length > 0 &&
              formData.personal.phone.length !== 10
            }
            helperText={
              !formData.personal.phoneVerified &&
              formData.personal.phone.length > 0 &&
              formData.personal.phone.length !== 10
                ? 'Please enter a valid 10-digit number'
                : !formData.personal.phoneVerified
                ? 'Enter your 10-digit number and click Verify'
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

        {/* Pincode */}
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Pincode"
            required
            value={formData.location.pincode}
            onChange={(e) => handlePincodeChange(e.target.value)}
            placeholder="600001"
            inputProps={{
              inputMode: 'numeric',
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
              ) : undefined,
            }}
            error={!!pincodeError}
            helperText={pincodeError || 'Enter 6-digit pincode for auto-fill'}
          />
        </Grid>

        {/* State */}
        <Grid item xs={12} sm={6}>
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
                ) : undefined,
            }}
          />
        </Grid>

        {/* City */}
        <Grid item xs={12} sm={6}>
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
                ) : undefined,
            }}
          />
        </Grid>

        {/* Address */}
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
