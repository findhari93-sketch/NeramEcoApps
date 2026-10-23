'use client';

import { useEffect, useState } from 'react';
import { Box, InputAdornment, Menu, MenuItem, TextField } from '@neram/ui';
import ButtonBase from '@mui/material/ButtonBase';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { MOBILE_COUNTRIES, mobileCountry, mobileParts, storedMobile } from '@neram/database/phone';

/** The code a value already carries, when it is a complete listed number. */
function countryOf(value: string): string | null {
  const t = value.trim();
  if (/^\d{10}$/.test(t)) return 'IN';
  return t.startsWith('+') && storedMobile(t) ? mobileParts(t).country.code : null;
}

/**
 * A mobile with its country code: India or the Gulf. The value is
 * "+<code><digits>" (empty while blank); prefilled 10-digit Indian numbers are
 * read as India. Pasting a full number such as "+971 55 199 3240" picks its
 * country by itself.
 */
export default function MobileField({
  label,
  value,
  onChange,
  onBlur,
  error,
  helperText,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: boolean;
  helperText?: string;
  required?: boolean;
}) {
  const [code, setCode] = useState(() => countryOf(value) || 'IN');
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const country = mobileCountry(code);

  // A number filled in from a picked person brings its own country.
  useEffect(() => {
    const found = countryOf(value);
    if (found) setCode(found);
  }, [value]);

  const trimmed = value.trim();
  const digits = trimmed.startsWith(country.prefix)
    ? trimmed.slice(country.prefix.length).replace(/\D/g, '')
    : trimmed.replace(/\D/g, '').slice(-country.length);

  const type = (raw: string) => {
    const typedDigits = raw.replace(/\D/g, '');
    // A whole number pasted in, with or without its code.
    if (raw.includes('+') || typedDigits.length > country.length) {
      const stored = storedMobile(raw.includes('+') ? raw : typedDigits);
      if (stored) {
        const parts = mobileParts(stored.startsWith('+') ? stored : `+91${stored}`);
        setCode(parts.country.code);
        onChange(`${parts.country.prefix}${parts.national}`);
        return;
      }
    }
    const next = typedDigits.slice(0, country.length);
    onChange(next ? `${country.prefix}${next}` : '');
  };

  return (
    <TextField
      label={label}
      required={required}
      fullWidth
      type="tel"
      value={digits}
      onChange={(e) => type(e.target.value)}
      onBlur={onBlur}
      error={error}
      helperText={helperText}
      inputProps={{ inputMode: 'numeric', autoComplete: 'tel-national' }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start" sx={{ mr: 0.5 }}>
            <ButtonBase
              onClick={(e) => setAnchor(e.currentTarget)}
              aria-haspopup="menu"
              aria-label={`Country code ${country.prefix}, ${country.name}. Change`}
              sx={{
                minWidth: 56,
                minHeight: 36,
                px: 0.75,
                ml: -0.75,
                gap: 0.25,
                borderRadius: 1,
                fontWeight: 600,
                color: 'text.primary',
                '&:hover': { bgcolor: 'action.hover' },
                '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main' },
              }}
            >
              {country.prefix}
              <ExpandMore aria-hidden sx={{ fontSize: 18, color: 'text.secondary' }} />
            </ButtonBase>
            <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
              {MOBILE_COUNTRIES.map((c) => (
                <MenuItem
                  key={c.code}
                  selected={c.code === country.code}
                  onClick={() => {
                    setAnchor(null);
                    if (c.code === country.code) return;
                    // A new code is a new number.
                    setCode(c.code);
                    onChange('');
                  }}
                  sx={{ minHeight: 40, gap: 1.5 }}
                >
                  <Box component="span" sx={{ fontWeight: 700, minWidth: 48 }}>
                    {c.prefix}
                  </Box>
                  {c.name}
                </MenuItem>
              ))}
            </Menu>
          </InputAdornment>
        ),
      }}
    />
  );
}
