'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Grid,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
} from '@neram/ui';

interface ExamCenter {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  exam_types: string[];
  distance?: number;
}

export default function ExamCentersPage() {
  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [centers, setCenters] = useState<ExamCenter[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [statesLoading, setStatesLoading] = useState(true);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useLocation, setUseLocation] = useState(false);

  // Fetch states on mount
  useEffect(() => {
    fetch('/api/tools/exam-centers?action=states')
      .then((res) => res.json())
      .then((data) => {
        setStates(data.states || []);
      })
      .catch((err) => {
        console.error('Failed to fetch states:', err);
      })
      .finally(() => {
        setStatesLoading(false);
      });
  }, []);

  // Fetch cities when state changes
  useEffect(() => {
    if (!selectedState) {
      setCities([]);
      return;
    }

    setCitiesLoading(true);
    fetch(`/api/tools/exam-centers?action=cities&state=${encodeURIComponent(selectedState)}`)
      .then((res) => res.json())
      .then((data) => {
        setCities(data.cities || []);
      })
      .catch((err) => {
        console.error('Failed to fetch cities:', err);
      })
      .finally(() => {
        setCitiesLoading(false);
      });
  }, [selectedState]);

  const searchCenters = async () => {
    setLoading(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {};

      if (selectedState) body.state = selectedState;
      if (selectedCity) body.city = selectedCity;
      if (searchQuery) body.search = searchQuery;

      // Try to get user location if enabled
      if (useLocation && navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 5000,
              enableHighAccuracy: true,
            });
          });
          body.latitude = position.coords.latitude;
          body.longitude = position.coords.longitude;
        } catch {
          // Location not available, continue without it
        }
      }

      const response = await fetch('/api/tools/exam-centers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to search exam centers');
      }

      setCenters(data.centers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setCenters([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDistance = (distance?: number) => {
    if (!distance) return null;
    if (distance < 1) return `${Math.round(distance * 1000)} m`;
    return `${distance.toFixed(1)} km`;
  };

  const openDirections = (center: ExamCenter) => {
    if (center.latitude && center.longitude) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${center.latitude},${center.longitude}`,
        '_blank'
      );
    } else {
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          `${center.name}, ${center.address}, ${center.city}`
        )}`,
        '_blank'
      );
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
        NATA Exam Centers
      </Typography>

      <Grid container spacing={3}>
        {/* Search Section */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h6" gutterBottom>
              Find Exam Centers
            </Typography>

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Select State</InputLabel>
              <Select
                value={selectedState}
                label="Select State"
                onChange={(e) => {
                  setSelectedState(e.target.value);
                  setSelectedCity('');
                }}
                disabled={statesLoading}
              >
                <MenuItem value="">All States</MenuItem>
                {states.map((state) => (
                  <MenuItem key={state} value={state}>
                    {state}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth sx={{ mb: 2 }} disabled={!selectedState || citiesLoading}>
              <InputLabel>Select City</InputLabel>
              <Select
                value={selectedCity}
                label="Select City"
                onChange={(e) => setSelectedCity(e.target.value)}
              >
                <MenuItem value="">All Cities</MenuItem>
                {cities.map((city) => (
                  <MenuItem key={city} value={city}>
                    {city}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              fullWidth
              label="Search by name or pincode"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter center name or pincode"
              sx={{ mb: 2 }}
            />

            <Box sx={{ mb: 2 }}>
              <Button
                size="small"
                variant={useLocation ? 'contained' : 'outlined'}
                onClick={() => setUseLocation(!useLocation)}
                sx={{ fontSize: '0.8rem' }}
              >
                {useLocation ? 'Location enabled' : 'Use my location'}
              </Button>
            </Box>

            <Button
              variant="contained"
              fullWidth
              size="large"
              onClick={searchCenters}
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : 'Search Centers'}
            </Button>
          </Paper>

          <Paper sx={{ p: 2, mt: 2 }}>
            <Typography variant="subtitle2" gutterBottom fontWeight={600}>
              Quick Tips
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Visit the exam center before the exam day
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Check traffic conditions and plan your route
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Arrive at least 30 minutes before reporting time
            </Typography>
          </Paper>
        </Grid>

        {/* Results Section */}
        <Grid item xs={12} md={8}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {loading ? (
            <Paper
              sx={{
                p: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 400,
              }}
            >
              <CircularProgress />
            </Paper>
          ) : centers.length > 0 ? (
            <Box>
              <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
                Exam Centers ({centers.length})
              </Typography>
              <Grid container spacing={2}>
                {centers.map((center) => (
                  <Grid item xs={12} key={center.id}>
                    <Card>
                      <CardContent>
                        <Box
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            mb: 1,
                          }}
                        >
                          <Typography variant="h6" sx={{ fontSize: '1.1rem' }}>
                            {center.name}
                          </Typography>
                          {center.distance && (
                            <Chip
                              label={formatDistance(center.distance)}
                              size="small"
                              color="primary"
                            />
                          )}
                        </Box>
                        <Typography variant="body2" color="text.secondary" paragraph>
                          {center.address}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                          <Chip label={center.city} size="small" variant="outlined" />
                          <Chip label={center.state} size="small" variant="outlined" />
                          <Chip label={center.pincode} size="small" variant="outlined" />
                          {center.exam_types?.map((type) => (
                            <Chip key={type} label={type} size="small" color="info" />
                          ))}
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => openDirections(center)}
                          >
                            Get Directions
                          </Button>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Box>
          ) : (
            <Paper
              sx={{
                p: { xs: 2, md: 3 },
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 400,
              }}
            >
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  Select your location
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Choose state and city to find NATA exam centers near you
                </Typography>
              </Box>
            </Paper>
          )}
        </Grid>

        {/* Info Section */}
        <Grid item xs={12}>
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h6" gutterBottom>
              Important Information
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Exam centers are allocated based on your preference during registration. You can
              select up to 3 preferred cities.
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              The final exam center will be mentioned on your admit card. Make sure to verify the
              location before the exam day.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Contact COA helpdesk for any queries regarding exam center allocation.
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
