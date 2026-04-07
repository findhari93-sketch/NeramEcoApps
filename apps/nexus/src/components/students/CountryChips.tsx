'use client';

import { Box, Chip, alpha, useTheme } from '@neram/ui';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import type { GeographicCountryNode } from '@neram/database';

interface CountryChipsProps {
  countries: GeographicCountryNode[];
  selectedCountry: string | null;
  onSelect: (country: string | null) => void;
}

export default function CountryChips({ countries, selectedCountry, onSelect }: CountryChipsProps) {
  const theme = useTheme();

  if (countries.length <= 1) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1,
        mb: 2,
        overflowX: 'auto',
        pb: 0.5,
        '&::-webkit-scrollbar': { display: 'none' },
        scrollbarWidth: 'none',
      }}
    >
      {/* All chip */}
      <Chip
        icon={<PublicOutlinedIcon />}
        label="All"
        variant={selectedCountry === null ? 'filled' : 'outlined'}
        color="primary"
        onClick={() => onSelect(null)}
        sx={{
          fontWeight: 600,
          flexShrink: 0,
          minHeight: 40,
          cursor: 'pointer',
          '& .MuiChip-label': { px: 1.5 },
        }}
      />

      {countries.map((c) => {
        const isSelected = selectedCountry === c.country;
        return (
          <Chip
            key={c.country}
            label={`${c.country_display} (${c.student_count})`}
            variant={isSelected ? 'filled' : 'outlined'}
            color={isSelected ? 'primary' : 'default'}
            onClick={() => onSelect(isSelected ? null : c.country)}
            sx={{
              fontWeight: 600,
              flexShrink: 0,
              minHeight: 40,
              cursor: 'pointer',
              '& .MuiChip-label': { px: 1.5 },
              ...(!isSelected && {
                '&:hover': {
                  backgroundColor: alpha(theme.palette.primary.main, 0.08),
                  borderColor: theme.palette.primary.main,
                },
              }),
            }}
          />
        );
      })}
    </Box>
  );
}
