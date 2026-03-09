// @ts-nocheck
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
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
  Tabs,
  Tab,
  useTheme,
  useMediaQuery,
  Collapse,
  Switch,
  FormControlLabel,
  Badge,
  InputAdornment,
  LinearProgress,
  IconButton,
  Autocomplete,
  Tooltip,
} from '@neram/ui';
import SchoolIcon from '@mui/icons-material/School';
import SearchIcon from '@mui/icons-material/Search';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import EventSeatIcon from '@mui/icons-material/EventSeat';
import GroupIcon from '@mui/icons-material/Group';
import FilterListIcon from '@mui/icons-material/FilterList';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import SortIcon from '@mui/icons-material/Sort';
import { useFirebaseAuth, getFirebaseAuth } from '@neram/auth';
import { AuthGate } from '@/components/AuthGate';

// ─── Types ──────────────────────────────────────────────

interface CounselingSystem {
  id: string;
  code: string;
  name: string;
  state: string;
  conducting_body: string;
  merit_formula: { total_marks: number; components: { name: string; max_marks: number }[] };
  categories: { code: string; name: string }[];
  is_active: boolean;
}

interface SeatAwarePrediction {
  collegeCode: string;
  collegeName: string | null;
  city: string | null;
  tier: 'safe' | 'moderate' | 'reach';
  totalSeats: number | null;
  categorySeats: number | null;
  seatsFilledByHigherRank: number;
  categoryFilledByHigherRank: number;
  estimatedRemainingSeats: number | null;
  estimatedRemainingCategorySeats: number | null;
  isFull: boolean;
  isCategoryFull: boolean;
  closingRank: number | null;
  closingMark: number | null;
  predictedRank: number;
  matchCategory: 'general' | 'community';
  studentCategory: string | null;
  coaInstitutionCode: string | null;
  seatDataAvailable: boolean;
}

interface PredictionWithScore extends SeatAwarePrediction {
  competitionScore: number;
}

interface LegacyPrediction {
  id: string;
  name: string;
  city: string;
  state: string;
  collegeType: string;
  annualFee: number | null;
  chance: 'High' | 'Medium' | 'Low';
  cutoffScore: number;
  difference: number;
}

type SortKey = 'bestMatch' | 'competitionAsc' | 'competitionDesc' | 'seats' | 'closingRank' | 'name';

interface Filters {
  search: string;
  cities: string[];
  tiers: ('safe' | 'moderate' | 'reach')[];
  hideFull: boolean;
  onlyWithSeatData: boolean;
}

// ─── Constants ──────────────────────────────────────────

const TIER_CONFIG = {
  safe: { label: 'Safe', color: '#2E7D32', bgColor: '#E8F5E9', chipColor: 'success' as const, tooltip: 'Your rank is well above the closing rank. High chance of admission.' },
  moderate: { label: 'Moderate', color: '#E65100', bgColor: '#FFF3E0', chipColor: 'warning' as const, tooltip: 'Your rank is close to the closing rank. Admission possible but not guaranteed.' },
  reach: { label: 'Reach', color: '#C62828', bgColor: '#FFEBEE', chipColor: 'error' as const, tooltip: 'Your rank is below the closing rank. Admission is unlikely unless seats go vacant.' },
};

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'bestMatch', label: 'Best Match' },
  { value: 'competitionDesc', label: 'Most Competitive' },
  { value: 'competitionAsc', label: 'Least Competitive' },
  { value: 'seats', label: 'Most Seats' },
  { value: 'closingRank', label: 'Closing Rank' },
  { value: 'name', label: 'Name A-Z' },
];

const LEGACY_CATEGORIES = ['General', 'OBC', 'SC', 'ST', 'EWS'];

const DEFAULT_FILTERS: Filters = { search: '', cities: [], tiers: [], hideFull: false, onlyWithSeatData: false };

// ─── Utilities ──────────────────────────────────────────

function computeCompetitionScore(p: SeatAwarePrediction, maxClosingRank: number): number {
  // Competition = how full the college is (seat fill ratio is primary)
  let fillScore = -1;
  let rankScore = -1;

  // Primary: seat fill percentage (higher fill = more competitive)
  if (p.seatDataAvailable && p.totalSeats && p.totalSeats > 0) {
    fillScore = Math.round((p.seatsFilledByHigherRank / p.totalSeats) * 100);
  }
  // Secondary: closing rank (lower closing rank = more competitive)
  if (p.closingRank && p.closingRank > 0 && maxClosingRank > 0) {
    rankScore = Math.round(100 * (1 - (p.closingRank - 1) / Math.max(maxClosingRank, 1)));
  }

  if (fillScore >= 0 && rankScore >= 0) {
    return Math.round(fillScore * 0.7 + rankScore * 0.3);
  }
  if (fillScore >= 0) return fillScore;
  if (rankScore >= 0) return rankScore;
  return 50;
}

function getCompetitionColor(score: number): string {
  if (score <= 30) return '#2E7D32';
  if (score <= 60) return '#E65100';
  if (score <= 80) return '#D84315';
  return '#C62828';
}

function getCompetitionLabel(score: number): string {
  if (score <= 30) return 'Low';
  if (score <= 60) return 'Moderate';
  if (score <= 80) return 'High';
  return 'Very High';
}

// ─── Competition Badge ──────────────────────────────────

function CompetitionBadge({ score }: { score: number }) {
  const color = getCompetitionColor(score);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
      <Typography variant="caption" fontWeight={700} sx={{ color, fontSize: '0.7rem', lineHeight: 1 }}>
        {score}
      </Typography>
      <Box sx={{ width: 24, height: 6, bgcolor: 'grey.200', borderRadius: 3, overflow: 'hidden' }}>
        <Box sx={{ width: `${Math.min(score, 100)}%`, height: '100%', bgcolor: color, borderRadius: 3 }} />
      </Box>
    </Box>
  );
}

// ─── Compact College Row ────────────────────────────────

function CompactCollegeRow({
  prediction,
  expanded,
  onToggle,
  showCommunity,
}: {
  prediction: PredictionWithScore;
  expanded: boolean;
  onToggle: () => void;
  showCommunity?: boolean;
}) {
  const tier = TIER_CONFIG[prediction.tier];
  const remaining = prediction.estimatedRemainingSeats;
  const categoryRemaining = prediction.estimatedRemainingCategorySeats;

  return (
    <Box
      sx={{
        borderBottom: '1px solid',
        borderBottomColor: 'grey.200',
        borderLeft: `4px solid ${prediction.isFull ? '#C62828' : tier.color}`,
        bgcolor: prediction.isFull ? '#FFF8F8' : 'white',
        cursor: 'pointer',
        '&:hover': { bgcolor: prediction.isFull ? '#FFF0F0' : 'grey.50' },
        '&:active': { bgcolor: prediction.isFull ? '#FFE8E8' : 'grey.100' },
      }}
      onClick={onToggle}
    >
      {/* Collapsed row — two lines */}
      <Box sx={{ px: 1.5, py: 0.75 }}>
        {/* Line 1: Name + Tier + Competition */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography
            variant="body2"
            fontWeight={600}
            noWrap
            sx={{
              flex: 1,
              minWidth: 0,
              fontSize: '0.85rem',
              textDecoration: prediction.isFull ? 'none' : 'none',
              color: prediction.isFull ? 'text.secondary' : 'text.primary',
            }}
          >
            {prediction.collegeName || `College ${prediction.collegeCode}`}
          </Typography>
          {prediction.isFull && (
            <Chip
              label="Full"
              size="small"
              sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700, bgcolor: '#FFCDD2', color: '#C62828' }}
            />
          )}
          <Tooltip title={tier.tooltip} arrow enterTouchDelay={0}>
            <Chip
              label={tier.label}
              size="small"
              color={tier.chipColor}
              sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700 }}
            />
          </Tooltip>
          <CompetitionBadge score={prediction.competitionScore} />
        </Box>

        {/* Line 2: City + Code + Seats */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.25 }}>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1, minWidth: 0 }}>
            {prediction.city || 'Unknown'} · {prediction.collegeCode}
          </Typography>
          {prediction.seatDataAvailable && prediction.totalSeats ? (() => {
            // In community tab, show category-specific seats
            const showCatSeats = showCommunity && prediction.studentCategory && prediction.categorySeats;
            const displayRemaining = showCatSeats ? categoryRemaining : remaining;
            const displayTotal = showCatSeats ? prediction.categorySeats : prediction.totalSeats;
            const label = showCatSeats ? `${prediction.studentCategory}: ` : '';
            const isSeatFull = showCatSeats ? prediction.isCategoryFull : prediction.isFull;
            return (
              <Typography
                variant="caption"
                fontWeight={600}
                sx={{
                  color: isSeatFull ? '#C62828' : displayRemaining !== null && displayRemaining !== undefined && displayRemaining <= 5 ? '#E65100' : '#2E7D32',
                  flexShrink: 0,
                  fontSize: '0.7rem',
                }}
              >
                <EventSeatIcon sx={{ fontSize: 12, verticalAlign: 'middle', mr: 0.25 }} />
                {isSeatFull ? `${label}Full` : `${label}${displayRemaining ?? '?'}/${displayTotal} left`}
              </Typography>
            );
          })() : (
            <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0, fontSize: '0.65rem' }}>
              No seat data
            </Typography>
          )}
        </Box>
      </Box>

      {/* Expanded details */}
      <Collapse in={expanded}>
        <Box
          sx={{
            px: 1.5,
            py: 1,
            bgcolor: 'grey.50',
            borderTop: '1px solid',
            borderTopColor: 'grey.200',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 0.5,
          }}
        >
          {prediction.closingRank && (
            <Typography variant="caption" color="text.secondary">
              Closing rank: <strong>{prediction.closingRank}</strong>
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            Your rank: <strong>{prediction.predictedRank}</strong>
          </Typography>
          {showCommunity && prediction.studentCategory && prediction.categorySeats && (
            <Typography variant="caption" color="text.secondary">
              {prediction.studentCategory} seats: <strong>{categoryRemaining ?? '?'}/{prediction.categorySeats} left</strong>
            </Typography>
          )}
          {prediction.seatDataAvailable && prediction.totalSeats && prediction.totalSeats > 0 && (
            <Typography variant="caption" color="text.secondary">
              Seat fill: <strong>{Math.round((prediction.seatsFilledByHigherRank / prediction.totalSeats) * 100)}%</strong>
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            Competition: <strong style={{ color: getCompetitionColor(prediction.competitionScore) }}>
              {getCompetitionLabel(prediction.competitionScore)}
            </strong>
          </Typography>
          {prediction.coaInstitutionCode && (
            <Typography variant="caption" color="text.secondary">
              COA: <strong>{prediction.coaInstitutionCode}</strong>
            </Typography>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

// ─── Sort/Filter Toolbar ────────────────────────────────

function SortFilterToolbar({
  filters,
  onFiltersChange,
  sortKey,
  onSortChange,
  filtersOpen,
  onToggleFilters,
  activeFilterCount,
}: {
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  sortKey: SortKey;
  onSortChange: (k: SortKey) => void;
  filtersOpen: boolean;
  onToggleFilters: () => void;
  activeFilterCount: number;
}) {
  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
      {/* Search */}
      <TextField
        size="small"
        placeholder="Search college name or code..."
        value={filters.search}
        onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
            </InputAdornment>
          ),
        }}
        sx={{ flex: 1, minWidth: 160, '& .MuiInputBase-root': { height: 36 } }}
      />
      {/* Sort + Filter row */}
      <FormControl size="small" sx={{ minWidth: 130 }}>
        <Select
          value={sortKey}
          onChange={(e) => onSortChange(e.target.value as SortKey)}
          startAdornment={<SortIcon sx={{ fontSize: 16, mr: 0.5, color: 'text.secondary' }} />}
          sx={{ height: 36, fontSize: '0.8rem' }}
        >
          {SORT_OPTIONS.map((opt) => (
            <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: '0.85rem' }}>
              {opt.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <IconButton
        size="small"
        onClick={onToggleFilters}
        sx={{
          border: '1px solid',
          borderColor: activeFilterCount > 0 ? 'primary.main' : 'grey.300',
          borderRadius: 1,
          width: 36,
          height: 36,
        }}
      >
        <Badge badgeContent={activeFilterCount} color="primary" sx={{ '& .MuiBadge-badge': { fontSize: '0.6rem', height: 16, minWidth: 16 } }}>
          <FilterListIcon sx={{ fontSize: 18 }} />
        </Badge>
      </IconButton>
    </Box>
  );
}

// ─── Filter Panel ───────────────────────────────────────

function FilterPanel({
  open,
  filters,
  onFiltersChange,
  availableCities,
}: {
  open: boolean;
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  availableCities: string[];
}) {
  const hasActive = filters.cities.length > 0 || filters.tiers.length > 0 || filters.hideFull || filters.onlyWithSeatData;

  return (
    <Collapse in={open}>
      <Paper
        elevation={0}
        sx={{ p: 1.5, mb: 1, borderRadius: 1.5, border: '1px solid', borderColor: 'grey.200', bgcolor: 'grey.50' }}
      >
        {/* City filter */}
        <Autocomplete
          multiple
          size="small"
          options={availableCities}
          value={filters.cities}
          onChange={(_, val) => onFiltersChange({ ...filters, cities: val })}
          renderInput={(params) => <TextField {...params} placeholder="Filter by city..." />}
          sx={{ mb: 1, '& .MuiInputBase-root': { minHeight: 36 } }}
          ChipProps={{ size: 'small', sx: { height: 22, fontSize: '0.7rem' } }}
        />

        {/* Tier chips */}
        <Box sx={{ display: 'flex', gap: 0.5, mb: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Tier:</Typography>
          {(['safe', 'moderate', 'reach'] as const).map((t) => {
            const active = filters.tiers.includes(t);
            return (
              <Chip
                key={t}
                label={TIER_CONFIG[t].label}
                size="small"
                variant={active ? 'filled' : 'outlined'}
                color={TIER_CONFIG[t].chipColor}
                onClick={() => {
                  const tiers = active ? filters.tiers.filter((x) => x !== t) : [...filters.tiers, t];
                  onFiltersChange({ ...filters, tiers });
                }}
                sx={{ height: 24, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
              />
            );
          })}
        </Box>

        {/* Switches */}
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={filters.hideFull}
                onChange={(e) => onFiltersChange({ ...filters, hideFull: e.target.checked })}
              />
            }
            label={<Typography variant="caption">Hide full</Typography>}
            sx={{ mr: 0 }}
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={filters.onlyWithSeatData}
                onChange={(e) => onFiltersChange({ ...filters, onlyWithSeatData: e.target.checked })}
              />
            }
            label={<Typography variant="caption">Seat data only</Typography>}
            sx={{ mr: 0 }}
          />
        </Box>

        {/* Clear filters */}
        {hasActive && (
          <Button
            size="small"
            onClick={() => onFiltersChange({ ...DEFAULT_FILTERS, search: filters.search })}
            sx={{ mt: 0.5, fontSize: '0.75rem', textTransform: 'none' }}
          >
            Clear filters
          </Button>
        )}
      </Paper>
    </Collapse>
  );
}

// ─── Main Page ──────────────────────────────────────────

export default function CounselingCollegePredictorPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const searchParams = useSearchParams();
  const { user } = useFirebaseAuth();

  const urlScore = searchParams.get('score');
  const urlSystem = searchParams.get('system');
  const urlCategory = searchParams.get('category');
  const urlRank = searchParams.get('rank');
  const urlYear = searchParams.get('year');
  const isCounselingMode = !!(urlSystem || urlScore);

  // Systems
  const [systems, setSystems] = useState<CounselingSystem[]>([]);
  const [selectedSystemCode, setSelectedSystemCode] = useState(urlSystem || '');
  const selectedSystem = systems.find((s) => s.code === selectedSystemCode) || null;

  // Input
  const [compositeScore, setCompositeScore] = useState(urlScore || '');
  const [category, setCategory] = useState(urlCategory || '');
  const [year, setYear] = useState(urlYear ? parseInt(urlYear, 10) : 2025);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Seat-aware results
  const [generalPredictions, setGeneralPredictions] = useState<SeatAwarePrediction[]>([]);
  const [communityPredictions, setCommunityPredictions] = useState<SeatAwarePrediction[]>([]);
  const [seatDataAvailable, setSeatDataAvailable] = useState(false);
  const [rankPrediction, setRankPrediction] = useState<any>(null);
  const [resultTab, setResultTab] = useState(0);

  // Sort & filter state
  const [sortKey, setSortKey] = useState<SortKey>('competitionDesc');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Legacy mode
  const [nataScore, setNataScore] = useState('');
  const [legacyCategory, setLegacyCategory] = useState('General');
  const [legacyState, setLegacyState] = useState('');
  const [states, setStates] = useState<string[]>([]);
  const [legacyResults, setLegacyResults] = useState<LegacyPrediction[]>([]);

  // Reset expanded row on sort/filter change
  useEffect(() => {
    setExpandedRow(null);
  }, [sortKey, filters]);

  // Fetch systems on mount
  useEffect(() => {
    if (isCounselingMode) {
      fetch('/api/tools/rank-predictor')
        .then((res) => res.json())
        .then((data) => {
          const allSystems: CounselingSystem[] = data.systems || [];
          setSystems(allSystems);
          if (!selectedSystemCode) {
            const first = allSystems.find((s) => s.is_active);
            if (first) setSelectedSystemCode(first.code);
          }
          const sys = allSystems.find((s) => s.code === (urlSystem || ''));
          if (sys && !category && sys.categories.length > 0) {
            setCategory(sys.categories[0].code);
          }
        })
        .catch(() => {});
    } else {
      fetch('/api/tools/college-predictor')
        .then((res) => res.json())
        .then((data) => setStates(data.states || []))
        .catch(() => {});
    }
  }, []);

  // Auto-predict if URL has score
  useEffect(() => {
    if (urlScore && user && selectedSystem && !hasSearched) {
      handleCounselingPredict();
    }
  }, [user, urlScore, selectedSystem]);

  const handleCounselingPredict = useCallback(async () => {
    if (!selectedSystem) return;
    const score = parseFloat(compositeScore);
    const maxScore = selectedSystem.merit_formula.total_marks;
    if (isNaN(score) || score < 0 || score > maxScore) {
      setError(`Enter a valid score (0–${maxScore})`);
      return;
    }
    setHasSearched(true);
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const idToken = await currentUser.getIdToken();
      const res = await fetch('/api/tools/college-predictor/counseling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          systemCode: selectedSystem.code,
          compositeScore: score,
          category: category || undefined,
          year,
          seatAware: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Prediction failed');

      setGeneralPredictions(data.generalPredictions || []);
      setCommunityPredictions(data.communityPredictions || []);
      setSeatDataAvailable(data.seatDataAvailable || false);
      setRankPrediction(data.rankPrediction || null);
      setResultTab(0);
      setFilters(DEFAULT_FILTERS);
      setSortKey('competitionDesc');
    } catch (err: any) {
      setError(err.message);
      setGeneralPredictions([]);
      setCommunityPredictions([]);
    } finally {
      setLoading(false);
    }
  }, [compositeScore, category, year, user, selectedSystem]);

  const handleLegacyPredict = useCallback(async () => {
    const score = parseFloat(nataScore);
    if (isNaN(score) || score < 0 || score > 200) {
      setError('Enter a valid NATA score (0–200)');
      return;
    }
    setHasSearched(true);
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const idToken = await currentUser.getIdToken();
      const res = await fetch('/api/tools/college-predictor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ nataScore: score, category: legacyCategory, state: legacyState || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Prediction failed');
      setLegacyResults(data.predictions || []);
    } catch (err: any) {
      setError(err.message);
      setLegacyResults([]);
    } finally {
      setLoading(false);
    }
  }, [nataScore, legacyCategory, legacyState, user]);

  // Re-fetch on auth
  useEffect(() => {
    if (user && hasSearched && generalPredictions.length === 0 && legacyResults.length === 0 && !loading) {
      if (isCounselingMode) handleCounselingPredict();
      else handleLegacyPredict();
    }
  }, [user]);

  // ─── Derived data ─────────────────────────────────────

  const categoryOptions = selectedSystem
    ? selectedSystem.categories.map((c) => ({ value: c.code, label: c.code }))
    : [];

  const availableCities = useMemo(() => {
    const cities = new Set<string>();
    [...generalPredictions, ...communityPredictions].forEach((p) => {
      if (p.city) cities.add(p.city);
    });
    return Array.from(cities).sort();
  }, [generalPredictions, communityPredictions]);

  const currentTabPredictions = resultTab === 0 ? generalPredictions : communityPredictions;

  const displayPredictions = useMemo(() => {
    // Compute max closing rank from the full dataset for normalization
    const closingRanks = currentTabPredictions
      .filter((p) => p.closingRank && p.closingRank > 0)
      .map((p) => p.closingRank!);
    const maxClosingRank = closingRanks.length > 0 ? Math.max(...closingRanks) : 1;

    // Add competition scores (relative to dataset)
    let result: PredictionWithScore[] = currentTabPredictions.map((p) => ({
      ...p,
      competitionScore: computeCompetitionScore(p, maxClosingRank),
    }));

    // Search filter
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (p) =>
          p.collegeName?.toLowerCase().includes(q) ||
          p.collegeCode.toLowerCase().includes(q) ||
          p.city?.toLowerCase().includes(q)
      );
    }

    // City filter
    if (filters.cities.length > 0) {
      result = result.filter((p) => p.city && filters.cities.includes(p.city));
    }

    // Tier filter
    if (filters.tiers.length > 0) {
      result = result.filter((p) => filters.tiers.includes(p.tier));
    }

    // Hide full
    if (filters.hideFull) {
      result = result.filter((p) => !p.isFull);
    }

    // Only with seat data
    if (filters.onlyWithSeatData) {
      result = result.filter((p) => p.seatDataAvailable);
    }

    // Sort
    const tierOrder = { safe: 0, moderate: 1, reach: 2 };
    result = [...result].sort((a, b) => {
      switch (sortKey) {
        case 'bestMatch': {
          const tierDiff = tierOrder[a.tier] - tierOrder[b.tier];
          if (tierDiff !== 0) return tierDiff;
          return (b.estimatedRemainingSeats ?? 999) - (a.estimatedRemainingSeats ?? 999);
        }
        case 'competitionAsc':
          return a.competitionScore - b.competitionScore;
        case 'competitionDesc':
          return b.competitionScore - a.competitionScore;
        case 'seats':
          return (b.estimatedRemainingSeats ?? -1) - (a.estimatedRemainingSeats ?? -1);
        case 'closingRank':
          return (a.closingRank ?? 99999) - (b.closingRank ?? 99999);
        case 'name':
          return (a.collegeName || '').localeCompare(b.collegeName || '');
        default:
          return 0;
      }
    });

    return result;
  }, [currentTabPredictions, filters, sortKey]);

  const activeFilterCount = [
    filters.cities.length > 0,
    filters.tiers.length > 0,
    filters.hideFull,
    filters.onlyWithSeatData,
  ].filter(Boolean).length;

  const generalTierCounts = {
    safe: generalPredictions.filter((r) => r.tier === 'safe').length,
    moderate: generalPredictions.filter((r) => r.tier === 'moderate').length,
    reach: generalPredictions.filter((r) => r.tier === 'reach').length,
  };

  const hasResults = generalPredictions.length > 0 || communityPredictions.length > 0;
  const isFiltered = filters.search || activeFilterCount > 0;

  // ─── Render ───────────────────────────────────────────

  return (
    <Box sx={{ maxWidth: 700, mx: 'auto', pb: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <Box sx={{ width: 40, height: 40, borderRadius: 1.5, bgcolor: '#1565C0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <SchoolIcon sx={{ color: 'white', fontSize: 22 }} />
        </Box>
        <Box>
          <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2 }}>College Predictor</Typography>
          <Typography variant="caption" color="text.secondary">
            {isCounselingMode ? 'Seat-aware predictions based on your counseling score' : 'Find colleges matching your NATA score'}
          </Typography>
        </Box>
      </Box>

      {/* Counseling Mode */}
      {isCounselingMode ? (
        <>
          <Paper elevation={0} sx={{ p: isMobile ? 2 : 2.5, mb: 2, borderRadius: 2, border: '1px solid', borderColor: 'grey.200' }}>
            {/* Row 1: System + Score */}
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
              <FormControl size="small" sx={{ minWidth: 200, flex: 1 }}>
                <InputLabel>Counseling System</InputLabel>
                <Select
                  value={selectedSystemCode}
                  onChange={(e) => { setSelectedSystemCode(e.target.value); setCategory(''); setGeneralPredictions([]); setCommunityPredictions([]); }}
                  label="Counseling System"
                >
                  {systems.map((sys) => (
                    <MenuItem key={sys.code} value={sys.code} disabled={!sys.is_active}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                        <span>{sys.name}</span>
                        {!sys.is_active && <Chip label="Soon" size="small" sx={{ height: 18, fontSize: '0.6rem', ml: 'auto' }} />}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="small"
                label={selectedSystem ? `Score (/${selectedSystem.merit_formula.total_marks})` : 'Composite Score'}
                type="number"
                value={compositeScore}
                onChange={(e) => setCompositeScore(e.target.value)}
                inputProps={{ min: 0, max: selectedSystem?.merit_formula.total_marks || 400, step: 0.01 }}
                sx={{ flex: 1, minWidth: 140 }}
              />
            </Box>
            {/* Row 2: Category + Year + Button */}
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <FormControl size="small" sx={{ minWidth: 120, flex: 1 }}>
                <InputLabel>Category</InputLabel>
                <Select value={category} onChange={(e) => setCategory(e.target.value)} label="Category">
                  {categoryOptions.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField
                size="small" label="Year" type="number" value={year}
                onChange={(e) => setYear(parseInt(e.target.value, 10))}
                sx={{ width: 80 }}
              />
              <Button
                variant="contained" onClick={handleCounselingPredict}
                disabled={loading || !compositeScore || !selectedSystem}
                startIcon={loading ? <CircularProgress size={16} /> : <SearchIcon sx={{ fontSize: 18 }} />}
                sx={{ py: 0.9, px: 2.5, bgcolor: '#1565C0', '&:hover': { bgcolor: '#0D47A1' }, whiteSpace: 'nowrap' }}
              >
                {loading ? 'Loading...' : 'Predict'}
              </Button>
            </Box>
          </Paper>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <AuthGate
            hasData={hasSearched}
            pendingData={{ compositeScore, category, year }}
            onAuthenticated={handleCounselingPredict}
            title="Sign up to see college predictions"
            description="Create a free account to view colleges that match your score."
          >
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
            ) : hasResults ? (
              <Box>
                {/* Rank summary */}
                {rankPrediction && (
                  <Paper elevation={0} sx={{ p: 1.5, mb: 1.5, borderRadius: 1.5, bgcolor: '#E3F2FD', border: '1px solid', borderColor: '#90CAF9' }}>
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                      <Typography variant="body2">
                        Predicted Rank: <strong>{rankPrediction.predictedRankMin}–{rankPrediction.predictedRankMax}</strong>
                      </Typography>
                      <Typography variant="body2">
                        Percentile: <strong>{rankPrediction.percentile?.toFixed(1)}%</strong>
                      </Typography>
                      {rankPrediction.categoryRankMin && (
                        <Typography variant="body2">
                          {category} Rank: <strong>{rankPrediction.categoryRankMin}–{rankPrediction.categoryRankMax}</strong>
                        </Typography>
                      )}
                    </Box>
                  </Paper>
                )}

                {/* Summary chips */}
                <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
                  {(['safe', 'moderate', 'reach'] as const).map((t) => (
                    <Tooltip key={t} title={TIER_CONFIG[t].tooltip} arrow enterTouchDelay={0}>
                      <Chip label={`${TIER_CONFIG[t].label}: ${generalTierCounts[t]}`}
                        sx={{ bgcolor: TIER_CONFIG[t].bgColor, color: TIER_CONFIG[t].color, fontWeight: 600, fontSize: '0.8rem' }} />
                    </Tooltip>
                  ))}
                  {seatDataAvailable && (
                    <Chip icon={<EventSeatIcon sx={{ fontSize: 14 }} />} label="Seat data available" size="small" color="info" variant="outlined" />
                  )}
                </Box>

                {/* Search / Sort / Filter toolbar */}
                <SortFilterToolbar
                  filters={filters}
                  onFiltersChange={setFilters}
                  sortKey={sortKey}
                  onSortChange={setSortKey}
                  filtersOpen={filtersOpen}
                  onToggleFilters={() => setFiltersOpen((o) => !o)}
                  activeFilterCount={activeFilterCount}
                />
                <FilterPanel
                  open={filtersOpen}
                  filters={filters}
                  onFiltersChange={setFilters}
                  availableCities={availableCities}
                />

                {/* Tabs: General + Community */}
                {communityPredictions.length > 0 && (
                  <Tabs
                    value={resultTab}
                    onChange={(_, v) => setResultTab(v)}
                    variant="fullWidth"
                    sx={{
                      mb: 1,
                      minHeight: 40,
                      '& .MuiTab-root': { minHeight: 40, py: 0.5, fontSize: '0.85rem', fontWeight: 600 },
                      '& .MuiTabs-indicator': { height: 3, borderRadius: 1.5 },
                    }}
                  >
                    <Tab
                      icon={<SchoolIcon sx={{ fontSize: 18 }} />}
                      iconPosition="start"
                      label={`General (${generalPredictions.length})`}
                    />
                    <Tab
                      icon={<GroupIcon sx={{ fontSize: 18 }} />}
                      iconPosition="start"
                      label={`Via ${category} (${communityPredictions.length})`}
                    />
                  </Tabs>
                )}

                {/* Community info alert */}
                {resultTab === 1 && communityPredictions.length > 0 && (
                  <Alert severity="info" sx={{ mb: 1, py: 0.25 }}>
                    <Typography variant="caption">
                      These colleges have <strong>{category}</strong> reserved seats available.
                      Even if general seats are full, you may get admission through community quota.
                    </Typography>
                  </Alert>
                )}

                {/* Result count */}
                {isFiltered && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    Showing {displayPredictions.length} of {currentTabPredictions.length} colleges
                  </Typography>
                )}

                {/* Compact result list */}
                {displayPredictions.length > 0 ? (
                  <Paper
                    elevation={0}
                    sx={{ border: '1px solid', borderColor: 'grey.200', borderRadius: 1.5, overflow: 'hidden' }}
                  >
                    {displayPredictions.map((p) => (
                      <CompactCollegeRow
                        key={`${resultTab}-${p.collegeCode}`}
                        prediction={p}
                        expanded={expandedRow === p.collegeCode}
                        onToggle={() => setExpandedRow(expandedRow === p.collegeCode ? null : p.collegeCode)}
                        showCommunity={resultTab === 1}
                      />
                    ))}
                  </Paper>
                ) : isFiltered ? (
                  <Paper sx={{ p: 3, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">No colleges match your filters</Typography>
                    <Button
                      size="small"
                      onClick={() => { setFilters(DEFAULT_FILTERS); setFiltersOpen(false); }}
                      sx={{ mt: 1, textTransform: 'none' }}
                    >
                      Clear all filters
                    </Button>
                  </Paper>
                ) : null}
              </Box>
            ) : hasSearched && user ? (
              <Paper sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body1" color="text.secondary" gutterBottom>No colleges found for this score</Typography>
                <Typography variant="caption" color="text.secondary">
                  Try a different year or category. Data may not be available yet.
                </Typography>
              </Paper>
            ) : (
              <Paper sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body1" color="text.secondary" gutterBottom>Enter your composite score to see predictions</Typography>
                <Button variant="outlined" size="small" href="/tools/nata/cutoff-calculator" sx={{ mt: 1 }} endIcon={<ArrowForwardIcon />}>
                  Cutoff Calculator
                </Button>
              </Paper>
            )}
          </AuthGate>
        </>
      ) : (
        /* Legacy Mode */
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>Enter Your Details</Typography>
              <TextField fullWidth size="small" label="NATA Score" type="number" value={nataScore}
                onChange={(e) => setNataScore(e.target.value)} placeholder="0–200" sx={{ mb: 1.5 }}
                inputProps={{ min: 0, max: 200 }} />
              <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
                <InputLabel>Category</InputLabel>
                <Select value={legacyCategory} label="Category" onChange={(e) => setLegacyCategory(e.target.value)}>
                  {LEGACY_CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <InputLabel>State</InputLabel>
                <Select value={legacyState} label="State" onChange={(e) => setLegacyState(e.target.value)}>
                  <MenuItem value="">Any</MenuItem>
                  {states.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                </Select>
              </FormControl>
              <Button variant="contained" fullWidth onClick={handleLegacyPredict} disabled={loading || !nataScore}>
                {loading ? <CircularProgress size={20} /> : 'Predict Colleges'}
              </Button>
              <Paper sx={{ p: 1.5, mt: 1.5, bgcolor: '#E3F2FD', border: '1px solid', borderColor: '#1565C0' }}>
                <Typography variant="caption" fontWeight={600}>Try Enhanced Predictions</Typography>
                <Button size="small" variant="outlined" fullWidth href="/tools/nata/cutoff-calculator"
                  endIcon={<ArrowForwardIcon />} sx={{ mt: 0.5 }}>Cutoff Calculator</Button>
              </Paper>
            </Paper>
          </Grid>
          <Grid item xs={12} md={8}>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <AuthGate hasData={hasSearched} pendingData={{ nataScore, category: legacyCategory, state: legacyState }}
              onAuthenticated={handleLegacyPredict} title="Sign up to see predictions"
              description="Create a free account to view colleges matching your NATA score.">
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
              ) : legacyResults.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {legacyResults.map((c) => (
                    <Card key={c.id} elevation={0} sx={{ border: '1px solid', borderColor: 'grey.200' }}>
                      <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.25 }}>
                          <Typography variant="body2" fontWeight={600}>{c.name}</Typography>
                          <Chip label={`${c.chance}`} size="small"
                            color={c.chance === 'High' ? 'success' : c.chance === 'Medium' ? 'warning' : 'error'} />
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                          <Chip label={`${c.city}, ${c.state}`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                          <Chip label={c.collegeType} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                          {c.cutoffScore > 0 && <Chip label={`Cutoff: ${c.cutoffScore}`} size="small" variant="outlined" color="primary" sx={{ height: 20, fontSize: '0.7rem' }} />}
                        </Box>
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              ) : hasSearched && user ? (
                <Paper sx={{ p: 3, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">No colleges found. Try different filters.</Typography>
                </Paper>
              ) : (
                <Paper sx={{ p: 4, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
                  <Typography variant="body2" color="text.secondary">Enter your NATA score to get predictions</Typography>
                </Paper>
              )}
            </AuthGate>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
