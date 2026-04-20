'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Chip, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import LocationOnIcon from '@mui/icons-material/LocationOn';

interface PincodeFieldProps {
  value: string;
  onChange: (pincode: string) => void;
  onResolve: (resolved: { pincode: string; city: string; state: string; country: string } | null) => void;
  label?: string;
  size?: 'small' | 'medium';
  disabled?: boolean;
  required?: boolean;
  manualCityFallback?: string;
  onManualCityChange?: (city: string) => void;
}

type Status = 'idle' | 'loading' | 'resolved' | 'error';

// Simple 6-digit Indian pincode field that calls /api/pincode/[code]
// and displays the resolved city + state under the input. Falls back to
// a free-text city input if the lookup fails.
export default function PincodeField({
  value,
  onChange,
  onResolve,
  label = 'Pincode',
  size = 'small',
  disabled = false,
  required = false,
  manualCityFallback = '',
  onManualCityChange,
}: PincodeFieldProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [resolved, setResolved] = useState<{ city: string; state: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (value.length !== 6) {
      setStatus('idle');
      setResolved(null);
      setError(null);
      onResolve(null);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      setStatus('loading');
      setError(null);
      try {
        const res = await fetch(`/api/pincode/${value}?country=IN`);
        const data = await res.json();
        if (data?.success && data?.data) {
          const city = (data.data.city || data.data.district || '').trim();
          const state = (data.data.state || '').trim();
          setResolved({ city, state });
          setStatus('resolved');
          onResolve({
            pincode: value,
            city,
            state,
            country: data.data.country || 'IN',
          });
        } else {
          setStatus('error');
          setError('Pincode not found. You can type your city manually below.');
          setResolved(null);
          onResolve(null);
        }
      } catch {
        setStatus('error');
        setError('Could not look up pincode. Please type your city manually.');
        setResolved(null);
        onResolve(null);
      }
    }, 300);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
    // Intentionally omit onResolve: parent refs can change between renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Stack gap={0.75}>
      <TextField
        label={required ? `${label} *` : `${label} (optional)`}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        fullWidth
        size={size}
        disabled={disabled}
        inputProps={{ inputMode: 'numeric', pattern: '[0-9]{6}' }}
        helperText="6-digit PIN code"
      />
      {status === 'loading' && (
        <Stack direction="row" gap={1} alignItems="center" sx={{ pl: 0.5 }}>
          <CircularProgress size={14} />
          <Typography variant="caption" color="text.secondary">
            Looking up pincode...
          </Typography>
        </Stack>
      )}
      {status === 'resolved' && resolved && (
        <Chip
          size="small"
          icon={<LocationOnIcon sx={{ fontSize: 16 }} />}
          label={`${resolved.city}, ${resolved.state}`}
          color="success"
          variant="outlined"
          sx={{ alignSelf: 'flex-start' }}
        />
      )}
      {status === 'error' && error && (
        <Box>
          <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 0.75 }}>
            {error}
          </Typography>
          {onManualCityChange && (
            <TextField
              label="Your city"
              value={manualCityFallback}
              onChange={(e) => onManualCityChange(e.target.value)}
              fullWidth
              size={size}
              disabled={disabled}
            />
          )}
        </Box>
      )}
    </Stack>
  );
}
