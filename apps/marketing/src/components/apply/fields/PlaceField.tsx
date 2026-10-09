'use client';

import { Alert, Box, Button, CircularProgress, InputAdornment, MenuItem, Stack, TextField, Typography } from '@neram/ui';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import MyLocationOutlined from '@mui/icons-material/MyLocationOutlined';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import PublicOutlined from '@mui/icons-material/PublicOutlined';
import { useTranslations } from 'next-intl';
import { useFormContext } from '../FormContext';
import { OTHER_COUNTRY, SUPPORTED_COUNTRIES } from '../countryConfig';
import { useLocationLookup } from '../steps/useLocationLookup';
import Field from './Field';

const linkButtonSx = { minHeight: 44, px: 1, ml: -1, fontWeight: 700, justifyContent: 'flex-start' } as const;

/**
 * "Where you live". India: a PIN code, and the place it finds shown under it
 * with Edit. Abroad: a country and a city. No state lists anywhere.
 */
export default function PlaceField({ onTouched }: { onTouched?: () => void }) {
  const t = useTranslations('apply');
  const { formData, updateFormData } = useFormContext();
  const { location } = formData;
  const {
    isPincodeLooking,
    pincodeError,
    isPlaceEditable,
    setIsPlaceEditable,
    isGeolocating,
    geoError,
    requestGeolocation,
    handlePincodeChange,
    handleResidenceChange,
    editPlace,
  } = useLocationLookup();

  const inIndia = location.country === 'IN';
  const hasPlace = !!location.city.trim();
  const showPlaceLine = inIndia && hasPlace && !isPlaceEditable && !isPincodeLooking;
  const showPlaceInputs = inIndia && isPlaceEditable && !isPincodeLooking;
  const placeLine = [location.city, location.state, 'India'].filter(Boolean).join(', ');

  const touched = () => onTouched?.();

  return (
    <Box component="section" aria-labelledby="apply-place-heading">
      <Typography
        id="apply-place-heading"
        component="h2"
        sx={{ m: 0, mb: 1.5, fontSize: 16, fontWeight: 700, lineHeight: 1.3, color: 'text.primary' }}
      >
        {t('aboutYou.location')}
      </Typography>

      {inIndia ? (
        <Stack spacing={1.5}>
          <Field
            id="apply-pincode"
            label={t('aboutYou.pinCode')}
            error={!!pincodeError}
            helper={pincodeError || undefined}
          >
            <TextField
              id="apply-pincode"
              fullWidth
              hiddenLabel
              placeholder={t('aboutYou.pinPlaceholder')}
              value={location.pincode}
              onChange={(e) => {
                touched();
                handlePincodeChange(e.target.value);
              }}
              error={!!pincodeError}
              inputProps={{
                inputMode: 'numeric',
                pattern: '[0-9]*',
                maxLength: 6,
                name: 'pincode',
                autoComplete: 'postal-code',
                'aria-required': true,
                'aria-describedby': pincodeError ? 'apply-pincode-helper' : undefined,
              }}
              InputProps={{
                endAdornment: isPincodeLooking ? (
                  <InputAdornment position="end">
                    <CircularProgress size={20} aria-label={t('aboutYou.pinLooking')} />
                  </InputAdornment>
                ) : showPlaceLine && location.locationSource !== 'manual' ? (
                  <InputAdornment position="end">
                    <CheckCircleOutlined color="success" aria-hidden />
                  </InputAdornment>
                ) : null,
              }}
            />
          </Field>

          <Box aria-live="polite">
            {showPlaceLine && (
              <Box
                data-testid="apply-place-line"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  pl: 1.5,
                  pr: 0.5,
                  minHeight: 52,
                  bgcolor: '#f4f3ef',
                  borderLeft: '3px solid',
                  borderColor: 'primary.main',
                }}
              >
                <PlaceOutlined aria-hidden sx={{ fontSize: 20, color: 'text.secondary', flex: 'none' }} />
                <Typography sx={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, overflowWrap: 'anywhere' }}>
                  {placeLine}
                </Typography>
                <Button
                  size="small"
                  variant="text"
                  startIcon={<EditOutlined fontSize="small" />}
                  onClick={() => setIsPlaceEditable(true)}
                  aria-label={t('aboutYou.editPlace')}
                  sx={{ flex: 'none', minHeight: 44, minWidth: 44, fontWeight: 700 }}
                >
                  {t('review.editShort')}
                </Button>
              </Box>
            )}
          </Box>

          {showPlaceInputs && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: { xs: 2, sm: 2 }, alignItems: 'start' }}>
              <Field id="apply-city" label={t('aboutYou.city')}>
                <TextField
                  id="apply-city"
                  fullWidth
                  hiddenLabel
                  placeholder={t('aboutYou.cityPlaceholder')}
                  value={location.city}
                  onChange={(e) => {
                    touched();
                    editPlace({ city: e.target.value });
                  }}
                  inputProps={{ name: 'city', autoComplete: 'address-level2', 'aria-required': true }}
                />
              </Field>
              <Field id="apply-state" label={t('aboutYou.stateOptional')}>
                <TextField
                  id="apply-state"
                  fullWidth
                  hiddenLabel
                  value={location.state}
                  onChange={(e) => {
                    touched();
                    editPlace({ state: e.target.value });
                  }}
                  inputProps={{ name: 'state', autoComplete: 'address-level1' }}
                />
              </Field>
            </Box>
          )}

          <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2 }}>
            <Button
              variant="text"
              size="small"
              startIcon={isGeolocating ? <CircularProgress size={16} /> : <MyLocationOutlined />}
              onClick={requestGeolocation}
              disabled={isGeolocating}
              sx={linkButtonSx}
            >
              {isGeolocating ? t('aboutYou.detecting') : t('aboutYou.useMyLocationShort')}
            </Button>
            <Button
              variant="text"
              size="small"
              startIcon={<PublicOutlined />}
              onClick={() => {
                touched();
                handleResidenceChange('AE');
              }}
              sx={linkButtonSx}
            >
              {t('aboutYou.liveAbroad')}
            </Button>
          </Box>
          {geoError && (
            <Alert severity="info" role="alert">
              {geoError}
            </Alert>
          )}
        </Stack>
      ) : (
        <Stack spacing={2}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, alignItems: 'start' }}>
            <Field id="apply-country" label={t('aboutYou.country')}>
              <TextField
                id="apply-country"
                select
                fullWidth
                hiddenLabel
                value={location.country}
                onChange={(e) => {
                  touched();
                  handleResidenceChange(e.target.value);
                }}
                inputProps={{ name: 'country' }}
                SelectProps={{ labelId: 'apply-country-label' }}
              >
                {SUPPORTED_COUNTRIES.filter((c) => c.code !== 'IN').map((c) => (
                  <MenuItem key={c.code} value={c.code} sx={{ minHeight: 48 }}>
                    {c.name}
                  </MenuItem>
                ))}
                <MenuItem value={OTHER_COUNTRY} sx={{ minHeight: 48 }}>
                  {t('aboutYou.countryOther')}
                </MenuItem>
              </TextField>
            </Field>
            <Field id="apply-city" label={t('aboutYou.city')}>
              <TextField
                id="apply-city"
                fullWidth
                hiddenLabel
                placeholder={t('aboutYou.cityAbroadPlaceholder')}
                value={location.city}
                onChange={(e) => {
                  touched();
                  editPlace({ city: e.target.value });
                }}
                inputProps={{ name: 'city', autoComplete: 'address-level2', 'aria-required': true }}
              />
            </Field>
          </Box>
          {location.country === OTHER_COUNTRY && (
            <Field id="apply-country-name" label={t('aboutYou.countryName')}>
              <TextField
                id="apply-country-name"
                fullWidth
                hiddenLabel
                value={location.countryName}
                onChange={(e) => {
                  touched();
                  updateFormData('location', { countryName: e.target.value });
                }}
                inputProps={{ name: 'countryName', autoComplete: 'country-name', 'aria-required': true }}
              />
            </Field>
          )}
          <Box>
            <Button
              variant="text"
              size="small"
              startIcon={<PlaceOutlined />}
              onClick={() => {
                touched();
                handleResidenceChange('IN');
              }}
              sx={linkButtonSx}
            >
              {t('aboutYou.liveInIndia')}
            </Button>
          </Box>
        </Stack>
      )}
    </Box>
  );
}
