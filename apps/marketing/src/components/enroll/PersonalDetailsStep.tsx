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
  Menu,
  Select,
  InputLabel,
} from '@neram/ui';
import ButtonBase from '@mui/material/ButtonBase';
import { CheckCircleOutlined, VerifiedOutlined, ExpandMore } from '@mui/icons-material';
import { GENDER_OPTIONS } from '@/components/apply/types';
import type { PersonalInfoData, LocationData } from '@/components/apply/types';
import { SUPPORTED_COUNTRIES, getCountryConfig } from '@/components/apply/countryConfig';
import { splitEnrolPhone, joinEnrolPhone } from './enrolPhone';

interface PersonalDetailsStepProps {
  personal: PersonalInfoData;
  location: LocationData;
  updatePersonal: (data: Partial<PersonalInfoData>) => void;
  updateLocation: (data: Partial<LocationData>) => void;
  phoneVerified: boolean;
  onVerifyPhone: () => void;
}

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

export default function PersonalDetailsStep({
  personal,
  location,
  updatePersonal,
  updateLocation,
  phoneVerified,
  onVerifyPhone,
}: PersonalDetailsStepProps) {
  const [isPincodeLooking, setIsPincodeLooking] = useState(false);

  // Mobile: India or a Gulf country. A new code is a new number, so it clears the digits.
  const [countryAnchor, setCountryAnchor] = useState<HTMLElement | null>(null);
  const phoneParts = splitEnrolPhone(personal.phone, personal.phoneCountry);
  const phoneConfig = getCountryConfig(phoneParts.phoneCountry);
  const phoneIncomplete = !!phoneParts.phone && !phoneConfig.phonePattern.test(phoneParts.phone);

  // Auto-lookup pincode
  const handlePincodeChange = useCallback(async (pincode: string) => {
    updateLocation({ pincode });
    if (pincode.length === 6) {
      setIsPincodeLooking(true);
      try {
        const res = await fetch(`/api/pincode/${pincode}`);
        const data = await res.json();
        if (data.success && data.data) {
          updateLocation({
            city: data.data.city || '',
            state: data.data.state || '',
            district: data.data.district || '',
          });
        }
      } catch { /* ignore */ }
      setIsPincodeLooking(false);
    }
  }, [updateLocation]);

  return (
    <Box>
      <Typography variant="h6" fontWeight={600} mb={2}>
        Personal Information
      </Typography>

      <Grid container spacing={2}>
        {/* First Name */}
        <Grid item xs={12} sm={6}>
          <TextField
            label="First Name"
            required
            fullWidth
            value={personal.firstName}
            onChange={(e) => updatePersonal({ firstName: e.target.value })}
            size="medium"
          />
        </Grid>

        {/* Father's Name */}
        <Grid item xs={12} sm={6}>
          <TextField
            label="Father's Name"
            fullWidth
            value={personal.fatherName}
            onChange={(e) => updatePersonal({ fatherName: e.target.value })}
            size="medium"
          />
        </Grid>

        {/* Email (read-only from Google) */}
        <Grid item xs={12} sm={6}>
          <TextField
            label="Email"
            fullWidth
            value={personal.email}
            InputProps={{ readOnly: true }}
            helperText="From your Google account"
            size="medium"
          />
        </Grid>

        {/* Phone with verify button */}
        <Grid item xs={12} sm={6}>
          <TextField
            label="Phone Number"
            type="tel"
            fullWidth
            value={phoneParts.phone}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, phoneConfig.phoneLength);
              updatePersonal({ phone: joinEnrolPhone(digits, phoneConfig.code), phoneCountry: phoneConfig.code });
            }}
            error={phoneIncomplete}
            helperText={phoneIncomplete ? `Enter the ${phoneConfig.phoneLength}-digit ${phoneConfig.name} mobile number` : 'India or a Gulf number. Tap the code to change it.'}
            size="medium"
            inputProps={{ inputMode: 'numeric', autoComplete: 'tel-national', maxLength: phoneConfig.phoneLength }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start" sx={{ mr: 0.5 }}>
                  <ButtonBase
                    onClick={(e) => setCountryAnchor(e.currentTarget)}
                    aria-haspopup="menu"
                    aria-label={`Country code ${phoneConfig.phonePrefix}, ${phoneConfig.name}. Change`}
                    sx={{
                      minWidth: 64,
                      minHeight: 48,
                      px: 1,
                      ml: -1,
                      gap: 0.25,
                      borderRadius: 1,
                      fontSize: 16,
                      fontWeight: 700,
                      color: 'text.primary',
                      '&:hover': { bgcolor: 'action.hover' },
                      '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main' },
                    }}
                  >
                    {phoneConfig.phonePrefix}
                    <ExpandMore aria-hidden sx={{ fontSize: 18, color: 'text.secondary' }} />
                  </ButtonBase>
                  <Menu anchorEl={countryAnchor} open={!!countryAnchor} onClose={() => setCountryAnchor(null)}>
                    {SUPPORTED_COUNTRIES.map((c) => (
                      <MenuItem
                        key={c.code}
                        selected={c.code === phoneConfig.code}
                        onClick={() => {
                          setCountryAnchor(null);
                          if (c.code !== phoneConfig.code) updatePersonal({ phone: '', phoneCountry: c.code });
                        }}
                        sx={{ minHeight: 48, gap: 1.5 }}
                      >
                        <Box component="span" sx={{ fontWeight: 700, minWidth: 48 }}>
                          {c.phonePrefix}
                        </Box>
                        {c.name}
                      </MenuItem>
                    ))}
                  </Menu>
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  {phoneVerified ? (
                    <Chip
                      icon={<VerifiedOutlined />}
                      label="Verified"
                      size="small"
                      color="success"
                      variant="outlined"
                    />
                  ) : (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={onVerifyPhone}
                      sx={{ borderRadius: 1, textTransform: 'none', minHeight: 44 }}
                    >
                      Verify
                    </Button>
                  )}
                </InputAdornment>
              ),
            }}
          />
        </Grid>

        {/* Parent's Phone Number */}
        <Grid item xs={12} sm={6}>
          <TextField
            label="Parent's Phone Number"
            fullWidth
            value={personal.parentPhone}
            onChange={(e) => updatePersonal({ parentPhone: e.target.value })}
            size="medium"
            placeholder="+91 9876543210"
            helperText="Parent or guardian contact number"
          />
        </Grid>

        {/* Date of Birth */}
        <Grid item xs={12} sm={6}>
          <TextField
            label="Date of Birth"
            type="date"
            fullWidth
            value={personal.dateOfBirth}
            onChange={(e) => updatePersonal({ dateOfBirth: e.target.value })}
            InputLabelProps={{ shrink: true }}
            size="medium"
          />
        </Grid>

        {/* Gender */}
        <Grid item xs={12} sm={6}>
          <TextField
            select
            label="Gender"
            fullWidth
            value={personal.gender}
            onChange={(e) => updatePersonal({ gender: e.target.value as any })}
            size="medium"
          >
            {GENDER_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
      </Grid>

      {/* Phone verification alert */}
      {!phoneVerified && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          Phone verification is required to complete enrollment. Please verify your phone number.
        </Alert>
      )}

      {/* Location Section */}
      <Typography variant="h6" fontWeight={600} mt={4} mb={2}>
        Address
      </Typography>

      <Grid container spacing={2}>
        {/* Pincode */}
        <Grid item xs={12} sm={4}>
          <TextField
            label="Pincode"
            fullWidth
            value={location.pincode}
            onChange={(e) => handlePincodeChange(e.target.value)}
            inputProps={{ maxLength: 6 }}
            InputProps={{
              endAdornment: isPincodeLooking ? (
                <InputAdornment position="end">
                  <CircularProgress size={16} />
                </InputAdornment>
              ) : null,
            }}
            size="medium"
          />
        </Grid>

        {/* City */}
        <Grid item xs={12} sm={4}>
          <TextField
            label="City"
            fullWidth
            value={location.city}
            onChange={(e) => updateLocation({ city: e.target.value })}
            size="medium"
          />
        </Grid>

        {/* District */}
        <Grid item xs={12} sm={4}>
          <TextField
            label="District"
            fullWidth
            value={location.district}
            onChange={(e) => updateLocation({ district: e.target.value })}
            size="medium"
          />
        </Grid>

        {/* State */}
        <Grid item xs={12} sm={6}>
          <TextField
            select
            label="State"
            fullWidth
            value={location.state}
            onChange={(e) => updateLocation({ state: e.target.value })}
            size="medium"
          >
            {INDIAN_STATES.map((state) => (
              <MenuItem key={state} value={state}>
                {state}
              </MenuItem>
            ))}
          </TextField>
        </Grid>

        {/* Address */}
        <Grid item xs={12} sm={6}>
          <TextField
            label="Full Address"
            fullWidth
            value={location.address}
            onChange={(e) => updateLocation({ address: e.target.value })}
            size="medium"
            multiline
            rows={2}
          />
        </Grid>
      </Grid>
    </Box>
  );
}
