'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Collapse,
  Switch,
  FormControlLabel,
  Divider,
  Skeleton,
  Stack,
} from '@neram/ui';
import { alpha, type Theme } from '@mui/material/styles';
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
import RefreshIcon from '@mui/icons-material/Refresh';
import { getFirebaseAuth } from '@neram/auth';
import { useToolOpened } from '@/hooks/useToolOpened';
import ToolPageHeader from '@/components/tools-hub/ToolPageHeader';

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

/** The centre list in the database is the NATA 2025 brochure list (the latest published). */
const DATA_YEAR = 2025;

type PaletteKey = 'success' | 'warning' | 'error';

const CONFIDENCE_PALETTE: Record<NataExamCenter['confidence'], PaletteKey> = {
  HIGH: 'success',
  MEDIUM: 'warning',
  LOW: 'error',
};

const CONFIDENCE_LABEL: Record<NataExamCenter['confidence'], string> = {
  HIGH: 'High confidence',
  MEDIUM: 'Medium confidence',
  LOW: 'Low confidence',
};

/** Read-only chips: readable 12px text, 26px tall. */
const infoChipSx = {
  height: 26,
  fontSize: '0.75rem',
  fontWeight: 600,
  '& .MuiChip-icon': { fontSize: 16 },
} as const;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

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
  const tone = CONFIDENCE_PALETTE[center.confidence] ?? 'warning';
  const detailsId = `center-details-${center.id}`;

  // Institute name + address resolves most accurately in Google Maps
  const parts: string[] = [];
  if (center.probable_center_1) parts.push(center.probable_center_1);
  if (center.center_1_address) parts.push(center.center_1_address);
  if (parts.length === 0) parts.push(center.city_brochure, center.state);
  const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(parts.join(', '))}`;

  const toggleLabel = hasAlternate && hasNotes
    ? 'Show alternate center and notes'
    : hasAlternate
      ? 'Show alternate center'
      : 'Show notes';

  return (
    <Card
      variant="outlined"
      sx={(theme: Theme) => ({
        borderLeft: '4px solid',
        borderLeftColor: theme.palette[tone].main,
        bgcolor: alpha(theme.palette[tone].main, theme.palette.mode === 'light' ? 0.04 : 0.08),
      })}
    >
      <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: 2 } }}>
        {/* Header: State > City + Ref */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 1 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
              {center.state}, {center.city_brochure}
            </Typography>
            {center.brochure_ref && (
              <Typography variant="caption" color="text.secondary">
                Brochure ref: {center.brochure_ref}
              </Typography>
            )}
          </Box>
          {center.distance != null && (
            <Chip label={formatDistance(center.distance)} size="small" color="primary" sx={infoChipSx} />
          )}
        </Box>

        {/* Chip Row */}
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1.5 }}>
          <Chip
            label={CONFIDENCE_LABEL[center.confidence] ?? center.confidence}
            size="small"
            color={tone}
            variant="outlined"
            sx={infoChipSx}
          />
          {center.is_new_2025 && (
            <Chip icon={<FiberNewIcon />} label={`New in ${DATA_YEAR}`} size="small" color="primary" variant="outlined" sx={infoChipSx} />
          )}
          {center.tcs_ion_confirmed && (
            <Chip icon={<VerifiedIcon />} label="TCS iON verified" size="small" color="success" variant="outlined" sx={infoChipSx} />
          )}
          {center.has_barch_college && (
            <Chip icon={<SchoolIcon />} label="B.Arch college" size="small" color="info" variant="outlined" sx={infoChipSx} />
          )}
          {center.city_population_tier && (
            <Chip label={center.city_population_tier} size="small" variant="outlined" sx={infoChipSx} />
          )}
        </Box>

        {/* Primary Center */}
        {center.probable_center_1 && (
          <Box sx={{ mb: 1 }}>
            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>
              Primary center
            </Typography>
            <Typography variant="body1" fontWeight={600} sx={{ mt: 0.25 }}>
              {center.probable_center_1}
            </Typography>
            {center.center_1_address && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {center.center_1_address}
              </Typography>
            )}
            {center.center_1_evidence && (
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', display: 'block', mt: 0.25 }}>
                Source: {center.center_1_evidence}
              </Typography>
            )}
          </Box>
        )}

        {/* Expandable: Alternate + Notes */}
        {(hasAlternate || hasNotes) && (
          <>
            <Button
              variant="text"
              onClick={() => setExpanded(!expanded)}
              endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              aria-expanded={expanded}
              aria-controls={detailsId}
              sx={{ minHeight: 44, px: 1, ml: -1, color: 'text.secondary' }}
            >
              {expanded ? 'Hide details' : toggleLabel}
            </Button>
            <Collapse in={expanded} id={detailsId}>
              {hasAlternate && (
                <Box sx={{ mt: 1, pl: 1.5, borderLeft: '2px solid', borderColor: 'divider' }}>
                  <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>
                    Alternate center
                  </Typography>
                  <Typography variant="body1" fontWeight={500} sx={{ mt: 0.25 }}>
                    {center.probable_center_2}
                  </Typography>
                  {center.center_2_address && (
                    <Typography variant="body2" color="text.secondary">
                      {center.center_2_address}
                    </Typography>
                  )}
                  {center.center_2_evidence && (
                    <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', display: 'block' }}>
                      Source: {center.center_2_evidence}
                    </Typography>
                  )}
                </Box>
              )}
              {hasNotes && (
                <Box sx={{ mt: 1, p: 1.5, bgcolor: 'action.hover', borderRadius: 1, display: 'flex', gap: 1 }}>
                  <InfoOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary', mt: '2px' }} aria-hidden="true" />
                  <Typography variant="body2" color="text.secondary">
                    {center.notes}
                  </Typography>
                </Box>
              )}
            </Collapse>
          </>
        )}

        {/* Actions */}
        <Box sx={{ display: 'flex', justifyContent: { xs: 'stretch', sm: 'flex-end' }, mt: 1.5 }}>
          <Button
            component="a"
            href={directionsHref}
            target="_blank"
            rel="noopener noreferrer"
            variant="outlined"
            startIcon={<DirectionsIcon />}
            sx={{ minHeight: 44, width: { xs: '100%', sm: 'auto' } }}
          >
            Get directions
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}

function ResultsSkeleton() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }} aria-hidden="true">
      {[1, 2, 3].map((i) => (
        <Paper key={i} sx={{ p: 2.5 }}>
          <Skeleton variant="text" width="40%" />
          <Box sx={{ display: 'flex', gap: 0.75, mt: 1 }}>
            <Skeleton variant="rounded" width={110} height={26} />
            <Skeleton variant="rounded" width={120} height={26} />
          </Box>
          <Skeleton variant="text" width="80%" sx={{ mt: 1.5 }} />
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="rounded" height={44} sx={{ mt: 1.5 }} />
        </Paper>
      ))}
    </Box>
  );
}

export default function ExamCentersPage() {
  useToolOpened('exam_center_locator');
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
  const [statesError, setStatesError] = useState(false);
  const [statesAttempt, setStatesAttempt] = useState(0);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesError, setCitiesError] = useState(false);
  const [citiesAttempt, setCitiesAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [useLocation, setUseLocation] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const searchAbortRef = useRef<AbortController | null>(null);
  const searchSeqRef = useRef(0);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const resultsHeadingRef = useRef<HTMLHeadingElement | null>(null);

  // States list (public, cached data)
  useEffect(() => {
    const controller = new AbortController();
    setStatesLoading(true);
    setStatesError(false);
    fetch('/api/tools/exam-centers?action=states', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setStates(data.states || []);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error('Failed to load states:', err);
        setStatesError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setStatesLoading(false);
      });
    return () => controller.abort();
  }, [statesAttempt]);

  // Cities for the chosen state; an older state's response can never land
  useEffect(() => {
    setCitiesError(false);
    if (!selectedState) {
      setCities([]);
      setCitiesLoading(false);
      return;
    }
    const controller = new AbortController();
    setCities([]);
    setCitiesLoading(true);
    fetch(`/api/tools/exam-centers?action=cities&state=${encodeURIComponent(selectedState)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setCities(data.cities || []);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error('Failed to load cities:', err);
        setCitiesError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCitiesLoading(false);
      });
    return () => controller.abort();
  }, [selectedState, citiesAttempt]);

  useEffect(() => () => searchAbortRef.current?.abort(), []);

  /** On phones the results sit below the form; bring them into view after a search. */
  const revealResults = useCallback(() => {
    if (typeof window === 'undefined') return;
    const isPhoneLayout = window.matchMedia?.('(max-width: 899.95px)').matches;
    if (!isPhoneLayout) return;
    requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'start',
      });
      resultsHeadingRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const searchCenters = useCallback(async () => {
    // Only the latest search may write results
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    const seq = ++searchSeqRef.current;
    const isCurrent = () => seq === searchSeqRef.current && !controller.signal.aborted;

    setHasSearched(true);
    setLoading(true);
    setError(null);
    revealResults();

    try {
      const currentUser = getFirebaseAuth().currentUser;
      if (!currentUser) {
        throw new Error('Your session has ended. Please sign in again to search.');
      }
      const idToken = await currentUser.getIdToken();

      const body: Record<string, unknown> = {};
      if (selectedState) body.state = selectedState;
      if (selectedCity) body.city = selectedCity;
      if (searchQuery.trim()) body.search = searchQuery.trim();
      if (confidenceFilter) body.confidence = confidenceFilter;
      if (tcsIonOnly) body.tcsIonOnly = true;
      if (barchOnly) body.barchOnly = true;
      if (newOnly) body.newOnly = true;
      if (tierFilter) body.tier = tierFilter;

      if (useLocation && typeof navigator !== 'undefined' && navigator.geolocation) {
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
      if (!isCurrent()) return;

      const response = await fetch('/api/tools/exam-centers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Your session has ended. Please refresh the page or sign in again.');
        }
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Could not load exam centers. Please try again.');
      }

      const data = await response.json();
      if (!isCurrent()) return;
      setCenters(data.centers || []);
    } catch (err) {
      if (!isCurrent()) return;
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      setError(
        offline
          ? 'You seem to be offline. Check your connection and try again.'
          : err instanceof Error && err.name !== 'TypeError'
            ? err.message
            : 'Could not load exam centers. Please try again.'
      );
      setCenters([]);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [selectedState, selectedCity, searchQuery, confidenceFilter, tcsIonOnly, barchOnly, newOnly, tierFilter, useLocation, revealResults]);

  const formatDistance = (distance?: number) => {
    if (distance == null) return null;
    if (distance < 1) return `${Math.round(distance * 1000)} m`;
    return `${distance.toFixed(1)} km`;
  };

  const activeFilterCount = [confidenceFilter, tcsIonOnly, barchOnly, newOnly, tierFilter].filter(Boolean).length;
  const highCount = centers.filter((c) => c.confidence === 'HIGH').length;
  const tcsCount = centers.filter((c) => c.tcs_ion_confirmed).length;

  const switchRowSx = { minHeight: 44, mx: 0, gap: 1 } as const;

  return (
    <Box>
      <ToolPageHeader
        toolId="nata-exam-centers"
        description={`Probable NATA exam centers in 96 cities across 26 states, with confidence ratings, TCS iON verification and directions. Based on the NATA ${DATA_YEAR} city list, the latest published.`}
        meta={<Chip size="small" variant="outlined" label={`Data: NATA ${DATA_YEAR} city list`} sx={infoChipSx} />}
      />

      <Box
        sx={{
          display: 'grid',
          gap: { xs: 2, md: 3 },
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 4fr) minmax(0, 8fr)' },
          gridTemplateRows: { md: 'auto 1fr auto' },
          // Phone order: form, results, legend, about. Laptop: form + legend left, results right.
          gridTemplateAreas: {
            xs: '"form" "results" "legend" "about"',
            md: '"form results" "legend results" "about about"',
          },
        }}
      >
        {/* Search form */}
        <Paper
          component="form"
          role="search"
          aria-label="Find exam centers"
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            if (!loading) searchCenters();
          }}
          sx={{ gridArea: 'form', p: { xs: 2, md: 2.5 }, alignSelf: 'start' }}
        >
          <Typography variant="subtitle1" component="h2" gutterBottom>
            Find exam centers
          </Typography>

          {statesError && (
            <Alert
              severity="error"
              sx={{ mb: 1.5 }}
              action={
                <Button color="inherit" onClick={() => setStatesAttempt((n) => n + 1)} startIcon={<RefreshIcon />} sx={{ minHeight: 44 }}>
                  Retry
                </Button>
              }
            >
              Could not load the list of states.
            </Alert>
          )}

          <Stack spacing={1.5} sx={{ mb: 1.5 }}>
            <FormControl fullWidth>
              <InputLabel id="ec-state-label">State</InputLabel>
              <Select
                labelId="ec-state-label"
                value={selectedState}
                label="State"
                onChange={(e) => {
                  setSelectedState(e.target.value);
                  setSelectedCity('');
                }}
                disabled={statesLoading}
              >
                <MenuItem value="">All states</MenuItem>
                {states.map((state) => (
                  <MenuItem key={state} value={state}>{state}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth disabled={!selectedState || citiesLoading}>
              <InputLabel id="ec-city-label">{citiesLoading ? 'Loading cities' : 'City'}</InputLabel>
              <Select
                labelId="ec-city-label"
                value={selectedCity}
                label={citiesLoading ? 'Loading cities' : 'City'}
                onChange={(e) => setSelectedCity(e.target.value)}
              >
                <MenuItem value="">All cities</MenuItem>
                {cities.map((city) => (
                  <MenuItem key={city} value={city}>{city}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {citiesError && (
              <Alert
                severity="error"
                action={
                  <Button color="inherit" onClick={() => setCitiesAttempt((n) => n + 1)} startIcon={<RefreshIcon />} sx={{ minHeight: 44 }}>
                    Retry
                  </Button>
                }
              >
                Could not load cities for {selectedState}.
              </Alert>
            )}

            <TextField
              fullWidth
              label="Search center or city"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="For example, VIT Vellore"
              inputProps={{ enterKeyHint: 'search' }}
              InputProps={{
                startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary', fontSize: 20 }} aria-hidden="true" />,
              }}
            />
          </Stack>

          {/* Advanced Filters Toggle */}
          <Button
            variant="text"
            onClick={() => setShowFilters(!showFilters)}
            endIcon={showFilters ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            aria-expanded={showFilters}
            aria-controls="ec-advanced-filters"
            sx={{ minHeight: 44, px: 1, ml: -1, mb: 1, color: 'text.secondary' }}
          >
            Advanced filters
            {activeFilterCount > 0 && (
              <Chip
                label={`${activeFilterCount} on`}
                size="small"
                color="primary"
                sx={{ ml: 1, height: 24, fontSize: '0.75rem' }}
              />
            )}
          </Button>

          <Collapse in={showFilters} id="ec-advanced-filters">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 1.5 }}>
              <FormControl fullWidth>
                <InputLabel id="ec-confidence-label">Confidence level</InputLabel>
                <Select
                  labelId="ec-confidence-label"
                  value={confidenceFilter}
                  label="Confidence level"
                  onChange={(e) => setConfidenceFilter(e.target.value)}
                >
                  <MenuItem value="">All levels</MenuItem>
                  <MenuItem value="HIGH">High: very likely</MenuItem>
                  <MenuItem value="MEDIUM">Medium: probable</MenuItem>
                  <MenuItem value="LOW">Low: possible</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth>
                <InputLabel id="ec-tier-label">City tier</InputLabel>
                <Select
                  labelId="ec-tier-label"
                  value={tierFilter}
                  label="City tier"
                  onChange={(e) => setTierFilter(e.target.value)}
                >
                  <MenuItem value="">All tiers</MenuItem>
                  <MenuItem value="Metro">Metro</MenuItem>
                  <MenuItem value="Tier-1">Tier 1</MenuItem>
                  <MenuItem value="Tier-2">Tier 2</MenuItem>
                  <MenuItem value="Tier-3">Tier 3</MenuItem>
                </Select>
              </FormControl>

              <FormControlLabel
                sx={switchRowSx}
                control={<Switch checked={tcsIonOnly} onChange={(e) => setTcsIonOnly(e.target.checked)} />}
                label={<Typography variant="body2">TCS iON verified only</Typography>}
              />
              <FormControlLabel
                sx={switchRowSx}
                control={<Switch checked={barchOnly} onChange={(e) => setBarchOnly(e.target.checked)} />}
                label={<Typography variant="body2">Has a B.Arch college</Typography>}
              />
              <FormControlLabel
                sx={switchRowSx}
                control={<Switch checked={newOnly} onChange={(e) => setNewOnly(e.target.checked)} />}
                label={<Typography variant="body2">{`New in ${DATA_YEAR} only`}</Typography>}
              />
            </Box>
          </Collapse>

          <Button
            fullWidth
            variant={useLocation ? 'contained' : 'outlined'}
            color={useLocation ? 'primary' : 'inherit'}
            onClick={() => setUseLocation(!useLocation)}
            startIcon={<MyLocationIcon />}
            aria-pressed={useLocation}
            sx={{ minHeight: 44, mb: 1.5 }}
          >
            {useLocation ? 'Searching near my location' : 'Search near my location'}
          </Button>

          <Button
            type="submit"
            variant="contained"
            fullWidth
            size="large"
            disabled={loading}
            startIcon={<SearchIcon />}
          >
            {loading ? 'Searching' : 'Search centers'}
          </Button>
        </Paper>

        {/* Results */}
        <Box
          ref={resultsRef}
          component="section"
          aria-labelledby="ec-results-heading"
          aria-busy={loading}
          sx={{ gridArea: 'results', minWidth: 0, scrollMarginTop: { xs: 72, md: 24 } }}
        >
          <Typography
            id="ec-results-heading"
            ref={resultsHeadingRef}
            tabIndex={-1}
            variant="subtitle1"
            component="h2"
            sx={{ mb: 1.5, outline: 'none' }}
          >
            {loading
              ? 'Searching exam centers'
              : hasSearched && !error
                ? `${centers.length} exam center${centers.length === 1 ? '' : 's'} found`
                : 'Results'}
          </Typography>

          {error ? (
            <Alert
              severity="error"
              role="alert"
              action={
                <Button color="inherit" onClick={() => searchCenters()} startIcon={<RefreshIcon />} sx={{ minHeight: 44 }}>
                  Retry
                </Button>
              }
            >
              {error}
            </Alert>
          ) : loading ? (
            <ResultsSkeleton />
          ) : centers.length > 0 ? (
            <Box>
              {(highCount > 0 || tcsCount > 0) && (
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 2 }}>
                  {highCount > 0 && (
                    <Chip label={`${highCount} high confidence`} size="small" color="success" variant="outlined" sx={infoChipSx} />
                  )}
                  {tcsCount > 0 && (
                    <Chip icon={<VerifiedIcon />} label={`${tcsCount} TCS iON verified`} size="small" color="success" variant="outlined" sx={infoChipSx} />
                  )}
                </Box>
              )}
              <Stack spacing={2}>
                {centers.map((center) => (
                  <CenterCard key={center.id} center={center} formatDistance={formatDistance} />
                ))}
              </Stack>
            </Box>
          ) : (
            <Paper
              sx={{
                p: { xs: 3, md: 4 },
                textAlign: 'center',
                minHeight: { xs: 0, md: 280 },
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Box>
                <LocationOnIcon sx={{ fontSize: 44, color: 'text.secondary', mb: 1 }} aria-hidden="true" />
                <Typography variant="h6" component="p" gutterBottom>
                  {hasSearched ? 'No exam centers found' : 'Choose where to look'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {hasSearched
                    ? 'Try a different state, clear a filter, or search by city name.'
                    : 'Pick a state (or turn on your location) and tap Search centers.'}
                </Typography>
              </Box>
            </Paper>
          )}
        </Box>

        {/* Legend */}
        <Paper sx={{ gridArea: 'legend', p: 2, alignSelf: 'start' }}>
          <Typography variant="subtitle2" component="h2" gutterBottom>
            Confidence levels
          </Typography>
          <Box component="ul" sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, listStyle: 'none', p: 0, m: 0 }}>
            {([
              ['HIGH', 'TCS iON confirmed or an official source'],
              ['MEDIUM', 'Strong evidence from past patterns'],
              ['LOW', 'Estimated, pending confirmation'],
            ] as const).map(([level, text]) => (
              <Box component="li" key={level} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box
                  aria-hidden="true"
                  sx={{ width: 12, height: 12, borderRadius: '50%', flexShrink: 0, bgcolor: `${CONFIDENCE_PALETTE[level]}.main` }}
                />
                <Typography variant="body2">
                  <strong>{CONFIDENCE_LABEL[level].replace(' confidence', '')}:</strong> {text}
                </Typography>
              </Box>
            ))}
          </Box>

          <Divider sx={{ my: 1.5 }} />

          <Typography variant="subtitle2" component="h2" gutterBottom>
            Quick tips
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5, color: 'text.secondary', '& li': { typography: 'body2', mb: 0.5 } }}>
            <li>Visit your probable exam center before exam day.</li>
            <li>Centers with TCS iON verification are the most reliable.</li>
            <li>Your final center is printed on your admit card.</li>
          </Box>
        </Paper>

        {/* About */}
        <Paper sx={{ gridArea: 'about', p: { xs: 2, md: 3 } }}>
          <Typography variant="subtitle1" component="h2" gutterBottom>
            About this data
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            These are probable exam center locations based on the NATA {DATA_YEAR} city list, TCS iON digital
            zones, previous year patterns and institutional research. NATA 2026 cities and venues can differ,
            so treat this as a planning guide. Confidence levels show how reliable each prediction is.
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Centers marked &ldquo;TCS iON verified&rdquo; have confirmed addresses from the TCS iON testing
            platform. The exam center assigned to you is the one on your admit card.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Data covers 96 cities across 26 states: 18 high confidence, 28 medium confidence and 50 estimated
            centers. Cities added in {DATA_YEAR} carry a &ldquo;New in {DATA_YEAR}&rdquo; badge.
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
}
