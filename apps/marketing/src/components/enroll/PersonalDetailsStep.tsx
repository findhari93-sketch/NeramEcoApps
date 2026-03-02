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
import { CheckCircleOutlined, VerifiedOutlined } from '@mui/icons-material';
import { GENDER_OPTIONS } from '@/components/apply/types';
import type { PersonalInfoData, LocationData } from '@/components/apply/types';

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

  // Auto-lookup pincode
  const handlePincodeChange = useCallback(async (pincode: string) => {
    updateLocation({ pincode });
    if (pincode.length === 6) {
      setIsPincodeLooking(true);
      try {
        const res = await fetch(`/api/pincode?pincode=${pincode}`);
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
            fullWidth
            value={personal.phone}
            onChange={(e) => updatePersonal({ phone: e.target.value })}
            size="medium"
            InputProps={{
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
                      sx={{ borderRadius: 1, textTransform: 'none' }}
                    >
                      Verify
                    </Button>
                  )}
                </InputAdornment>
              ),
            }}
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
