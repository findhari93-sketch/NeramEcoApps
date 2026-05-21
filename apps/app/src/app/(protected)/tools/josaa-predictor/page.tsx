// @ts-nocheck
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
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
  CircularProgress,
  Alert,
  ToggleButtonGroup,
  ToggleButton,
  useTheme,
  useMediaQuery,
  Collapse,
  IconButton,
  Stack,
  Divider,
  Tooltip,
} from '@neram/ui';
import SchoolIcon from '@mui/icons-material/School';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import TuneIcon from '@mui/icons-material/Tune';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { getFirebaseAuth, useFirebaseAuth } from '@neram/auth';
import { AuthGate } from '@/components/AuthGate';

type Chance = 'safe' | 'probable' | 'reach';

interface JosaaPrediction {
  institute: string;
  institute_type: string;
  state: string | null;
  program: string;
  quota: string;
  seat_type: string;
  gender: string;
  opening_rank: number | null;
  closing_rank: number | null;
  margin: number;
  chance: Chance;
  nirf_rank: number | null;
}

const SEAT_TYPES = [
  'OPEN',
  'OBC-NCL',
  'SC',
  'ST',
  'EWS',
  'OPEN (PwD)',
  'OBC-NCL (PwD)',
  'SC (PwD)',
  'ST (PwD)',
  'EWS (PwD)',
];

const QUOTA_OPTIONS = [
  { value: '', label: 'All India (any quota)' },
  { value: 'AI', label: 'All India (AI)' },
  { value: 'HS', label: 'Home State (HS)' },
  { value: 'OS', label: 'Other State (OS)' },
];

const INSTITUTE_TYPES = ['NIT', 'IIT', 'IIIT', 'SPA', 'GFTI'] as const;

const CHANCE_CONFIG: Record<Chance, { label: string; color: string; bgColor: string; description: string }> = {
  safe: {
    label: 'Safe',
    color: '#2E7D32',
    bgColor: '#E8F5E9',
    description: 'Your rank is well within the closing rank. High chance of admission.',
  },
  probable: {
    label: 'Probable',
    color: '#E65100',
    bgColor: '#FFF3E0',
    description: 'Your rank is close to the closing rank. Admission possible.',
  },
  reach: {
    label: 'Reach',
    color: '#C62828',
    bgColor: '#FFEBEE',
    description: 'Your rank is above the closing rank. Admission unlikely but worth considering.',
  },
};

function InstituteTypeChip({ type }: { type: string }) {
  const colors: Record<string, string> = {
    IIT: '#1565C0',
    NIT: '#6A1B9A',
    IIIT: '#00838F',
    SPA: '#AD1457',
    GFTI: '#558B2F',
  };
  return (
    <Chip
      label={type}
      size="small"
      sx={{
        bgcolor: colors[type] || '#616161',
        color: 'white',
        fontWeight: 700,
        fontSize: '0.7rem',
        height: 22,
      }}
    />
  );
}

function PredictionCard({ p }: { p: JosaaPrediction }) {
  const cfg = CHANCE_CONFIG[p.chance];
  return (
    <Card
      variant="outlined"
      sx={{
        borderLeft: `4px solid ${cfg.color}`,
        '&:hover': { boxShadow: 2 },
        transition: 'box-shadow 120ms',
      }}
    >
      <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
        <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 1 }}>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
              <InstituteTypeChip type={p.institute_type} />
              {p.nirf_rank && (
                <Tooltip title="NIRF Architecture rank">
                  <Chip
                    icon={<EmojiEventsIcon sx={{ fontSize: 14 }} />}
                    label={`NIRF #${p.nirf_rank}`}
                    size="small"
                    color="warning"
                    variant="outlined"
                    sx={{ height: 22, fontSize: '0.7rem' }}
                  />
                </Tooltip>
              )}
              {p.quota && (
                <Chip
                  label={p.quota}
                  size="small"
                  variant="outlined"
                  sx={{ height: 22, fontSize: '0.7rem' }}
                />
              )}
            </Stack>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mt: 0.5, lineHeight: 1.25 }}>
              {p.institute}
            </Typography>
            {p.state && (
              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.25 }}>
                <LocationOnIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary">
                  {p.state}
                </Typography>
              </Stack>
            )}
          </Box>
          <Chip
            label={cfg.label}
            size="small"
            sx={{
              bgcolor: cfg.bgColor,
              color: cfg.color,
              fontWeight: 700,
              border: `1px solid ${cfg.color}33`,
            }}
          />
        </Stack>
        <Divider sx={{ my: 1 }} />
        <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
          <Box sx={{ minWidth: 100 }}>
            <Typography variant="caption" color="text.secondary" display="block">
              Program
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {p.program}
            </Typography>
          </Box>
          <Box sx={{ minWidth: 80 }}>
            <Typography variant="caption" color="text.secondary" display="block">
              Closing Rank
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {p.closing_rank?.toLocaleString() ?? '—'}
            </Typography>
          </Box>
          <Box sx={{ minWidth: 80 }}>
            <Typography variant="caption" color="text.secondary" display="block">
              Margin
            </Typography>
            <Typography
              variant="body2"
              fontWeight={600}
              sx={{ color: p.margin >= 0 ? 'success.main' : 'error.main' }}
            >
              {p.margin >= 0 ? '+' : ''}
              {p.margin.toLocaleString()}
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function PredictorContent() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { user } = useFirebaseAuth();

  // Form state
  const [rank, setRank] = useState<string>('');
  const [seatType, setSeatType] = useState<string>('OPEN');
  const [gender, setGender] = useState<string>('Gender-Neutral');
  const [quota, setQuota] = useState<string>('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [year, setYear] = useState<string>('');
  const [roundNo, setRoundNo] = useState<string>('');

  // UI state
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<JosaaPrediction[] | null>(null);
  const [counts, setCounts] = useState<{ safe: number; probable: number; reach: number } | null>(null);

  // Filter state (client-side)
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [top20Only, setTop20Only] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setPredictions(null);
    setCounts(null);

    const rankNum = parseInt(rank, 10);
    if (!Number.isFinite(rankNum) || rankNum < 1) {
      setError('Enter a valid JEE Main Paper 2 rank.');
      return;
    }

    setSubmitted(true);
    if (!user) {
      return;
    }

    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Please sign in again.');

      const res = await fetch('/api/tools/josaa-predictor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          rank: rankNum,
          seatType,
          gender,
          quota: quota || null,
          year: year ? parseInt(year, 10) : null,
          roundNo: roundNo ? parseInt(roundNo, 10) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Request failed');

      setPredictions(data.predictions || []);
      setCounts(data.counts || { safe: 0, probable: 0, reach: 0 });
    } catch (err: any) {
      setError(err?.message || 'Failed to predict colleges.');
    } finally {
      setLoading(false);
    }
  }, [rank, seatType, gender, quota, year, roundNo, user]);

  // Re-run prediction after authentication if the user had already submitted.
  useEffect(() => {
    if (user && submitted && !predictions && !loading) {
      handleSubmit();
    }
  }, [user, submitted, predictions, loading, handleSubmit]);

  const filteredPredictions = useMemo(() => {
    if (!predictions) return null;
    let out = predictions;
    if (typeFilter.length) out = out.filter((p) => typeFilter.includes(p.institute_type));
    if (top20Only) out = out.filter((p) => p.nirf_rank !== null && p.nirf_rank <= 20);
    return out;
  }, [predictions, typeFilter, top20Only]);

  const grouped = useMemo(() => {
    if (!filteredPredictions) return null;
    return {
      safe: filteredPredictions.filter((p) => p.chance === 'safe'),
      probable: filteredPredictions.filter((p) => p.chance === 'probable'),
      reach: filteredPredictions.filter((p) => p.chance === 'reach'),
    };
  }, [filteredPredictions]);

  const toggleTypeFilter = (t: string) => {
    setTypeFilter((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  return (
    <Box sx={{ maxWidth: 960, mx: 'auto', px: { xs: 1.5, sm: 2 }, py: { xs: 2, sm: 3 } }}>
      {/* Header */}
      <Box sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <SchoolIcon color="primary" />
          <Typography variant={isMobile ? 'h6' : 'h5'} fontWeight={700}>
            JoSAA B.Arch Predictor
          </Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Enter your JEE Main Paper 2 rank to see NIT, IIT, IIIT, SPA, and GFTI architecture
          options tagged safe / probable / reach.
        </Typography>
      </Box>

      {/* Form */}
      <Paper
        component="form"
        onSubmit={handleSubmit}
        elevation={0}
        variant="outlined"
        sx={{ p: { xs: 1.5, sm: 2 }, mb: 2, position: 'sticky', top: 8, zIndex: 2, bgcolor: 'background.paper' }}
      >
        <Stack spacing={1.5}>
          <TextField
            fullWidth
            autoFocus
            label="JEE Main Paper 2 Rank"
            value={rank}
            onChange={(e) => setRank(e.target.value.replace(/\D/g, ''))}
            inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', 'aria-label': 'JEE Main Paper 2 rank' }}
            placeholder="e.g. 1247"
            size="medium"
            sx={{ '& .MuiInputBase-root': { minHeight: 48, fontSize: 16 } }}
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <FormControl fullWidth size="medium">
              <InputLabel id="seat-type-label">Category / Seat Type</InputLabel>
              <Select
                labelId="seat-type-label"
                label="Category / Seat Type"
                value={seatType}
                onChange={(e) => setSeatType(e.target.value)}
                sx={{ minHeight: 48 }}
              >
                {SEAT_TYPES.map((t) => (
                  <MenuItem key={t} value={t}>
                    {t}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth size="medium">
              <InputLabel id="quota-label">Quota</InputLabel>
              <Select
                labelId="quota-label"
                label="Quota"
                value={quota}
                onChange={(e) => setQuota(e.target.value)}
                sx={{ minHeight: 48 }}
              >
                {QUOTA_OPTIONS.map((q) => (
                  <MenuItem key={q.value || 'any'} value={q.value}>
                    {q.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          <ToggleButtonGroup
            color="primary"
            value={gender}
            exclusive
            fullWidth
            onChange={(_, v) => v && setGender(v)}
            sx={{ '& .MuiToggleButton-root': { minHeight: 44, textTransform: 'none' } }}
          >
            <ToggleButton value="Gender-Neutral">Gender-Neutral</ToggleButton>
            <ToggleButton value="Female-only (including Supernumerary)">
              {isMobile ? 'Female-only' : 'Female-only (Supernumerary)'}
            </ToggleButton>
          </ToggleButtonGroup>

          <Button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            size="small"
            endIcon={advancedOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
          >
            Advanced (year, round)
          </Button>
          <Collapse in={advancedOpen}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField
                label="Year (optional)"
                value={year}
                onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))}
                placeholder="defaults to latest"
                size="medium"
                fullWidth
                inputProps={{ inputMode: 'numeric' }}
              />
              <TextField
                label="Round (optional)"
                value={roundNo}
                onChange={(e) => setRoundNo(e.target.value.replace(/\D/g, ''))}
                placeholder="defaults to last round"
                size="medium"
                fullWidth
                inputProps={{ inputMode: 'numeric' }}
              />
            </Stack>
          </Collapse>

          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={loading || !rank}
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <SearchIcon />}
            sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}
          >
            {loading ? 'Predicting…' : 'Predict colleges'}
          </Button>
        </Stack>
      </Paper>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Auth gate after submission if not signed in */}
      <AuthGate
        hasData={submitted && !user}
        title="Sign in to see your predictions"
        description="A free Neram account unlocks your full B.Arch predictions and saves them for later."
        pendingData={{ rank, seatType, gender, quota, year, roundNo }}
      >
        <></>
      </AuthGate>

      {/* Results */}
      {grouped && counts && (
        <>
          {/* Filters */}
          <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
              <Stack direction="row" spacing={1} alignItems="center">
                <TuneIcon fontSize="small" />
                <Typography variant="subtitle2" fontWeight={700}>
                  Filters
                </Typography>
                {(typeFilter.length > 0 || top20Only) && (
                  <Chip
                    label={`${typeFilter.length + (top20Only ? 1 : 0)} active`}
                    size="small"
                    color="primary"
                  />
                )}
              </Stack>
              <IconButton size="small" onClick={() => setFiltersOpen((v) => !v)} aria-label="Toggle filters">
                {filtersOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Stack>
            <Collapse in={filtersOpen}>
              <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                    Institute type
                  </Typography>
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                    {INSTITUTE_TYPES.map((t) => (
                      <Chip
                        key={t}
                        label={t}
                        clickable
                        color={typeFilter.includes(t) ? 'primary' : 'default'}
                        variant={typeFilter.includes(t) ? 'filled' : 'outlined'}
                        onClick={() => toggleTypeFilter(t)}
                        sx={{ minHeight: 32 }}
                      />
                    ))}
                  </Stack>
                </Box>
                <Box>
                  <Chip
                    label="Top 20 NIRF only"
                    clickable
                    icon={<EmojiEventsIcon />}
                    color={top20Only ? 'warning' : 'default'}
                    variant={top20Only ? 'filled' : 'outlined'}
                    onClick={() => setTop20Only((v) => !v)}
                    sx={{ minHeight: 32 }}
                  />
                </Box>
              </Stack>
            </Collapse>
          </Paper>

          {/* Summary counts */}
          <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
            {(['safe', 'probable', 'reach'] as Chance[]).map((c) => {
              const cfg = CHANCE_CONFIG[c];
              const localCount = grouped[c].length;
              return (
                <Chip
                  key={c}
                  label={`${cfg.label}: ${localCount}`}
                  sx={{
                    bgcolor: cfg.bgColor,
                    color: cfg.color,
                    fontWeight: 700,
                    border: `1px solid ${cfg.color}33`,
                  }}
                />
              );
            })}
          </Stack>

          {/* Empty state */}
          {filteredPredictions && filteredPredictions.length === 0 && (
            <Alert severity="info" icon={<InfoOutlinedIcon />}>
              No matches at this rank for the chosen seat type / quota. Try a different combination,
              or remove filters.
            </Alert>
          )}

          {/* Grouped results */}
          {(['safe', 'probable', 'reach'] as Chance[]).map((c) => {
            const items = grouped[c];
            if (!items.length) return null;
            const cfg = CHANCE_CONFIG[c];
            return (
              <Box key={c} sx={{ mb: 3 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ color: cfg.color }}>
                    {cfg.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {items.length} {items.length === 1 ? 'option' : 'options'}
                  </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                  {cfg.description}
                </Typography>
                <Stack spacing={1}>
                  {items.map((p, i) => (
                    <PredictionCard key={`${c}-${i}-${p.institute}-${p.program}-${p.seat_type}-${p.quota}`} p={p} />
                  ))}
                </Stack>
              </Box>
            );
          })}
        </>
      )}

      {/* Initial state */}
      {!loading && !predictions && !error && (
        <Alert severity="info" icon={<InfoOutlinedIcon />} sx={{ mt: 2 }}>
          Enter your rank above and tap Predict colleges. Data covers JoSAA rounds for B.Arch and
          B.Plan at NITs, IITs, IIITs, SPAs, and GFTIs.
        </Alert>
      )}
    </Box>
  );
}

export default function JosaaPredictorPage() {
  return <PredictorContent />;
}
