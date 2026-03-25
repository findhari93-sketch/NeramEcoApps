'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Skeleton,
  TextField,
  useTheme,
  useMediaQuery,
  alpha,
  Chip,
} from '@neram/ui';
import LocationCityOutlinedIcon from '@mui/icons-material/LocationCityOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface CityCount {
  city: string;
  student_count: number;
  state: string | null;
}

export default function CityWiseStudents() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const [cities, setCities] = useState<CityCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function fetchCities() {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) return;

        const res = await fetch('/api/students/city-wise', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          setCities(data.cities || []);
        }
      } catch (err) {
        console.error('Failed to load city data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchCities();
  }, [getToken]);

  const totalStudents = cities.reduce((sum, c) => sum + c.student_count, 0);

  const filteredCities = cities.filter((c) => {
    const query = searchQuery.toLowerCase();
    return (
      c.city.toLowerCase().includes(query) ||
      (c.state && c.state.toLowerCase().includes(query))
    );
  });

  return (
    <Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 0.5 }}>
        City-Wise Students
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        All students grouped by their city across all classrooms
      </Typography>

      {/* Summary bar */}
      {!loading && (
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            mb: 2,
            flexWrap: 'wrap',
          }}
        >
          <Chip
            icon={<PeopleOutlinedIcon />}
            label={`${totalStudents} total students`}
            color="primary"
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
          <Chip
            icon={<LocationCityOutlinedIcon />}
            label={`${cities.length} cities`}
            color="secondary"
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
        </Box>
      )}

      {/* Search */}
      <TextField
        fullWidth
        placeholder="Search by city or state..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        size="small"
        sx={{ mb: 2 }}
        inputProps={{ style: { minHeight: 24 } }}
      />

      {/* City Cards Grid */}
      {loading ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
            },
            gap: 2,
          }}
        >
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      ) : filteredCities.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <LocationCityOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body1" color="text.secondary">
            {searchQuery ? 'No cities match your search.' : 'No student city data available yet.'}
          </Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
            City information comes from student application forms.
          </Typography>
        </Paper>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
            },
            gap: 2,
          }}
        >
          {filteredCities.map((city) => {
            const percentage = totalStudents > 0
              ? Math.round((city.student_count / totalStudents) * 100)
              : 0;

            return (
              <Paper
                key={city.city}
                variant="outlined"
                onClick={() =>
                  router.push(
                    `/teacher/students/city-wise/${encodeURIComponent(city.city)}`
                  )
                }
                sx={{
                  p: 2.5,
                  cursor: 'pointer',
                  borderRadius: 2,
                  transition: 'all 0.2s',
                  position: 'relative',
                  overflow: 'hidden',
                  minHeight: 48,
                  '&:hover': {
                    backgroundColor: alpha(theme.palette.primary.main, 0.04),
                    borderColor: theme.palette.primary.main,
                    transform: 'translateY(-1px)',
                    boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.12)}`,
                  },
                  '&:active': {
                    transform: 'translateY(0)',
                  },
                }}
              >
                {/* Background percentage bar */}
                <Box
                  sx={{
                    position: 'absolute',
                    left: 0,
                    bottom: 0,
                    height: 3,
                    width: `${percentage}%`,
                    backgroundColor: alpha(theme.palette.primary.main, 0.3),
                    borderRadius: '0 2px 0 0',
                  }}
                />

                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <LocationCityOutlinedIcon
                        sx={{ fontSize: 20, color: 'primary.main' }}
                      />
                      <Typography
                        variant="subtitle1"
                        sx={{ fontWeight: 700, fontSize: { xs: '1rem', sm: '1.05rem' } }}
                        noWrap
                      >
                        {city.city}
                      </Typography>
                    </Box>
                    {city.state && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ ml: 3.5 }}
                      >
                        {city.state}
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                    <Typography
                      variant="h5"
                      sx={{
                        fontWeight: 800,
                        color: 'primary.main',
                        lineHeight: 1,
                      }}
                    >
                      {city.student_count}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {city.student_count === 1 ? 'student' : 'students'}
                    </Typography>
                  </Box>
                </Box>

                {/* Bottom: percentage + arrow */}
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    mt: 1.5,
                  }}
                >
                  <Typography variant="caption" color="text.disabled">
                    {percentage}% of total
                  </Typography>
                  <ArrowForwardIosIcon
                    sx={{ fontSize: 14, color: 'text.disabled' }}
                  />
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
