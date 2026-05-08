'use client';

import { useState, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  TextField,
  Slider,
  Chip,
  Alert,
} from '@mui/material';
import CalculateIcon from '@mui/icons-material/Calculate';

const PRIMARY_GREEN = '#0d7a4a';

function clamp(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export default function NataMeritCalculator() {
  const [nataRaw, setNataRaw] = useState<number>(120);
  const [qualifyingPercent, setQualifyingPercent] = useState<number>(75);

  const result = useMemo(() => {
    const nata = clamp(nataRaw, 0, 200);
    const pct = clamp(qualifyingPercent, 0, 100);
    const qualifyingScaled = (pct / 100) * 200;
    const total = nata + qualifyingScaled;
    return {
      nata: Math.round(nata * 100) / 100,
      qualifyingScaled: Math.round(qualifyingScaled * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  }, [nataRaw, qualifyingPercent]);

  const band =
    result.total >= 320
      ? { label: 'Strong', color: '#15803d' }
      : result.total >= 260
        ? { label: 'Competitive', color: '#0d7a4a' }
        : result.total >= 200
          ? { label: 'Borderline', color: '#a16207' }
          : { label: 'Below average', color: '#b91c1c' };

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, md: 2.5 },
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: '#f0fdf4',
      }}
    >
      <Stack direction="row" gap={1} alignItems="center" sx={{ mb: 1.5 }}>
        <CalculateIcon sx={{ color: PRIMARY_GREEN }} />
        <Typography variant="subtitle1" fontWeight={800}>
          KEAM B.Arch Merit Calculator
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Enter your NATA score (out of 200) and your 10+2 percentage. We add them together using the official 50:50 formula to give you a rank index out of 400.
      </Typography>

      <Stack spacing={2.5}>
        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.5 }}>
            <Typography variant="body2" fontWeight={700}>
              NATA score (out of 200)
            </Typography>
            <Chip
              label={`${result.nata} / 200`}
              size="small"
              sx={{ bgcolor: PRIMARY_GREEN, color: 'white', fontWeight: 700 }}
            />
          </Stack>
          <Stack direction="row" gap={2} alignItems="center">
            <Slider
              value={nataRaw}
              onChange={(_, v) => setNataRaw(Array.isArray(v) ? v[0] : v)}
              min={0}
              max={200}
              step={1}
              sx={{ color: PRIMARY_GREEN, flex: 1 }}
            />
            <TextField
              type="number"
              value={Number.isFinite(nataRaw) ? nataRaw : 0}
              onChange={(e) => setNataRaw(parseFloat(e.target.value))}
              size="small"
              sx={{ width: 90 }}
              inputProps={{ min: 0, max: 200, step: 1, inputMode: 'numeric' }}
            />
          </Stack>
        </Box>

        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.5 }}>
            <Typography variant="body2" fontWeight={700}>
              10+2 percentage
            </Typography>
            <Chip
              label={`${qualifyingPercent}% → ${result.qualifyingScaled} / 200`}
              size="small"
              sx={{ bgcolor: PRIMARY_GREEN, color: 'white', fontWeight: 700 }}
            />
          </Stack>
          <Stack direction="row" gap={2} alignItems="center">
            <Slider
              value={qualifyingPercent}
              onChange={(_, v) => setQualifyingPercent(Array.isArray(v) ? v[0] : v)}
              min={0}
              max={100}
              step={1}
              sx={{ color: PRIMARY_GREEN, flex: 1 }}
            />
            <TextField
              type="number"
              value={Number.isFinite(qualifyingPercent) ? qualifyingPercent : 0}
              onChange={(e) => setQualifyingPercent(parseFloat(e.target.value))}
              size="small"
              sx={{ width: 90 }}
              inputProps={{ min: 0, max: 100, step: 1, inputMode: 'decimal' }}
            />
          </Stack>
        </Box>
      </Stack>

      <Box
        sx={{
          mt: 2.5,
          p: 2,
          borderRadius: 2,
          bgcolor: 'background.paper',
          border: `2px solid ${PRIMARY_GREEN}`,
        }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          Your KEAM B.Arch rank index
        </Typography>
        <Stack direction="row" alignItems="baseline" gap={1} flexWrap="wrap">
          <Typography variant="h4" fontWeight={900} sx={{ color: PRIMARY_GREEN }}>
            {result.total}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            / 400
          </Typography>
          <Chip
            label={band.label}
            size="small"
            sx={{ bgcolor: band.color, color: 'white', fontWeight: 700, ml: 'auto' }}
          />
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {result.nata} (NATA) + {result.qualifyingScaled} (12th scaled) = {result.total}
        </Typography>
      </Box>

      <Alert severity="info" sx={{ mt: 2, borderRadius: 1.5 }}>
        This is an indicative score, not your actual rank. CEE publishes the official B.Arch rank list separately at cee.kerala.gov.in. (Clause 9.7.4(c))
      </Alert>
    </Paper>
  );
}
