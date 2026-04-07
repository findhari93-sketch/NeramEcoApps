'use client';

import { Box, Chip, Skeleton } from '@neram/ui';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import LocationCityOutlinedIcon from '@mui/icons-material/LocationCityOutlined';

interface GeographicSummaryBarProps {
  totalStudents: number;
  countryCount: number;
  stateCount: number;
  cityCount: number;
  loading: boolean;
}

export default function GeographicSummaryBar({
  totalStudents,
  countryCount,
  stateCount,
  cityCount,
  loading,
}: GeographicSummaryBarProps) {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="rounded" width={130} height={32} sx={{ borderRadius: 4 }} />
        ))}
      </Box>
    );
  }

  const chips = [
    { icon: <PeopleOutlinedIcon />, label: `${totalStudents} students`, color: 'primary' as const },
    { icon: <PublicOutlinedIcon />, label: `${countryCount} ${countryCount === 1 ? 'country' : 'countries'}`, color: 'secondary' as const },
    { icon: <MapOutlinedIcon />, label: `${stateCount} states`, color: 'info' as const },
    { icon: <LocationCityOutlinedIcon />, label: `${cityCount} cities`, color: 'default' as const },
  ];

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1.5,
        mb: 2,
        overflowX: 'auto',
        pb: 0.5,
        '&::-webkit-scrollbar': { display: 'none' },
        scrollbarWidth: 'none',
      }}
    >
      {chips.map((chip) => (
        <Chip
          key={chip.label}
          icon={chip.icon}
          label={chip.label}
          color={chip.color}
          variant="outlined"
          sx={{ fontWeight: 600, flexShrink: 0 }}
        />
      ))}
    </Box>
  );
}
