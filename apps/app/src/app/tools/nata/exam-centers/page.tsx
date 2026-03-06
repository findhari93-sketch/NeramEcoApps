'use client';

import { useState, useEffect, useCallback } from 'react';
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
  Collapse,
  Switch,
  FormControlLabel,
  Divider,
  Skeleton,
} from '@neram/ui';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import VerifiedIcon from '@mui/icons-material/Verified';
import SchoolIcon from '@mui/icons-material/School';
import FiberNewIcon from '@mui/icons-material/FiberNew';
import DirectionsIcon from '@mui/icons-material/Directions';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import SearchIcon from '@mui/icons-material/Search';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useFirebaseAuth, getFirebaseAuth } from '@neram/auth';
import { AuthGate } from '@/components/AuthGate';

interface NataExamCenter {
  id: string;
  state: string;
  city_brochure: string;
  brochure_ref: string | null;
  latitude: number;
  longitude: number;
  city_population_tier: string | null;
  probable_center_1: string | null;
  center_1_address: string | null;
  center_1_evidence: string | null;
  probable_center_2: string | null;
  center_2_address: string | null;
  center_2_evidence: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  is_new_2025: boolean;
  was_in_2024: boolean;
  tcs_ion_confirmed: boolean;
  has_barch_college: boolean;
  notes: string | null;
  year: number;
  distance?: number;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  HIGH: '#4CAF50',
  MEDIUM: '#FF9800',
  LOW: '#F44336',
};

const CONFIDENCE_BG: Record<string, string> = {
  HIGH: '#4CAF5010',
  MEDIUM: '#FF980010',
  LOW: '#F4433610',
};

function CenterCard({
  center,
  formatDistance,
}: {
  center: NataExamCenter;
  formatDistance: (d?: number) => string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasAlternate = !!center.probable_center_2;
  const hasNotes = !!center.notes;

  const openDirections = () => {
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${center.latitude},${center.longitude}`,
      '_blank'
    );
  };

  return (
    <Card
      sx={{
        borderLeft: '4px solid',
        borderLeftColor: CONFIDENCE_COLORS[center.confidence] || '#9E9E9E',
        bgcolor: CONFIDENCE_BG[center.confidence] || 'transparent',
        '&:hover': { boxShadow: 3 },
        transition: 'box-shadow 0.2s ease',
      }}
    >
      <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: 2 } }}>
        {/* Header: State > City + Ref */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
              {center.state} &gt; {center.city_brochure}
            </Typography>
            {center.brochure_ref && (
              <Typography variant="caption" color="text.disabled" sx={{ ml: 1 }}>
                Ref: {center.brochure_ref}
              </Typography>
            )}
          </Box>
          {center.distance != null && (
            <Chip
              label={formatDistance(center.distance)}
              size="small"
              color="primary"
              sx={{ fontWeight: 600, fontSize: 11, height: 24 }}
            />
          )}
        </Box>

        {/* Chip Row */}
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1.5 }}>
          {center.is_new_2025 && (
            <Chip
              icon={<FiberNewIcon />}
              label="NEW"
              size="small"
              sx={{
                bgcolor: '#7B1FA214',
                color: '#7B1FA2',
                fontWeight: 600,
                fontSize: 10,
                height: 22,
                '& .MuiChip-icon': { color: '#7B1FA2', fontSize: 14 },
              }}
            />
          )}
          {center.tcs_ion_confirmed && (
            <Chip
              icon={<VerifiedIcon />}
              label="TCS iON Verified"
              size="small"
              sx={{
                bgcolor: '#2E7D3214',
                color: '#2E7D32',
                fontWeight: 600,
                fontSize: 10,
                height: 22,
                '& .MuiChip-icon': { color: '#2E7D32', fontSize: 14 },
              }}
            />
          )}
          {center.has_barch_college && (
            <Chip
              icon={<SchoolIcon />}
              label="B.Arch College"
              size="small"
              sx={{
                bgcolor: '#1565C014',
                color: '#1565C0',
                fontWeight: 600,
                fontSize: 10,
                height: 22,
                '& .MuiChip-icon': { color: '#1565C0', fontSize: 14 },
              }}
            />
          )}
          {center.city_population_tier && (
            <Chip
              label={center.city_population_tier}
              size="small"
              variant="outlined"
              sx={{ fontSize: 10, height: 22, fontWeight: 500 }}
            />
          )}
          <Chip
            label={center.confidence}
            size="small"
            sx={{
              bgcolor: `${CONFIDENCE_COLORS[center.confidence]}14`,
              color: CONFIDENCE_COLORS[center.confidence],
              fontWeight: 700,
              fontSize: 10,
              height: 22,
              border: '1px solid',
              borderColor: `${CONFIDENCE_COLORS[center.confidence]}30`,
            }}
          />
        </Box>

        {/* Primary Center */}
        {center.probable_center_1 && (
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', fontSize: 10 }}>
              Primary Center
            </Typography>
            <Typography variant="body2" fontWeight={600} sx={{ mt: 0.25 }}>
              {center.probable_center_1}
            </Typography>
            {center.center_1_address && (
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13, mt: 0.25 }}>
                {center.center_1_address}
              </Typography>
            )}
            {center.center_1_evidence && (
              <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic', display: 'block', mt: 0.25 }}>
                Source: {center.center_1_evidence}
              </Typography>
            )}
          </Box>
        )}

        {/* Expandable: Alternate + Notes */}
        {(hasAlternate || hasNotes) && (
          <>
            <Button
              size="small"
              onClick={() => setExpanded(!expanded)}
              endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              sx={{ textTransform: 'none', fontSize: 12, px: 0, minHeight: 0, color: 'text.secondary' }}
            >
              {expanded ? 'Hide details' : `Show ${hasAlternate ? 'alternate center' : ''}${hasAlternate && hasNotes ? ' & notes' : ''}${!hasAlternate && hasNotes ? 'notes' : ''}`}
            </Button>
            <Collapse in={expanded}>
              {hasAlternate && (
                <Box sx={{ mt: 1, pl: 1.5, borderLeft: '2px solid', borderColor: 'grey.200' }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', fontSize: 10 }}>
                    Alternate Center
                  </Typography>
                  <Typography variant="body2" fontWeight={500} sx={{ mt: 0.25 }}>
                    {center.probable_center_2}
                  </Typography>
                  {center.center_2_address && (
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13 }}>
                      {center.center_2_address}
                    </Typography>
                  )}
                  {center.center_2_evidence && (
                    <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic', display: 'block' }}>
                      Source: {center.center_2_evidence}
                    </Typography>
                  )}
                </Box>
              )}
              {hasNotes && (
                <Box sx={{ mt: 1, p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    <InfoOutlinedIcon sx={{ fontSize: 12, mr: 0.5, verticalAlign: 'middle' }} />
                    {center.notes}
                  </Typography>
                </Box>
              )}
            </Collapse>
          </>
        )}

        {/* Actions */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<DirectionsIcon />}
            onClick={openDirections}
            sx={{ fontSize: 12, textTransform: 'none' }}
          >
            Get Directions
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function ExamCentersPage() {
  const { user } = useFirebaseAuth();
  const [selectedState, setSelectedState] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [confidenceFilter, setConfidenceFilter] = useState('');
  const [tcsIonOnly, setTcsIonOnly] = useState(false);
  const [barchOnly, setBarchOnly] = useState(false);
  const [newOnly, setNewOnly] = useState(false);
  const [tierFilter, setTierFilter] = useState('');

  const [centers, setCenters] = useState<NataExamCenter[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [statesLoading, setStatesLoading] = useState(true);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useLocation, setUseLocation] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Fetch states on mount (public data)
  useEffect(() => {
    fetch('/api/tools/exam-centers?action=states')
      .then((res) => res.json())
      .then((data) => setStates(data.states || []))
      .catch(() => {})
      .finally(() => setStatesLoading(false));
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
      .then((data) => setCities(data.cities || []))
      .catch(() => {})
      .finally(() => setCitiesLoading(false));
  }, [selectedState]);

  const searchCenters = useCallback(async () => {
    setHasSearched(true);
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setError('Please sign in to view results');
        return;
      }
      const idToken = await currentUser.getIdToken();

      const body: Record<string, unknown> = {};
      if (selectedState) body.state = selectedState;
      if (selectedCity) body.city = selectedCity;
      if (searchQuery) body.search = searchQuery;
      if (confidenceFilter) body.confidence = confidenceFilter;
      if (tcsIonOnly) body.tcsIonOnly = true;
      if (barchOnly) body.barchOnly = true;
      if (newOnly) body.newOnly = true;
      if (tierFilter) body.tier = tierFilter;

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
          // Continue without location
        }
      }

      const response = await fetch('/api/tools/exam-centers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) return;
        throw new Error(data.error || 'Failed to search exam centers');
      }

      setCenters(data.centers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setCenters([]);
    } finally {
      setLoading(false);
    }
  }, [user, selectedState, selectedCity, searchQuery, confidenceFilter, tcsIonOnly, barchOnly, newOnly, tierFilter, useLocation]);

  // Re-fetch when user authenticates
  useEffect(() => {
    if (user && hasSearched && centers.length === 0 && !loading) {
      searchCenters();
    }
  }, [user]);

  const formatDistance = (distance?: number) => {
    if (distance == null) return null;
    if (distance < 1) return `${Math.round(distance * 1000)} m`;
    return `${distance.toFixed(1)} km`;
  };

  // Count active filters
  const activeFilterCount = [confidenceFilter, tcsIonOnly, barchOnly, newOnly, tierFilter].filter(Boolean).length;

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, mb: 0.5 }}>
        NATA Exam Centers
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Find probable NATA 2025 exam centers across 96 cities in 26 states with confidence ratings, TCS iON verification, and detailed venue information.
      </Typography>

      <Grid container spacing={3}>
        {/* Search Section */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: { xs: 2, md: 2.5 } }}>
            <Typography variant="subtitle1" gutterBottom fontWeight={600}>
              Find Exam Centers
            </Typography>

            <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
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
                  <MenuItem key={state} value={state}>{state}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small" sx={{ mb: 1.5 }} disabled={!selectedState || citiesLoading}>
              <InputLabel>Select City</InputLabel>
              <Select
                value={selectedCity}
                label="Select City"
                onChange={(e) => setSelectedCity(e.target.value)}
              >
                <MenuItem value="">All Cities</MenuItem>
                {cities.map((city) => (
                  <MenuItem key={city} value={city}>{city}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              fullWidth
              size="small"
              label="Search center or city"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="e.g., VIT Vellore"
              sx={{ mb: 1.5 }}
              InputProps={{
                startAdornment: <SearchIcon sx={{ mr: 0.5, color: 'text.disabled', fontSize: 18 }} />,
              }}
              onKeyDown={(e) => e.key === 'Enter' && searchCenters()}
            />

            {/* Advanced Filters Toggle */}
            <Button
              size="small"
              onClick={() => setShowFilters(!showFilters)}
              endIcon={showFilters ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              sx={{ textTransform: 'none', fontSize: 12, mb: 1, color: 'text.secondary' }}
            >
              Advanced Filters
              {activeFilterCount > 0 && (
                <Chip label={activeFilterCount} size="small" color="primary" sx={{ ml: 0.5, height: 18, fontSize: 10 }} />
              )}
            </Button>

            <Collapse in={showFilters}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 1.5 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Confidence Level</InputLabel>
                  <Select
                    value={confidenceFilter}
                    label="Confidence Level"
                    onChange={(e) => setConfidenceFilter(e.target.value)}
                  >
                    <MenuItem value="">All Levels</MenuItem>
                    <MenuItem value="HIGH">HIGH - Very likely</MenuItem>
                    <MenuItem value="MEDIUM">MEDIUM - Probable</MenuItem>
                    <MenuItem value="LOW">LOW - Possible</MenuItem>
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small">
                  <InputLabel>City Tier</InputLabel>
                  <Select
                    value={tierFilter}
                    label="City Tier"
                    onChange={(e) => setTierFilter(e.target.value)}
                  >
                    <MenuItem value="">All Tiers</MenuItem>
                    <MenuItem value="Metro">Metro</MenuItem>
                    <MenuItem value="Tier-1">Tier-1</MenuItem>
                    <MenuItem value="Tier-2">Tier-2</MenuItem>
                    <MenuItem value="Tier-3">Tier-3</MenuItem>
                  </Select>
                </FormControl>

                <FormControlLabel
                  control={<Switch size="small" checked={tcsIonOnly} onChange={(e) => setTcsIonOnly(e.target.checked)} />}
                  label={<Typography variant="body2">TCS iON Verified only</Typography>}
                />
                <FormControlLabel
                  control={<Switch size="small" checked={barchOnly} onChange={(e) => setBarchOnly(e.target.checked)} />}
                  label={<Typography variant="body2">With B.Arch College</Typography>}
                />
                <FormControlLabel
                  control={<Switch size="small" checked={newOnly} onChange={(e) => setNewOnly(e.target.checked)} />}
                  label={<Typography variant="body2">New Centers Only</Typography>}
                />
              </Box>
            </Collapse>

            <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
              <Button
                size="small"
                variant={useLocation ? 'contained' : 'outlined'}
                onClick={() => setUseLocation(!useLocation)}
                startIcon={<MyLocationIcon />}
                sx={{ fontSize: 12, textTransform: 'none', flex: 1 }}
              >
                {useLocation ? 'Location ON' : 'Use my location'}
              </Button>
            </Box>

            <Button
              variant="contained"
              fullWidth
              size="large"
              onClick={searchCenters}
              disabled={loading}
              sx={{ fontWeight: 600 }}
            >
              {loading ? <CircularProgress size={24} /> : 'Search Centers'}
            </Button>
          </Paper>

          {/* Legend */}
          <Paper sx={{ p: 2, mt: 2 }}>
            <Typography variant="subtitle2" gutterBottom fontWeight={600}>
              Confidence Levels
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#4CAF50' }} />
                <Typography variant="caption"><strong>HIGH</strong> - TCS iON confirmed or official source</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#FF9800' }} />
                <Typography variant="caption"><strong>MEDIUM</strong> - Strong evidence from past patterns</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#F44336' }} />
                <Typography variant="caption"><strong>LOW</strong> - Estimated, pending confirmation</Typography>
              </Box>
            </Box>

            <Divider sx={{ my: 1.5 }} />

            <Typography variant="subtitle2" gutterBottom fontWeight={600}>
              Quick Tips
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ lineHeight: 1.6 }}>
              Visit the probable exam center before exam day.
              <br />
              Centers with TCS iON verification are most reliable.
              <br />
              Final center will be on your admit card.
            </Typography>
          </Paper>
        </Grid>

        {/* Results Section */}
        <Grid item xs={12} md={8}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
          )}

          <AuthGate
            hasData={hasSearched}
            pendingData={{ selectedState, selectedCity, searchQuery, useLocation }}
            onAuthenticated={searchCenters}
            title="Sign up to see exam centers"
            description="Create a free account to view detailed exam center information, confidence ratings, and get directions."
          >
            {loading ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {[1, 2, 3].map((i) => (
                  <Paper key={i} sx={{ p: 2.5 }}>
                    <Skeleton variant="text" width="40%" />
                    <Skeleton variant="text" width="70%" />
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
                      <Skeleton variant="rounded" width={60} height={22} />
                      <Skeleton variant="rounded" width={100} height={22} />
                      <Skeleton variant="rounded" width={50} height={22} />
                    </Box>
                    <Skeleton variant="text" width="80%" sx={{ mt: 1 }} />
                    <Skeleton variant="text" width="60%" />
                  </Paper>
                ))}
              </Box>
            ) : centers.length > 0 ? (
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="subtitle1" fontWeight={600}>
                    {centers.length} Exam Center{centers.length !== 1 ? 's' : ''} Found
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {centers.filter((c) => c.confidence === 'HIGH').length > 0 && (
                      <Chip
                        label={`${centers.filter((c) => c.confidence === 'HIGH').length} HIGH`}
                        size="small"
                        sx={{ bgcolor: '#4CAF5014', color: '#4CAF50', fontWeight: 600, fontSize: 10, height: 22 }}
                      />
                    )}
                    {centers.filter((c) => c.tcs_ion_confirmed).length > 0 && (
                      <Chip
                        icon={<VerifiedIcon />}
                        label={`${centers.filter((c) => c.tcs_ion_confirmed).length} TCS`}
                        size="small"
                        sx={{ bgcolor: '#2E7D3214', color: '#2E7D32', fontWeight: 600, fontSize: 10, height: 22, '& .MuiChip-icon': { fontSize: 12 } }}
                      />
                    )}
                  </Box>
                </Box>

                <Grid container spacing={2}>
                  {centers.map((center) => (
                    <Grid item xs={12} key={center.id}>
                      <CenterCard center={center} formatDistance={formatDistance} />
                    </Grid>
                  ))}
                </Grid>
              </Box>
            ) : hasSearched && user ? (
              <Paper sx={{ p: 4, textAlign: 'center', minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Box>
                  <LocationOnIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                  <Typography variant="h6" color="text.secondary" gutterBottom>
                    No exam centers found
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Try selecting a different state or adjusting your filters
                  </Typography>
                </Box>
              </Paper>
            ) : (
              <Paper sx={{ p: 4, textAlign: 'center', minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Box>
                  <LocationOnIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                  <Typography variant="h6" color="text.secondary" gutterBottom>
                    Select your location
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Choose a state and click Search to find NATA exam centers with detailed venue information
                  </Typography>
                </Box>
              </Paper>
            )}
          </AuthGate>
        </Grid>

        {/* Info Section */}
        <Grid item xs={12}>
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="subtitle1" gutterBottom fontWeight={600}>
              About This Data
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              This tool provides probable exam center locations for NATA 2025 based on research from TCS iON
              digital zones, previous year patterns, and institutional analysis. Confidence levels indicate
              how reliable each prediction is.
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Centers marked as &ldquo;TCS iON Verified&rdquo; have confirmed addresses from the TCS iON
              testing platform. The final exam center assigned to you will be mentioned on your admit card.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Data covers 96 cities across 26 states including 18 high-confidence, 28 medium-confidence,
              and 50 estimated centers. New cities added in 2025 are marked with a purple &ldquo;NEW&rdquo; badge.
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
