'use client';

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { alpha, type Theme } from '@mui/material/styles';
import ButtonBase from '@mui/material/ButtonBase';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Chip,
  MenuItem,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Collapse,
  Switch,
  FormControlLabel,
  Badge,
  InputAdornment,
  IconButton,
  Autocomplete,
  Skeleton,
  ToggleButton,
  ToggleButtonGroup,
} from '@neram/ui';
import SchoolIcon from '@mui/icons-material/School';
import SearchIcon from '@mui/icons-material/Search';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import EventSeatIcon from '@mui/icons-material/EventSeat';
import GroupIcon from '@mui/icons-material/Group';
import FilterListIcon from '@mui/icons-material/FilterList';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SortIcon from '@mui/icons-material/Sort';
import { getFirebaseAuth } from '@neram/auth';
import { useToolOpened } from '@/hooks/useToolOpened';
import ToolPageHeader from '@/components/tools-hub/ToolPageHeader';
import RetryAlert from '@/components/counseling/RetryAlert';
import {
  pickDefaultSystem,
  resolveSystemCode,
  isSystemSelectable,
  readJsonOrThrow,
  isAbortError,
} from '@/components/counseling/counselingSystems';

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
  has_data?: boolean;
}

type Tier = 'safe' | 'moderate' | 'reach';

interface SeatAwarePrediction {
  collegeCode: string;
  collegeName: string | null;
  city: string | null;
  tier: Tier;
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

interface RankPrediction {
  predictedRankMin?: number | null;
  predictedRankMax?: number | null;
  percentile?: number | null;
  categoryRankMin?: number | null;
  categoryRankMax?: number | null;
}

type SortKey = 'bestMatch' | 'competitionAsc' | 'competitionDesc' | 'seats' | 'closingRank' | 'name';

interface Filters {
  search: string;
  cities: string[];
  tiers: Tier[];
  hideFull: boolean;
  onlyWithSeatData: boolean;
}

type LoadStatus = 'loading' | 'ready' | 'error';
type PaletteKey = 'success' | 'warning' | 'error';

// ─── Constants ──────────────────────────────────────────

const TIER_CONFIG: Record<Tier, { label: string; paletteKey: PaletteKey; meaning: string }> = {
  safe: { label: 'Safe', paletteKey: 'success', meaning: 'your rank is well inside the closing rank, a high chance of admission' },
  moderate: { label: 'Moderate', paletteKey: 'warning', meaning: 'your rank is close to the closing rank, possible but not certain' },
  reach: { label: 'Reach', paletteKey: 'error', meaning: 'your rank is past the closing rank, unlikely unless seats go vacant' },
};

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'bestMatch', label: 'Best match' },
  { value: 'competitionDesc', label: 'Most competitive' },
  { value: 'competitionAsc', label: 'Least competitive' },
  { value: 'seats', label: 'Most seats left' },
  { value: 'closingRank', label: 'Closing rank' },
  { value: 'name', label: 'Name A to Z' },
];

const DEFAULT_FILTERS: Filters = { search: '', cities: [], tiers: [], hideFull: false, onlyWithSeatData: false };

const CONTROL_HEIGHT = 48;

// ─── Utilities ──────────────────────────────────────────

/** Readable text colour for a status on the current background */
function toneText(t: Theme, key: PaletteKey): string {
  return t.palette.mode === 'dark' ? t.palette[key].main : t.palette[key].dark;
}

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

function competitionTone(score: number): PaletteKey {
  if (score <= 30) return 'success';
  if (score <= 60) return 'warning';
  return 'error';
}

function getCompetitionLabel(score: number): string {
  if (score <= 30) return 'Low';
  if (score <= 60) return 'Moderate';
  if (score <= 80) return 'High';
  return 'Very high';
}

function formatRankRange(min?: number | null, max?: number | null): string | null {
  if (min == null) return null;
  if (max == null || max === min) return min.toLocaleString('en-IN');
  return `${min.toLocaleString('en-IN')}–${max.toLocaleString('en-IN')}`;
}

// ─── Small pieces ───────────────────────────────────────

function TierChip({ tier }: { tier: Tier }) {
  const c = TIER_CONFIG[tier];
  return (
    <Chip
      label={c.label}
      size="small"
      sx={(t) => ({
        height: 24,
        fontSize: '0.75rem',
        fontWeight: 700,
        color: toneText(t, c.paletteKey),
        bgcolor: alpha(t.palette[c.paletteKey].main, t.palette.mode === 'dark' ? 0.18 : 0.12),
      })}
    />
  );
}

function CompetitionBadge({ score }: { score: number }) {
  const tone = competitionTone(score);
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
        Competition
      </Typography>
      <Typography variant="caption" fontWeight={700} sx={(t) => ({ color: toneText(t, tone), lineHeight: 1 })}>
        {score}
      </Typography>
      <Box aria-hidden="true" sx={{ width: 28, height: 6, bgcolor: 'action.disabledBackground', borderRadius: 3, overflow: 'hidden' }}>
        <Box sx={{ width: `${Math.min(score, 100)}%`, height: '100%', bgcolor: `${tone}.main`, borderRadius: 3 }} />
      </Box>
    </Box>
  );
}

// ─── College row (a real button that expands details) ───

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
  const detailsId = `college-details-${prediction.collegeCode}-${showCommunity ? 'c' : 'g'}`;
  const name = prediction.collegeName || `College ${prediction.collegeCode}`;

  let seats: { text: string; tone: PaletteKey } | null = null;
  if (prediction.seatDataAvailable && prediction.totalSeats) {
    const showCatSeats = !!(showCommunity && prediction.studentCategory && prediction.categorySeats);
    const displayRemaining = showCatSeats ? categoryRemaining : remaining;
    const displayTotal = showCatSeats ? prediction.categorySeats : prediction.totalSeats;
    const label = showCatSeats ? `${prediction.studentCategory}: ` : '';
    const isSeatFull = showCatSeats ? prediction.isCategoryFull : prediction.isFull;
    seats = isSeatFull
      ? { text: `${label}Full`, tone: 'error' }
      : {
          text: `${label}${displayRemaining ?? '?'} of ${displayTotal} left`,
          tone: displayRemaining != null && displayRemaining <= 5 ? 'warning' : 'success',
        };
  }

  return (
    <Box
      component="li"
      sx={(t) => ({
        borderBottom: '1px solid',
        borderBottomColor: 'divider',
        borderLeft: '4px solid',
        borderLeftColor: prediction.isFull ? t.palette.error.main : t.palette[tier.paletteKey].main,
        bgcolor: prediction.isFull ? alpha(t.palette.error.main, t.palette.mode === 'dark' ? 0.1 : 0.05) : 'background.paper',
        '&:last-of-type': { borderBottom: 'none' },
      })}
    >
      <ButtonBase
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={detailsId}
        sx={{
          width: '100%',
          display: 'block',
          textAlign: 'left',
          px: 2,
          py: 1.25,
          minHeight: 56,
          '&:hover': { bgcolor: 'action.hover' },
          '&.Mui-focusVisible': { outlineOffset: -2 },
        }}
      >
        {/* Line 1: name + expand affordance */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Typography
            variant="body2"
            fontWeight={600}
            sx={{ flex: 1, minWidth: 0, fontSize: '0.9375rem', color: prediction.isFull ? 'text.secondary' : 'text.primary' }}
          >
            {name}
          </Typography>
          <ExpandMoreIcon
            aria-hidden="true"
            sx={{
              color: 'text.secondary',
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s',
              flexShrink: 0,
            }}
          />
        </Box>

        {/* Line 2: chance, full, competition */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.75 }}>
          <TierChip tier={prediction.tier} />
          {prediction.isFull && (
            <Chip
              label="Full"
              size="small"
              sx={(t) => ({ height: 24, fontSize: '0.75rem', fontWeight: 700, color: toneText(t, 'error'), bgcolor: alpha(t.palette.error.main, 0.14) })}
            />
          )}
          <CompetitionBadge score={prediction.competitionScore} />
        </Box>

        {/* Line 3: city, code and seats */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 0 }}>
            {prediction.city || 'City not listed'} · {prediction.collegeCode}
          </Typography>
          {seats ? (
            <Typography
              variant="caption"
              fontWeight={600}
              sx={(t) => ({ color: toneText(t, seats!.tone), display: 'inline-flex', alignItems: 'center', gap: 0.25 })}
            >
              <EventSeatIcon aria-hidden="true" sx={{ fontSize: 14 }} />
              {seats.text}
            </Typography>
          ) : (
            <Typography variant="caption" color="text.secondary">
              No seat data
            </Typography>
          )}
        </Box>
      </ButtonBase>

      {/* Expanded details */}
      <Collapse in={expanded} id={detailsId}>
        <Box
          sx={{
            px: 2,
            py: 1.25,
            bgcolor: 'action.hover',
            borderTop: '1px solid',
            borderTopColor: 'divider',
            display: 'grid',
            gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' },
            gap: 1,
          }}
        >
          {prediction.closingRank != null && (
            <Typography variant="body2" color="text.secondary">
              Closing rank: <strong>{prediction.closingRank}</strong>
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary">
            Your rank: <strong>{prediction.predictedRank}</strong>
          </Typography>
          {showCommunity && prediction.studentCategory && prediction.categorySeats ? (
            <Typography variant="body2" color="text.secondary">
              {prediction.studentCategory} seats: <strong>{categoryRemaining ?? '?'} of {prediction.categorySeats} left</strong>
            </Typography>
          ) : null}
          {prediction.seatDataAvailable && prediction.totalSeats && prediction.totalSeats > 0 ? (
            <Typography variant="body2" color="text.secondary">
              Seats filled: <strong>{Math.round((prediction.seatsFilledByHigherRank / prediction.totalSeats) * 100)}%</strong>
            </Typography>
          ) : null}
          <Typography variant="body2" color="text.secondary">
            Competition:{' '}
            <Box component="strong" sx={(t) => ({ color: toneText(t, competitionTone(prediction.competitionScore)) })}>
              {getCompetitionLabel(prediction.competitionScore)}
            </Box>
          </Typography>
          {prediction.coaInstitutionCode && (
            <Typography variant="body2" color="text.secondary">
              COA: <strong>{prediction.coaInstitutionCode}</strong>
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ gridColumn: '1 / -1' }}>
            {tier.label}: {tier.meaning}.
          </Typography>
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
    <Box
      sx={{
        display: 'grid',
        gap: 1,
        mb: 1,
        gridTemplateColumns: { xs: 'minmax(0,1fr) auto', sm: 'minmax(0,1fr) 210px auto' },
      }}
    >
      <TextField
        size="small"
        placeholder="Search college, code or city"
        value={filters.search}
        onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
        inputProps={{ 'aria-label': 'Search colleges' }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon aria-hidden="true" sx={{ fontSize: 20, color: 'text.secondary' }} />
            </InputAdornment>
          ),
        }}
        sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' }, '& .MuiInputBase-root': { minHeight: CONTROL_HEIGHT } }}
      />
      <TextField
        select
        size="small"
        value={sortKey}
        onChange={(e) => onSortChange(e.target.value as SortKey)}
        SelectProps={{ inputProps: { 'aria-label': 'Sort by' } }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SortIcon aria-hidden="true" sx={{ fontSize: 20, color: 'text.secondary' }} />
            </InputAdornment>
          ),
        }}
        sx={{ minWidth: 0, '& .MuiInputBase-root': { minHeight: CONTROL_HEIGHT } }}
      >
        {SORT_OPTIONS.map((opt) => (
          <MenuItem key={opt.value} value={opt.value} sx={{ minHeight: 48 }}>
            {opt.label}
          </MenuItem>
        ))}
      </TextField>
      <IconButton
        onClick={onToggleFilters}
        aria-label={activeFilterCount > 0 ? `Filters, ${activeFilterCount} on` : 'Filters'}
        aria-expanded={filtersOpen}
        aria-controls="college-filter-panel"
        sx={{
          border: '1px solid',
          borderColor: activeFilterCount > 0 || filtersOpen ? 'primary.main' : 'divider',
          width: CONTROL_HEIGHT,
          height: CONTROL_HEIGHT,
        }}
      >
        <Badge badgeContent={activeFilterCount} color="primary" sx={{ '& .MuiBadge-badge': { fontSize: '0.75rem' } }}>
          <FilterListIcon aria-hidden="true" />
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
    <Collapse in={open} id="college-filter-panel">
      <Paper elevation={0} sx={{ p: 2, mb: 1, borderRadius: 2, bgcolor: 'action.hover' }}>
        <Autocomplete
          multiple
          size="small"
          options={availableCities}
          value={filters.cities}
          onChange={(_, val) => onFiltersChange({ ...filters, cities: val })}
          renderInput={(params) => <TextField {...params} label="Cities" placeholder="Filter by city" />}
          sx={{ mb: 2, '& .MuiInputBase-root': { minHeight: CONTROL_HEIGHT } }}
          ChipProps={{ size: 'small', sx: { fontSize: '0.75rem' } }}
        />

        <Typography id="tier-filter-label" variant="body2" fontWeight={600} sx={{ mb: 0.75 }}>
          Chance
        </Typography>
        <ToggleButtonGroup
          value={filters.tiers}
          onChange={(_, tiers: Tier[]) => onFiltersChange({ ...filters, tiers })}
          aria-labelledby="tier-filter-label"
          color="primary"
          fullWidth
          sx={{ mb: 1.5 }}
        >
          {(['safe', 'moderate', 'reach'] as const).map((t) => (
            <ToggleButton key={t} value={t}>
              {TIER_CONFIG[t].label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <Box sx={{ display: 'flex', columnGap: 3, rowGap: 0.5, flexWrap: 'wrap' }}>
          <FormControlLabel
            control={
              <Switch
                checked={filters.hideFull}
                onChange={(e) => onFiltersChange({ ...filters, hideFull: e.target.checked })}
              />
            }
            label={<Typography variant="body2">Hide full colleges</Typography>}
            sx={{ mr: 0, minHeight: 44 }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={filters.onlyWithSeatData}
                onChange={(e) => onFiltersChange({ ...filters, onlyWithSeatData: e.target.checked })}
              />
            }
            label={<Typography variant="body2">Only with seat data</Typography>}
            sx={{ mr: 0, minHeight: 44 }}
          />
        </Box>

        {hasActive && (
          <Button onClick={() => onFiltersChange({ ...DEFAULT_FILTERS, search: filters.search })} sx={{ mt: 1 }}>
            Clear filters
          </Button>
        )}
      </Paper>
    </Collapse>
  );
}

// ─── Skeletons ──────────────────────────────────────────

function FormSkeleton() {
  return (
    <Paper elevation={0} sx={{ p: { xs: 2, sm: 2.5 }, mb: 2, borderRadius: 2 }} aria-busy="true" aria-label="Loading">
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' } }}>
        <Skeleton variant="rounded" height={56} />
        <Skeleton variant="rounded" height={56} />
      </Box>
      <Box sx={{ display: 'grid', gap: 2, mt: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr auto' } }}>
        <Skeleton variant="rounded" height={56} />
        <Skeleton variant="rounded" height={56} />
        <Skeleton variant="rounded" height={48} sx={{ minWidth: 140, gridColumn: { sm: '1 / -1', md: 'auto' } }} />
      </Box>
    </Paper>
  );
}

function ResultsSkeleton() {
  return (
    <Box aria-busy="true" aria-label="Finding colleges">
      <Skeleton variant="rounded" height={52} sx={{ mb: 1.5 }} />
      <Paper elevation={0} sx={{ borderRadius: 2, overflow: 'hidden' }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Box key={i} sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Skeleton width="70%" height={22} />
            <Skeleton width="45%" height={20} />
          </Box>
        ))}
      </Paper>
    </Box>
  );
}

// ─── Main Page ──────────────────────────────────────────

export default function CounselingCollegePredictorPage() {
  useToolOpened('college_predictor_counseling');
  return (
    <Box sx={{ maxWidth: 760, mx: 'auto' }}>
      <ToolPageHeader toolId="counseling-college-predictor" />
      <Suspense fallback={<FormSkeleton />}>
        <CollegePredictorFromUrl />
      </Suspense>
    </Box>
  );
}

/** Re-mount the tool when the query string changes, so new URL inputs always apply */
function CollegePredictorFromUrl() {
  const searchParams = useSearchParams();
  const urlYear = searchParams.get('year');
  const parsedYear = urlYear ? parseInt(urlYear, 10) : NaN;
  return (
    <CollegePredictorContent
      key={searchParams.toString()}
      urlScore={searchParams.get('score')}
      urlSystem={searchParams.get('system')}
      urlCategory={searchParams.get('category')}
      urlYear={Number.isFinite(parsedYear) ? parsedYear : null}
    />
  );
}

function CollegePredictorContent({
  urlScore,
  urlSystem,
  urlCategory,
  urlYear,
}: {
  urlScore: string | null;
  urlSystem: string | null;
  urlCategory: string | null;
  urlYear: number | null;
}) {
  // Systems
  const [systems, setSystems] = useState<CounselingSystem[]>([]);
  const [systemsStatus, setSystemsStatus] = useState<LoadStatus>('loading');
  const [systemsReload, setSystemsReload] = useState(0);
  const [selectedSystemCode, setSelectedSystemCode] = useState('');
  const selectedSystem = systems.find((s) => s.code === selectedSystemCode) || null;
  /** true when the open system came from ?system= (or none was asked for) */
  const [urlSystemHonoured, setUrlSystemHonoured] = useState(false);

  // Years
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [yearsStatus, setYearsStatus] = useState<LoadStatus>('loading');
  const [yearsReload, setYearsReload] = useState(0);

  // Input
  const [compositeScore, setCompositeScore] = useState(urlScore || '');
  const [category, setCategory] = useState(urlCategory || '');
  const [year, setYear] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Seat-aware results
  const [generalPredictions, setGeneralPredictions] = useState<SeatAwarePrediction[]>([]);
  const [communityPredictions, setCommunityPredictions] = useState<SeatAwarePrediction[]>([]);
  const [seatDataAvailable, setSeatDataAvailable] = useState(false);
  const [rankPrediction, setRankPrediction] = useState<RankPrediction | null>(null);
  const [resultCategory, setResultCategory] = useState('');
  const [resultTab, setResultTab] = useState(0);

  // Sort & filter state
  const [sortKey, setSortKey] = useState<SortKey>('competitionDesc');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Only the newest prediction request may write results
  const requestIdRef = useRef(0);
  const predictAbortRef = useRef<AbortController | null>(null);
  const autoRanRef = useRef(false);

  // Reset expanded row on sort/filter change
  useEffect(() => {
    setExpandedRow(null);
  }, [sortKey, filters, resultTab]);

  useEffect(() => () => predictAbortRef.current?.abort(), []);

  // Fetch systems
  useEffect(() => {
    const controller = new AbortController();
    setSystemsStatus('loading');
    fetch('/api/tools/rank-predictor', { signal: controller.signal })
      .then((res) => readJsonOrThrow<{ systems?: CounselingSystem[] }>(res, 'Could not load counseling systems.'))
      .then((data) => {
        const all = data.systems || [];
        setSystems(all);
        const fromUrl = resolveSystemCode(all, urlSystem);
        const initial = pickDefaultSystem(all, urlSystem);
        setUrlSystemHonoured(!urlSystem || !!fromUrl);
        setSelectedSystemCode((current) => {
          if (current && all.some((s) => s.code === current)) return current;
          return initial?.code ?? '';
        });
        if (initial) {
          setCategory((current) => {
            if (current && initial.categories.some((c) => c.code === current)) return current;
            return initial.categories[0]?.code ?? '';
          });
        }
        setSystemsStatus('ready');
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setSystemsStatus('error');
      });
    return () => controller.abort();
  }, [systemsReload, urlSystem]);

  // Fetch available years when system changes
  useEffect(() => {
    if (!selectedSystem) return;
    const controller = new AbortController();
    setAvailableYears([]);
    setYear('');
    setYearsStatus('loading');
    fetch(`/api/tools/rank-predictor?action=years&systemId=${encodeURIComponent(selectedSystem.id)}`, { signal: controller.signal })
      .then((res) => readJsonOrThrow<{ years?: number[] }>(res, 'Could not load data years.'))
      .then((data) => {
        const years: number[] = Array.isArray(data.years) ? data.years : [];
        setAvailableYears(years);
        if (years.length > 0) setYear(urlYear && years.includes(urlYear) ? urlYear : years[0]);
        setYearsStatus('ready');
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setYearsStatus('error');
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSystem?.id, yearsReload]);

  const clearResults = useCallback(() => {
    requestIdRef.current += 1;
    predictAbortRef.current?.abort();
    setLoading(false);
    setError(null);
    setHasSearched(false);
    setGeneralPredictions([]);
    setCommunityPredictions([]);
    setRankPrediction(null);
    setSeatDataAvailable(false);
  }, []);

  const handleCounselingPredict = useCallback(async () => {
    if (!selectedSystem) return;
    const score = parseFloat(compositeScore);
    const maxScore = selectedSystem.merit_formula.total_marks;
    if (isNaN(score) || score < 0 || score > maxScore) {
      setError({ message: `Enter a valid score between 0 and ${maxScore}.`, retryable: false });
      return;
    }

    predictAbortRef.current?.abort();
    const controller = new AbortController();
    predictAbortRef.current = controller;
    const requestId = ++requestIdRef.current;
    const usedCategory = category;

    setHasSearched(true);
    setLoading(true);
    setError(null);
    try {
      const currentUser = getFirebaseAuth().currentUser;
      if (!currentUser) throw new Error('Your session ended. Please sign in again.');
      const idToken = await currentUser.getIdToken();
      const res = await fetch('/api/tools/college-predictor/counseling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          systemCode: selectedSystem.code,
          compositeScore: score,
          category: usedCategory || undefined,
          year: year || undefined,
          seatAware: true,
        }),
        signal: controller.signal,
      });
      const data = await readJsonOrThrow<any>(res, 'Prediction failed. Please try again.');
      if (requestId !== requestIdRef.current) return;

      setGeneralPredictions(data.generalPredictions || []);
      setCommunityPredictions(data.communityPredictions || []);
      setSeatDataAvailable(!!data.seatDataAvailable);
      setRankPrediction(data.rankPrediction || null);
      setResultCategory(usedCategory);
      setResultTab(0);
      setFilters(DEFAULT_FILTERS);
      setSortKey('competitionDesc');
    } catch (err: any) {
      if (isAbortError(err) || requestId !== requestIdRef.current) return;
      setError({ message: err?.message || 'Prediction failed. Please try again.', retryable: true });
      setGeneralPredictions([]);
      setCommunityPredictions([]);
      setRankPrediction(null);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [compositeScore, category, year, selectedSystem]);

  // Arrived with ?score= (from the cutoff calculator or rank predictor): predict once
  useEffect(() => {
    if (autoRanRef.current || !urlScore || !urlSystemHonoured) return;
    if (!selectedSystem || yearsStatus !== 'ready' || availableYears.length === 0 || year === '') return;
    autoRanRef.current = true;
    handleCounselingPredict();
  }, [urlScore, urlSystemHonoured, selectedSystem, yearsStatus, availableYears.length, year, handleCounselingPredict]);

  // ─── Derived data ─────────────────────────────────────

  const categoryOptions = selectedSystem
    ? selectedSystem.categories.map((c) => ({
        value: c.code,
        label: c.name ? `${c.code}: ${c.name}` : c.code,
      }))
    : [];

  const sortedSystems = useMemo(
    () =>
      [...systems].sort((a, b) => {
        const s = (a.state || '').localeCompare(b.state || '');
        return s !== 0 ? s : a.name.localeCompare(b.name);
      }),
    [systems]
  );

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

    let result: PredictionWithScore[] = currentTabPredictions.map((p) => ({
      ...p,
      competitionScore: computeCompetitionScore(p, maxClosingRank),
    }));

    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (p) =>
          p.collegeName?.toLowerCase().includes(q) ||
          p.collegeCode.toLowerCase().includes(q) ||
          p.city?.toLowerCase().includes(q)
      );
    }
    if (filters.cities.length > 0) {
      result = result.filter((p) => p.city && filters.cities.includes(p.city));
    }
    if (filters.tiers.length > 0) {
      result = result.filter((p) => filters.tiers.includes(p.tier));
    }
    if (filters.hideFull) {
      result = result.filter((p) => !p.isFull);
    }
    if (filters.onlyWithSeatData) {
      result = result.filter((p) => p.seatDataAvailable);
    }

    const tierOrder: Record<Tier, number> = { safe: 0, moderate: 1, reach: 2 };
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

  const generalTierCounts: Record<Tier, number> = {
    safe: generalPredictions.filter((r) => r.tier === 'safe').length,
    moderate: generalPredictions.filter((r) => r.tier === 'moderate').length,
    reach: generalPredictions.filter((r) => r.tier === 'reach').length,
  };

  const hasResults = generalPredictions.length > 0 || communityPredictions.length > 0;
  const isFiltered = !!filters.search || activeFilterCount > 0;
  const hasYearData = yearsStatus === 'ready' && availableYears.length > 0;

  // ─── Render ───────────────────────────────────────────

  if (systemsStatus === 'loading' && systems.length === 0) return <FormSkeleton />;

  if (systemsStatus === 'error' && systems.length === 0) {
    return (
      <RetryAlert
        message="We could not load the counseling systems. Check your connection and try again."
        onRetry={() => setSystemsReload((n) => n + 1)}
      />
    );
  }

  if (!selectedSystem) {
    return (
      <RetryAlert
        severity="info"
        message="No counseling systems are available right now. Please check back soon."
        onRetry={() => setSystemsReload((n) => n + 1)}
      />
    );
  }

  const rankRange = rankPrediction ? formatRankRange(rankPrediction.predictedRankMin, rankPrediction.predictedRankMax) : null;
  const categoryRankRange = rankPrediction ? formatRankRange(rankPrediction.categoryRankMin, rankPrediction.categoryRankMax) : null;

  return (
    <Box>
      <Paper
        component="form"
        noValidate
        onSubmit={(e: React.FormEvent) => {
          e.preventDefault();
          if (!loading && compositeScore && selectedSystem && hasYearData) handleCounselingPredict();
        }}
        elevation={0}
        sx={{ p: { xs: 2, sm: 2.5 }, mb: 2, borderRadius: 2 }}
      >
        {/* Row 1: system + score */}
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'minmax(0,2fr) minmax(0,1fr)' } }}>
          <Autocomplete
            disableClearable
            options={sortedSystems}
            value={selectedSystem as CounselingSystem}
            onChange={(_, nextSys) => {
              if (!nextSys || nextSys.code === selectedSystemCode) return;
              setSelectedSystemCode(nextSys.code);
              setCategory(nextSys.categories[0]?.code ?? '');
              clearResults();
            }}
            getOptionLabel={(sys) => (sys ? `${sys.name} (${sys.state})` : '')}
            getOptionDisabled={(sys) => !isSystemSelectable(sys)}
            isOptionEqualToValue={(opt, val) => opt?.code === val?.code}
            groupBy={(sys) => sys.state || 'Other'}
            filterOptions={(opts, { inputValue }) => {
              const q = inputValue.trim().toLowerCase();
              if (!q) return opts;
              const tokens = q.split(/\s+/);
              const matched = opts.filter((sys) => {
                const hay = `${sys.state || ''} ${sys.name} ${sys.conducting_body || ''} ${sys.code}`.toLowerCase();
                return tokens.every((t) => hay.includes(t));
              });
              return matched.sort((a, b) => {
                const aState = (a.state || '').toLowerCase().startsWith(q) ? 0 : 1;
                const bState = (b.state || '').toLowerCase().startsWith(q) ? 0 : 1;
                if (aState !== bState) return aState - bState;
                const aName = a.name.toLowerCase().startsWith(q) ? 0 : 1;
                const bName = b.name.toLowerCase().startsWith(q) ? 0 : 1;
                return aName - bName;
              });
            }}
            renderOption={(props, sys) => {
              const { key: _key, ...rest } = props as typeof props & { key?: string };
              return (
                <Box
                  component="li"
                  {...rest}
                  key={sys.code}
                  sx={{ display: 'flex !important', alignItems: 'center', gap: 1, py: 1, minHeight: 48 }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.35 }}>
                      {sys.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.35 }}>
                      {sys.state}
                    </Typography>
                  </Box>
                  {!isSystemSelectable(sys) && (
                    <Chip label="Coming soon" size="small" sx={{ fontSize: '0.75rem', alignSelf: 'center' }} />
                  )}
                </Box>
              );
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Counseling system"
                placeholder="Search by state or counseling"
                InputProps={{
                  ...params.InputProps,
                  startAdornment: (
                    <InputAdornment position="start" sx={{ ml: 0.5, mr: -0.5 }}>
                      <SearchIcon aria-hidden="true" sx={{ fontSize: 20, color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                }}
              />
            )}
          />
          <TextField
            fullWidth
            label={selectedSystem ? `Score (out of ${selectedSystem.merit_formula.total_marks})` : 'Composite score'}
            type="number"
            value={compositeScore}
            onChange={(e) => setCompositeScore(e.target.value)}
            inputProps={{ min: 0, max: selectedSystem?.merit_formula.total_marks || 400, step: 0.01, inputMode: 'decimal' }}
          />
        </Box>

        {/* Row 2: category + year + predict. Stacked on phones, one row on laptop */}
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            mt: 2,
            alignItems: 'center',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'minmax(0,1fr) minmax(0,1fr) auto' },
          }}
        >
          <TextField
            select
            fullWidth
            label="Category"
            value={categoryOptions.some((c) => c.value === category) ? category : ''}
            onChange={(e) => setCategory(e.target.value)}
            disabled={categoryOptions.length === 0}
          >
            {categoryOptions.map((c) => (
              <MenuItem key={c.value} value={c.value} sx={{ minHeight: 48, whiteSpace: 'normal' }}>
                {c.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            fullWidth
            label="Data year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            disabled={!hasYearData}
          >
            {availableYears.map((y) => (
              <MenuItem key={y} value={y} sx={{ minHeight: 48 }}>
                {y}
              </MenuItem>
            ))}
          </TextField>
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={loading || !compositeScore || !selectedSystem || !hasYearData}
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <SearchIcon aria-hidden="true" />}
            sx={{ minHeight: 48, width: { xs: '100%', md: 'auto' }, gridColumn: { sm: '1 / -1', md: 'auto' }, whiteSpace: 'nowrap' }}
          >
            {loading ? 'Predicting...' : 'Predict'}
          </Button>
        </Box>
      </Paper>

      {/* Years: loading, error or no data */}
      {selectedSystem && yearsStatus === 'error' && (
        <RetryAlert
          message={`We could not load the data for ${selectedSystem.name}. Check your connection and try again.`}
          onRetry={() => setYearsReload((n) => n + 1)}
          sx={{ mb: 2 }}
        />
      )}
      {selectedSystem && yearsStatus === 'ready' && availableYears.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          College data for {selectedSystem.name} is not available yet. Pick another counseling system, such as TNEA or KEAM B.Arch.
        </Alert>
      )}

      {error && (
        <RetryAlert
          message={error.message}
          onRetry={error.retryable ? handleCounselingPredict : undefined}
          sx={{ mb: 2 }}
        />
      )}

      {loading ? (
        <ResultsSkeleton />
      ) : hasResults ? (
        <Box aria-live="polite">
          {/* Rank summary */}
          {rankPrediction && (rankRange || rankPrediction.percentile != null) && (
            <Paper
              elevation={0}
              sx={(t) => ({
                p: 2,
                mb: 1.5,
                borderRadius: 2,
                bgcolor: alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.12 : 0.06),
                borderColor: alpha(t.palette.primary.main, 0.35),
              })}
            >
              <Box sx={{ display: 'flex', columnGap: 3, rowGap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                {rankRange && (
                  <Typography variant="body2">
                    Predicted rank: <strong>{rankRange}</strong>
                  </Typography>
                )}
                {rankPrediction.percentile != null && (
                  <Typography variant="body2">
                    Better than: <strong>{rankPrediction.percentile.toFixed(1)}%</strong> of candidates
                  </Typography>
                )}
                {categoryRankRange && resultCategory && (
                  <Typography variant="body2">
                    {resultCategory} rank: <strong>{categoryRankRange}</strong>
                  </Typography>
                )}
              </Box>
            </Paper>
          )}

          {/* Summary chips and a visible legend */}
          <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
            {(['safe', 'moderate', 'reach'] as const).map((t) => {
              const c = TIER_CONFIG[t];
              return (
                <Chip
                  key={t}
                  label={`${c.label}: ${generalTierCounts[t]}`}
                  sx={(th) => ({
                    fontWeight: 600,
                    fontSize: '0.8125rem',
                    color: toneText(th, c.paletteKey),
                    bgcolor: alpha(th.palette[c.paletteKey].main, th.palette.mode === 'dark' ? 0.18 : 0.12),
                  })}
                />
              );
            })}
            {seatDataAvailable && (
              <Chip
                icon={<EventSeatIcon aria-hidden="true" sx={{ fontSize: 18 }} />}
                label="Seat data available"
                color="info"
                variant="outlined"
                sx={{ fontSize: '0.8125rem' }}
              />
            )}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
            Safe: well inside last year&apos;s closing rank. Moderate: close to it. Reach: unlikely unless seats go vacant.
            Competition (0 to 100) shows how fast a college fills, from its seat fill and closing rank.
          </Typography>

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
            <Tabs value={resultTab} onChange={(_, v) => setResultTab(v)} variant="fullWidth" sx={{ mb: 1 }}>
              <Tab
                icon={<SchoolIcon aria-hidden="true" sx={{ fontSize: 20 }} />}
                iconPosition="start"
                label={`General (${generalPredictions.length})`}
              />
              <Tab
                icon={<GroupIcon aria-hidden="true" sx={{ fontSize: 20 }} />}
                iconPosition="start"
                label={`Via ${resultCategory} (${communityPredictions.length})`}
              />
            </Tabs>
          )}

          {resultTab === 1 && communityPredictions.length > 0 && (
            <Alert severity="info" sx={{ mb: 1 }}>
              These colleges have <strong>{resultCategory}</strong> reserved seats available. Even if general seats are
              full, you may get admission through the community quota.
            </Alert>
          )}

          {isFiltered && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }} role="status">
              Showing {displayPredictions.length} of {currentTabPredictions.length} colleges
            </Typography>
          )}

          {displayPredictions.length > 0 ? (
            <Paper elevation={0} sx={{ borderRadius: 2, overflow: 'hidden' }}>
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }} aria-label="Predicted colleges">
                {displayPredictions.map((p) => (
                  <CompactCollegeRow
                    key={`${resultTab}-${p.collegeCode}`}
                    prediction={p}
                    expanded={expandedRow === p.collegeCode}
                    onToggle={() => setExpandedRow(expandedRow === p.collegeCode ? null : p.collegeCode)}
                    showCommunity={resultTab === 1}
                  />
                ))}
              </Box>
            </Paper>
          ) : isFiltered ? (
            <Paper elevation={0} sx={{ p: 3, textAlign: 'center', borderRadius: 2 }}>
              <Typography variant="body2" color="text.secondary">
                No colleges match your filters
              </Typography>
              <Button
                onClick={() => {
                  setFilters(DEFAULT_FILTERS);
                  setFiltersOpen(false);
                }}
                sx={{ mt: 1 }}
              >
                Clear all filters
              </Button>
            </Paper>
          ) : null}
        </Box>
      ) : hasSearched && !error ? (
        <Paper elevation={0} sx={{ p: 3, textAlign: 'center', borderRadius: 2 }}>
          <Typography variant="body1" color="text.secondary" gutterBottom>
            No colleges found for this score
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Try a different year or category.
          </Typography>
        </Paper>
      ) : !hasSearched && hasYearData ? (
        <Paper elevation={0} sx={{ p: 3, textAlign: 'center', borderRadius: 2 }}>
          <Typography variant="body1" color="text.secondary" gutterBottom>
            Enter your composite score to see predictions
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Not sure of your score? Work it out first.
          </Typography>
          <Button
            component={Link}
            href="/tools/nata/cutoff-calculator"
            variant="outlined"
            endIcon={<ArrowForwardIcon aria-hidden="true" />}
          >
            Cutoff Calculator
          </Button>
        </Paper>
      ) : null}
    </Box>
  );
}
