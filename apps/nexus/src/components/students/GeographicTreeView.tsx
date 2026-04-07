'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Skeleton,
  alpha,
  useTheme,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import CityCard from './CityCard';
import type { GeographicCountryNode } from '@neram/database';

interface GeographicTreeViewProps {
  hierarchy: GeographicCountryNode[];
  totalStudents: number;
  onCityClick: (city: string) => void;
  loading: boolean;
}

export default function GeographicTreeView({
  hierarchy,
  totalStudents,
  onCityClick,
  loading,
}: GeographicTreeViewProps) {
  const theme = useTheme();
  // Track which states are expanded. First state of first country auto-expands.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (hierarchy.length > 0 && hierarchy[0].states.length > 0) {
      initial.add(`${hierarchy[0].country}-${hierarchy[0].states[0].state}`);
    }
    return initial;
  });

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rounded" height={64} sx={{ borderRadius: 2 }} />
        ))}
      </Box>
    );
  }

  if (hierarchy.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <MapOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
        <Typography variant="body1" color="text.secondary">
          No geographic data available yet.
        </Typography>
        <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
          City information comes from student application forms.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {hierarchy.map((country) => (
        <Box key={country.country}>
          {/* Country header (only show if multiple countries) */}
          {hierarchy.length > 1 && (
            <Paper
              sx={{
                px: 2,
                py: 1.5,
                mb: 1,
                backgroundColor: alpha(theme.palette.primary.main, 0.06),
                borderLeft: `4px solid ${theme.palette.primary.main}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
              elevation={0}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {country.country_display}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                {country.student_count} students, {country.state_count} states
              </Typography>
            </Paper>
          )}

          {/* State accordions */}
          {country.states.map((state) => {
            const stateKey = `${country.country}-${state.state}`;
            const isExpanded = expanded.has(stateKey);

            // Group cities by district if districts exist
            const hasDistricts = state.cities.some((c) => c.district);
            const districtGroups = hasDistricts
              ? groupByDistrict(state.cities)
              : [{ district: null, cities: state.cities }];

            return (
              <Accordion
                key={stateKey}
                expanded={isExpanded}
                onChange={() => toggleExpanded(stateKey)}
                disableGutters
                TransitionProps={{ unmountOnExit: true }}
                sx={{
                  '&:before': { display: 'none' },
                  borderRadius: '8px !important',
                  border: `1px solid ${theme.palette.divider}`,
                  mb: 1,
                  overflow: 'hidden',
                  '&.Mui-expanded': {
                    margin: 0,
                    mb: 1,
                  },
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  sx={{
                    minHeight: 48,
                    px: 2,
                    '& .MuiAccordionSummary-content': {
                      my: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      mr: 1,
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <MapOutlinedIcon sx={{ fontSize: 20, color: 'primary.main' }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {state.state}
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, flexShrink: 0 }}>
                    {state.student_count} students, {state.city_count} {state.city_count === 1 ? 'city' : 'cities'}
                  </Typography>
                </AccordionSummary>

                <AccordionDetails sx={{ px: 2, pb: 2, pt: 0 }}>
                  {districtGroups.map((group, idx) => (
                    <Box key={group.district || `no-district-${idx}`}>
                      {group.district && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontWeight: 600, mt: idx > 0 ? 2 : 0, mb: 1, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}
                        >
                          {group.district} District
                        </Typography>
                      )}
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: {
                            xs: '1fr',
                            sm: 'repeat(2, 1fr)',
                            md: 'repeat(3, 1fr)',
                          },
                          gap: 1.5,
                        }}
                      >
                        {group.cities.map((city) => (
                          <CityCard
                            key={city.city}
                            city={city.city}
                            studentCount={city.student_count}
                            totalStudents={totalStudents}
                            onClick={() => onCityClick(city.city)}
                          />
                        ))}
                      </Box>
                    </Box>
                  ))}
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}

/** Group cities by district, with null-district cities first. */
function groupByDistrict(cities: { city: string; student_count: number; district: string | null }[]) {
  const map = new Map<string, typeof cities>();
  const noDistrict: typeof cities = [];

  for (const c of cities) {
    if (!c.district) {
      noDistrict.push(c);
    } else {
      const existing = map.get(c.district);
      if (existing) {
        existing.push(c);
      } else {
        map.set(c.district, [c]);
      }
    }
  }

  const groups: { district: string | null; cities: typeof cities }[] = [];
  if (noDistrict.length > 0) {
    groups.push({ district: null, cities: noDistrict });
  }
  for (const [district, districtCities] of map) {
    groups.push({ district, cities: districtCities });
  }
  return groups;
}
