'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Stack,
  TextField,
  Typography,
  FormControl,
  IconButton,
  InputAdornment,
  Chip,
  Alert,
  Button,
  CircularProgress,
  MenuItem,
  Select,
  InputLabel,
  ToggleButton,
  ToggleButtonGroup,
} from '@neram/ui';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import MyLocationOutlined from '@mui/icons-material/MyLocationOutlined';
import VerifiedOutlined from '@mui/icons-material/VerifiedOutlined';
import { useTranslations } from 'next-intl';
import StepHeading from '../StepHeading';
import { useFormContext } from '../FormContext';
import { SUPPORTED_COUNTRIES, getCountryConfig } from '../countryConfig';

/**
 * Step 1, About you. Every field is one row on a phone. The browser's
 * location is asked for only when the student presses the button; the PIN
 * code is the primary way to find the city and state, and both stay editable.
 */
export default function AboutYouStep() {
  const t = useTranslations('apply');
  const {
    formData,
    updateFormData,
    isFieldPrefilled,
    setShowPhoneVerification,
    markApplicationStarted,
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
            const detectedCity = data.address.city || data.address.town || data.address.village || '';
            const detectedState = data.address.state || '';
            const detectedDistrict = data.address.county || data.address.state_district || '';
            const detectedPincode = data.address.postcode || '';
            const detectedCountryCode = data.address.country_code?.toUpperCase() || null;

            // Store detected location separately (for admin visibility)
            updateFormData('location', {
              detectedLocation: {
                pincode: detectedPincode,
                city: detectedCity,
                state: detectedState,
                district: detectedDistrict,
                country: detectedCountryCode,
              },
            });

            // Auto-detect country if it matches a supported country
            const supportedCodes = SUPPORTED_COUNTRIES.map((c) => c.code);
            if (detectedCountryCode && supportedCodes.includes(detectedCountryCode)) {
              updateFormData('location', { country: detectedCountryCode });
            }

            // Only fill EMPTY fields — never override user-entered data
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
        setGeoError(t('aboutYou.locationFailed'));
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

  const prefilledChip = (field: string) =>
    isFieldPrefilled(field) ? (
      <InputAdornment position="end">
        <Chip label={t('aboutYou.prefilled')} size="small" color="info" variant="outlined" />
      </InputAdornment>
    ) : undefined;

  const phoneLengthOk = formData.personal.phone.length === countryConfig.phoneLength;
  const phonePartial = !formData.personal.phoneVerified && formData.personal.phone.length > 0 && !phoneLengthOk;
  const pinFound =
    !!formData.location.city && !!formData.location.state && formData.location.locationSource === 'pincode';

  return (
    <Box>
      <StepHeading title={t('aboutYou.title')} subtitle={t('aboutYou.subtitle')} />

      <Stack spacing={2.5}>
        {/* Student name */}
        <TextField
          fullWidth
          label={t('aboutYou.studentName')}
          required
          value={formData.personal.firstName}
          onChange={(e) => {
            markApplicationStarted();
            updateFormData('personal', { firstName: e.target.value });
          }}
          helperText={t('aboutYou.studentNameHelper')}
          InputProps={{ endAdornment: prefilledChip('firstName') }}
          inputProps={{ minLength: 2, name: 'firstName', autoComplete: 'given-name' }}
        />

        {/* Father's name */}
        <TextField
          fullWidth
          label={t('aboutYou.fatherName')}
          required
          value={formData.personal.fatherName}
          onChange={(e) => updateFormData('personal', { fatherName: e.target.value })}
          helperText={t('aboutYou.fatherNameHelper')}
          InputProps={{ endAdornment: prefilledChip('fatherName') }}
          inputProps={{ minLength: 2, name: 'fatherName' }}
        />

        {/* Date of birth */}
        <TextField
          fullWidth
          label={t('aboutYou.dateOfBirth')}
          type="date"
          required
          value={formData.personal.dateOfBirth}
          onChange={(e) => updateFormData('personal', { dateOfBirth: e.target.value })}
          InputLabelProps={{ shrink: true }}
          inputProps={{ max: new Date().toISOString().split('T')[0], name: 'dateOfBirth' }}
        />

        {/* Gender, optional */}
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }} id="gender-label">
            {t('aboutYou.gender')}
          </Typography>
          <ToggleButtonGroup
            exclusive
            fullWidth
            aria-labelledby="gender-label"
            value={formData.personal.gender || null}
            onChange={(_, value: 'male' | 'female' | 'other' | null) =>
              updateFormData('personal', { gender: value ?? '' })
            }
            sx={{ '& .MuiToggleButton-root': { minHeight: 48, textTransform: 'none' } }}
          >
            <ToggleButton value="male">{t('aboutYou.genderMale')}</ToggleButton>
            <ToggleButton value="female">{t('aboutYou.genderFemale')}</ToggleButton>
            <ToggleButton value="other">{t('aboutYou.genderOther')}</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Where you live */}
        <Box sx={{ mt: 1 }}>
          <Typography variant="h6" component="h2" fontWeight={600}>
            {t('aboutYou.location')}
          </Typography>
          {geoError && (
            <Alert severity="info" role="alert" sx={{ mt: 1 }}>
              {geoError}
            </Alert>
          )}
        </Box>

        <FormControl fullWidth>
          <InputLabel>{t('aboutYou.country')}</InputLabel>
          <Select
            value={formData.location.country}
            label={t('aboutYou.country')}
            onChange={(e) => handleCountryChange(e.target.value as string)}
            inputProps={{ name: 'country' }}
          >
            {SUPPORTED_COUNTRIES.map((c) => (
              <MenuItem key={c.code} value={c.code}>
                {c.flag} {c.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* PIN code, with the location button under it */}
        <Box>
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
              name: 'pincode',
              autoComplete: 'postal-code',
            }}
            InputProps={{
              endAdornment: isPincodeLooking ? (
                <InputAdornment position="end">
                  <CircularProgress size={20} />
                </InputAdornment>
              ) : pinFound && !isLocationEditable && countryConfig.postalCode.lookupSupported ? (
                <InputAdornment position="end">
                  <CheckCircleOutlined color="success" aria-hidden />
                </InputAdornment>
              ) : null,
            }}
            error={!!pincodeError}
            helperText={
              pincodeError ||
              (pinFound
                ? t('aboutYou.pinFound', { city: formData.location.city, state: formData.location.state })
                : countryConfig.postalCode.helperText)
            }
          />
          <Button
            variant="text"
            size="small"
            startIcon={isGeolocating ? <CircularProgress size={16} /> : <MyLocationOutlined />}
            onClick={requestGeolocation}
            disabled={isGeolocating}
            sx={{ mt: 1, minHeight: 44 }}
          >
            {isGeolocating ? t('aboutYou.detecting') : t('aboutYou.useMyLocation')}
          </Button>
        </Box>

        {/* State */}
        {countryConfig.locationFields.stateOptions ? (
          <FormControl fullWidth required={countryConfig.locationFields.stateRequired}>
            <InputLabel>{countryConfig.locationFields.stateLabel}</InputLabel>
            <Select
              value={formData.location.state}
              label={countryConfig.locationFields.stateLabel}
              onChange={(e) =>
                updateFormData('location', { state: e.target.value as string, locationSource: 'manual' })
              }
              inputProps={{ name: 'state' }}
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
            inputProps={{ name: 'state' }}
            InputProps={{
              endAdornment:
                !isLocationEditable && formData.location.state ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setIsLocationEditable(true)} aria-label={t('review.editShort')} sx={{ minWidth: 44, minHeight: 44 }}>
                      <EditOutlined fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
            }}
          />
        )}

        {/* City */}
        <TextField
          fullWidth
          label={t('aboutYou.city')}
          required={countryConfig.locationFields.cityRequired}
          value={formData.location.city}
          onChange={(e) => updateFormData('location', { city: e.target.value })}
          disabled={!isLocationEditable && !!formData.location.city && countryConfig.postalCode.lookupSupported}
          inputProps={{ name: 'city', autoComplete: 'address-level2' }}
          InputProps={{
            endAdornment:
              !isLocationEditable && formData.location.city && countryConfig.postalCode.lookupSupported ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setIsLocationEditable(true)} aria-label={t('review.editShort')} sx={{ minWidth: 44, minHeight: 44 }}>
                    <EditOutlined fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
          }}
        />

        {/* Address, optional */}
        <TextField
          fullWidth
          label={t('aboutYou.address')}
          multiline
          rows={2}
          value={formData.location.address}
          onChange={(e) => updateFormData('location', { address: e.target.value })}
          helperText={t('aboutYou.addressHelper')}
          inputProps={{ name: 'address', autoComplete: 'street-address' }}
        />

        {/* Mobile number with Verify */}
        <TextField
          fullWidth
          label={t('aboutYou.phone')}
          required
          value={formData.personal.phone}
          onChange={(e) => handlePhoneChange(e.target.value)}
          placeholder={countryConfig.phonePlaceholder}
          inputProps={{
            inputMode: 'numeric',
            pattern: '[0-9]*',
            maxLength: countryConfig.phoneLength,
            name: 'phone',
            autoComplete: 'tel-national',
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
                  label={t('aboutYou.verified')}
                  size="small"
                  color="success"
                  sx={{ height: 24, '& .MuiChip-label': { px: 0.75, fontSize: '0.75rem' } }}
                />
              </InputAdornment>
            ) : phoneLengthOk ? (
              <InputAdornment position="end" sx={{ ml: 0.5 }}>
                <Button size="small" variant="text" onClick={handleVerifyPhone} sx={{ minWidth: 'auto', px: 1, minHeight: 44 }}>
                  {t('aboutYou.verify')}
                </Button>
              </InputAdornment>
            ) : null,
            sx: { '& input': { minWidth: 0 } },
          }}
          error={phonePartial}
          helperText={
            phonePartial
              ? t('aboutYou.phoneInvalid', { length: countryConfig.phoneLength })
              : !formData.personal.phoneVerified
              ? t('aboutYou.phoneHelper')
              : ''
          }
        />

        {/* Parent or guardian mobile, optional */}
        <TextField
          fullWidth
          label={t('aboutYou.parentPhone')}
          value={formData.personal.parentPhone}
          onChange={(e) =>
            updateFormData('personal', {
              parentPhone: e.target.value.replace(/\D/g, '').slice(0, countryConfig.phoneLength),
            })
          }
          inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: countryConfig.phoneLength, name: 'parentPhone' }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start" sx={{ mr: 0.5 }}>
                <Typography variant="body1" color="text.secondary" sx={{ whiteSpace: 'nowrap', fontSize: '0.875rem' }}>
                  {countryConfig.phonePrefix}
                </Typography>
              </InputAdornment>
            ),
          }}
        />

        {/* Email, optional */}
        <TextField
          fullWidth
          label={t('aboutYou.email')}
          type="email"
          value={formData.personal.email}
          onChange={(e) => updateFormData('personal', { email: e.target.value })}
          InputProps={{ endAdornment: prefilledChip('email') }}
          inputProps={{ name: 'email', autoComplete: 'email' }}
        />
      </Stack>
    </Box>
  );
}
