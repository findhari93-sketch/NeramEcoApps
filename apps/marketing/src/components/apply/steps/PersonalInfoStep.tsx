'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
  MenuItem,
  Select,
  InputLabel,
} from '@neram/ui';
import {
  CheckCircleOutlined,
  EditOutlined,
  MyLocationOutlined,
  VerifiedOutlined,
} from '@mui/icons-material';
import { useFormContext } from '../FormContext';
import { GENDER_OPTIONS } from '../types';
import { SUPPORTED_COUNTRIES, getCountryConfig } from '../countryConfig';

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

  const countryConfig = useMemo(
    () => getCountryConfig(formData.location.country),
    [formData.location.country]
  );

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
            // Auto-detect country if it matches a supported country
            const detectedCountryCode = data.address.country_code?.toUpperCase();
            const supportedCodes = SUPPORTED_COUNTRIES.map((c) => c.code);
            if (detectedCountryCode && supportedCodes.includes(detectedCountryCode)) {
              updateFormData('location', { country: detectedCountryCode });
            }

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

  // Postal code lookup
  const lookupPincode = useCallback(
    async (pincode: string, country: string) => {
      const config = getCountryConfig(country);
      if (!config.postalCode.lookupSupported) return;
      if (config.postalCode.format && !config.postalCode.format.test(pincode)) return;

      setIsPincodeLooking(true);
      setPincodeError(null);

      try {
        const response = await fetch(`/api/pincode/${pincode}?country=${country}`);
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
          setPincodeError(data.error || 'Could not find location for this postal code');
          setIsLocationEditable(true);
        }
      } catch {
        setPincodeError('Failed to lookup postal code. Please enter location manually.');
        setIsLocationEditable(true);
      } finally {
        setIsPincodeLooking(false);
      }
    },
    [updateFormData]
  );

  const handlePincodeChange = (value: string) => {
    const isNumeric = countryConfig.postalCode.inputMode === 'numeric';
    const cleaned = isNumeric
      ? value.replace(/\D/g, '').slice(0, countryConfig.postalCode.maxLength)
      : value.replace(/[^A-Z0-9]/gi, '').slice(0, countryConfig.postalCode.maxLength);

    updateFormData('location', { pincode: cleaned });
    setPincodeError(null);

    // Auto-lookup when the postal code matches the expected format
    if (
      countryConfig.postalCode.lookupSupported &&
      countryConfig.postalCode.format &&
      countryConfig.postalCode.format.test(cleaned)
    ) {
      lookupPincode(cleaned, formData.location.country);
    }
  };

  const handleCountryChange = (newCountry: string) => {
    updateFormData('location', {
      country: newCountry,
      pincode: '',
      city: '',
      state: '',
      district: '',
    });
    setPincodeError(null);
    setIsLocationEditable(false);
    // Only reset phone if it's NOT already verified
    if (!formData.personal.phoneVerified) {
      updateFormData('personal', { phone: '', phoneVerified: false, phoneVerifiedAt: null });
    }
  };

  const handlePhoneChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, countryConfig.phoneLength);
    updateFormData('personal', { phone: cleaned, phoneVerified: false, phoneVerifiedAt: null });
  };

  const handleVerifyPhone = () => {
    if (formData.personal.phone.length === countryConfig.phoneLength) {
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
            InputProps={{
              endAdornment: isFieldPrefilled('fatherName') && (
                <InputAdornment position="end">
                  <Chip label="Pre-filled" size="small" color="info" variant="outlined" />
                </InputAdornment>
              ),
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
            placeholder={countryConfig.phonePlaceholder}
            inputProps={{
              inputMode: 'numeric',
              pattern: '[0-9]*',
              maxLength: countryConfig.phoneLength,
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start" sx={{ mr: 0.5 }}>
                  <Typography variant="body1" color="text.secondary" sx={{ whiteSpace: 'nowrap', fontSize: '0.875rem' }}>
                    {countryConfig.phonePrefix}
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
              ) : formData.personal.phone.length === countryConfig.phoneLength ? (
                <InputAdornment position="end" sx={{ ml: 0.5 }}>
                  <Button size="small" variant="text" onClick={handleVerifyPhone} sx={{ minWidth: 'auto', px: 1 }}>
                    Verify
                  </Button>
                </InputAdornment>
              ) : null,
              sx: { '& input': { minWidth: 0 } },
            }}
            error={
              !formData.personal.phoneVerified &&
              formData.personal.phone.length > 0 &&
              formData.personal.phone.length !== countryConfig.phoneLength
            }
            helperText={
              !formData.personal.phoneVerified &&
              formData.personal.phone.length > 0 &&
              formData.personal.phone.length !== countryConfig.phoneLength
                ? `Please enter a valid ${countryConfig.phoneLength}-digit number`
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

        {/* Country Selector */}
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth>
            <InputLabel>Country</InputLabel>
            <Select
              value={formData.location.country}
              label="Country"
              onChange={(e) => handleCountryChange(e.target.value as string)}
            >
              {SUPPORTED_COUNTRIES.map((c) => (
                <MenuItem key={c.code} value={c.code}>
                  {c.flag} {c.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        {/* Postal Code */}
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label={countryConfig.postalCode.label}
            required={countryConfig.postalCode.required}
            value={formData.location.pincode}
            onChange={(e) => handlePincodeChange(e.target.value)}
            placeholder={countryConfig.postalCode.placeholder}
            inputProps={{
              inputMode: countryConfig.postalCode.inputMode,
              maxLength: countryConfig.postalCode.maxLength,
            }}
            InputProps={{
              endAdornment: isPincodeLooking ? (
                <InputAdornment position="end">
                  <CircularProgress size={20} />
                </InputAdornment>
              ) : formData.location.city &&
                !isLocationEditable &&
                countryConfig.postalCode.lookupSupported ? (
                <InputAdornment position="end">
                  <CheckCircleOutlined color="success" />
                </InputAdornment>
              ) : null,
            }}
            error={!!pincodeError}
            helperText={pincodeError || countryConfig.postalCode.helperText}
          />
        </Grid>

        {/* State / Emirate / Region / Governorate / Municipality */}
        <Grid item xs={12} sm={6}>
          {countryConfig.locationFields.stateOptions ? (
            <FormControl fullWidth required={countryConfig.locationFields.stateRequired}>
              <InputLabel>{countryConfig.locationFields.stateLabel}</InputLabel>
              <Select
                value={formData.location.state}
                label={countryConfig.locationFields.stateLabel}
                onChange={(e) =>
                  updateFormData('location', { state: e.target.value as string, locationSource: 'manual' })
                }
              >
                {countryConfig.locationFields.stateOptions.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : (
            <TextField
              fullWidth
              label={countryConfig.locationFields.stateLabel}
              required={countryConfig.locationFields.stateRequired}
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
          )}
        </Grid>

        {/* City - Auto-filled or manual */}
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="City"
            required={countryConfig.locationFields.cityRequired}
            value={formData.location.city}
            onChange={(e) => updateFormData('location', { city: e.target.value })}
            disabled={
              !isLocationEditable &&
              !!formData.location.city &&
              countryConfig.postalCode.lookupSupported
            }
            InputProps={{
              endAdornment:
                !isLocationEditable &&
                formData.location.city &&
                countryConfig.postalCode.lookupSupported ? (
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
