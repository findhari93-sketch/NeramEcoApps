'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { alpha } from '@mui/material/styles';
import type { SvgIconComponent } from '@mui/icons-material';
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
  Stack,
  Divider,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Checkbox,
  FormControlLabel,
  FormHelperText,
} from '@neram/ui';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import BalanceOutlinedIcon from '@mui/icons-material/BalanceOutlined';
import WhatshotOutlinedIcon from '@mui/icons-material/WhatshotOutlined';
import { getFirebaseAuth } from '@neram/auth';
import { partitionByIit, dedupeIitByInstitute } from '@/lib/josaa-zones';
import { useToolOpened } from '@/hooks/useToolOpened';
import ToolPageHeader from '@/components/tools-hub/ToolPageHeader';
import RetryAlert from '@/components/counseling/RetryAlert';

type Chance = 'safe' | 'probable' | 'reach';
type Category = 'OPEN' | 'OBC-NCL' | 'SC' | 'ST' | 'EWS';
type RankType = 'CRL' | 'CATEGORY';
type ViewMode = 'cards' | 'table';

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
  college_slug: string | null;
  state_slug: string | null;
  city_slug: string | null;
}

type Counts = { safe: number; probable: number; reach: number };

interface CompareRow {
  institute: string;
  institute_type: string;
  state: string | null;
  nirf_rank: number | null;
  college_slug: string | null;
  state_slug: string | null;
  city_slug: string | null;
  perYear: Record<number, JosaaPrediction | null>;
}

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: 'OPEN', label: 'General (OPEN)' },
  { value: 'OBC-NCL', label: 'OBC-NCL' },
  { value: 'SC', label: 'SC' },
  { value: 'ST', label: 'ST' },
  { value: 'EWS', label: 'EWS' },
];

const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
  'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  // UTs
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

/** Same limits as the API, so a bad number never leaves the phone */
const MAX_MAIN_RANK = 1_500_000;
const MAX_ADVANCED_RANK = 250_000;

const NOT_AVAILABLE = 'N/A';

const CHANCE_CONFIG: Record<Chance, { label: string; paletteKey: 'success' | 'warning' | 'error'; Icon: SvgIconComponent }> = {
  safe: { label: 'Safe', paletteKey: 'success', Icon: CheckCircleOutlineIcon },
  probable: { label: 'Probable', paletteKey: 'warning', Icon: BalanceOutlinedIcon },
  reach: { label: 'Reach', paletteKey: 'error', Icon: WhatshotOutlinedIcon },
};

/** Resolved when needed (not at module load), so server and client agree */
function getMarketingBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_MARKETING_URL) return process.env.NEXT_PUBLIC_MARKETING_URL;
  if (typeof window !== 'undefined' && window.location.hostname.includes('staging')) {
    return 'https://staging.neramclasses.com';
  }
  return 'https://neramclasses.com';
}

function collegeUrl(p: Pick<JosaaPrediction, 'college_slug' | 'state_slug' | 'city_slug'>): string | null {
  if (!p.college_slug || !p.state_slug || !p.city_slug) return null;
  return `${getMarketingBaseUrl()}/colleges/${p.state_slug}/${p.city_slug}/${p.college_slug}`;
}

function quotaLabel(quota: string, homeState: string | null): string {
  if (quota === 'AI') return 'All India';
  if (quota === 'HS') return `Home State${homeState ? ` (${homeState})` : ''}`;
  if (quota === 'OS') return 'Other State';
  if (quota === 'GO') return 'Goa quota';
  if (quota === 'JK') return 'J&K quota';
  if (quota === 'LA') return 'Ladakh quota';
  return quota;
}

function formatMargin(margin: number): string {
  return margin > 0 ? `+${margin}` : String(margin);
}

async function postPrediction(body: Record<string, unknown>, token: string, signal: AbortSignal) {
  const res = await fetch('/api/tools/josaa-predictor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    const message = json && typeof json.error === 'string' && res.status < 500 ? json.error : 'Failed to predict colleges. Please try again.';
    throw new Error(message);
  }
  return json;
}

function PredictorContent() {
  const theme = useTheme();
  // noSsr: read the real width on the first render, so phones start on cards
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'), { noSsr: true });

  // ── Form state ──────────────────────────────────────────
  const [category, setCategory] = useState<Category>('OPEN');
  const [pwd, setPwd] = useState(false);
  const [rankType, setRankType] = useState<RankType>('CRL');
  const [rank, setRank] = useState('');
  const [advancedRank, setAdvancedRank] = useState('');
  const [homeState, setHomeState] = useState('');
  const [gender, setGender] = useState('Gender-Neutral');

  // Year / compare
  const [compareMode, setCompareMode] = useState(false);
  const [year, setYear] = useState<number | ''>('');
  const [compareYears, setCompareYears] = useState<number[]>([2025, 2024]);
  const [availableYears, setAvailableYears] = useState<number[]>([2025, 2024, 2023]);
  const [roundNo, setRoundNo] = useState<number | ''>('');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // ── UI state ────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [predictions, setPredictions] = useState<JosaaPrediction[] | null>(null);
  const [byYear, setByYear] = useState<Record<number, { predictions: JosaaPrediction[]; counts: Counts }> | null>(null);
  const [iitVerdict, setIitVerdict] = useState<Record<string, JosaaPrediction> | null>(null);
  // The student's own choice wins; until they choose, follow the screen size
  const [chosenViewMode, setChosenViewMode] = useState<ViewMode | null>(null);
  const viewMode: ViewMode = chosenViewMode ?? (isDesktop ? 'table' : 'cards');

  // The inputs the visible results were computed from
  const [resultContext, setResultContext] = useState<{
    rank: number;
    rankType: RankType;
    category: Category;
    pwd: boolean;
    homeState: string;
    gender: string;
    compareYears: number[] | null;
    year: number | '';
  } | null>(null);

  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  // When category becomes 'OPEN', rank-type is forced to CRL.
  useEffect(() => {
    if (category === 'OPEN' && rankType !== 'CRL') setRankType('CRL');
  }, [category, rankType]);

  // Discover which years are actually loaded in the DB so the UI surfaces
  // 2019/2020 if/when they get scraped + imported later, without redeploy.
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/tools/josaa-predictor/years', { method: 'GET', signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && Array.isArray(j.years) && j.years.length > 0) {
          setAvailableYears(j.years);
          // Seed compare default to the two latest if current default isn't valid
          setCompareYears((prev) => {
            const valid = prev.filter((y) => j.years.includes(y));
            return valid.length > 0 ? valid : j.years.slice(0, 2);
          });
        }
      })
      .catch(() => {
        // Keep the built-in year list; the predictor still works
      });
    return () => controller.abort();
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const rankHelper = useMemo(() => {
    if (category === 'OPEN') return 'CRL = your Common Rank List position (the "CRL" column on your JEE Main Paper 2A scorecard).';
    if (rankType === 'CRL') return `You're using your CRL rank. The predictor will compare it against OPEN seat closing ranks only.`;
    return `You're using your ${category} category rank from the "${category}" column on your scorecard. Predictor compares against ${category} seats.`;
  }, [category, rankType]);

  // Runs only on an explicit Predict (or Retry) tap. There is deliberately no
  // effect that re-submits: inside (protected) the student is always signed in,
  // and an auto re-run after a failure looped forever.
  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const rankNum = Number(rank);
    if (!Number.isInteger(rankNum) || rankNum < 1 || rankNum > MAX_MAIN_RANK) {
      setError({ message: `Enter a valid JEE Main Paper 2A rank between 1 and ${MAX_MAIN_RANK.toLocaleString('en-IN')}.`, retryable: false });
      return;
    }
    const advTrimmed = advancedRank.trim();
    const advNum = advTrimmed ? Number(advTrimmed) : NaN;
    if (advTrimmed && (!Number.isInteger(advNum) || advNum < 1 || advNum > MAX_ADVANCED_RANK)) {
      setError({ message: `Enter a JEE Advanced rank between 1 and ${MAX_ADVANCED_RANK.toLocaleString('en-IN')}, or leave it blank.`, retryable: false });
      return;
    }
    if (compareMode && compareYears.length === 0) {
      setError({ message: 'Select at least one year to compare.', retryable: false });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    setError(null);
    setPredictions(null);
    setByYear(null);
    setIitVerdict(null);
    setLoading(true);
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken();
      if (!token) throw new Error('Your session ended. Please sign in again.');

      const body: Record<string, unknown> = {
        rank: rankNum,
        rankType,
        category,
        pwd,
        gender,
        homeState: homeState || null,
        roundNo: roundNo === '' ? null : roundNo,
      };
      if (compareMode) {
        body.year = compareYears;
      } else if (year !== '') {
        body.year = year;
      }

      const wantsAdvanced = !compareMode && Number.isInteger(advNum) && advNum >= 1;
      // The JEE Advanced call does not depend on the main one, so both run at
      // once. It is optional: if it fails, the IIT zone stays in reference mode.
      const [json, advJson] = await Promise.all([
        postPrediction(body, token, controller.signal),
        wantsAdvanced
          ? postPrediction({ ...body, rank: advNum }, token, controller.signal).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (requestId !== requestIdRef.current) return;

      setResultContext({
        rank: rankNum,
        rankType,
        category,
        pwd,
        homeState,
        gender,
        compareYears: compareMode ? [...compareYears] : null,
        year,
      });

      if (compareMode && json.byYear) {
        setByYear(json.byYear);
      } else {
        setPredictions(json.predictions || []);

        if (advJson && Array.isArray(advJson.predictions)) {
          const map: Record<string, JosaaPrediction> = {};
          for (const p of advJson.predictions as JosaaPrediction[]) {
            if (p.institute_type !== 'IIT') continue;
            const cur = map[p.institute];
            if (!cur || (p.closing_rank ?? Infinity) < (cur.closing_rank ?? Infinity)) {
              map[p.institute] = p;
            }
          }
          setIitVerdict(map);
        }
      }

      // Bring the results into view on phones, where the form fills the screen
      requestAnimationFrame(() => {
        const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        resultsRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      });
    } catch (err: any) {
      if (requestId !== requestIdRef.current || err?.name === 'AbortError') return;
      setError({ message: err?.message || 'Failed to predict colleges. Please try again.', retryable: true });
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [rank, advancedRank, rankType, category, pwd, gender, homeState, year, roundNo, compareMode, compareYears]);

  const grouped = useMemo(() => {
    if (!predictions) return null;
    const { nonIit } = partitionByIit(predictions);
    return {
      safe: nonIit.filter((p) => p.chance === 'safe'),
      probable: nonIit.filter((p) => p.chance === 'probable'),
      reach: nonIit.filter((p) => p.chance === 'reach'),
    };
  }, [predictions]);

  // IIT rows for the separate AAT pathway zone (single-year path). One headline
  // row per IIT, verdict stripped (it is invalid against a Paper-2A rank).
  const iitReference = useMemo(() => {
    if (!predictions) return null;
    const { iit } = partitionByIit(predictions);
    return dedupeIitByInstitute(iit);
  }, [predictions]);

  // Non-IIT rows (NIT/SPA/GFTI) for the table view and empty-state logic.
  const nonIitPredictions = useMemo(() => {
    if (!predictions) return null;
    return partitionByIit(predictions).nonIit;
  }, [predictions]);

  // For compare mode: union of institutes across years, ordered by best chance + nirf.
  // IITs are pulled out into a separate reference list (different admission pathway).
  const compareRows = useMemo(() => {
    if (!byYear) return null;
    const years = Object.keys(byYear).map((y) => parseInt(y, 10)).sort((a, b) => b - a);
    const byInstitute = new Map<string, CompareRow>();
    const iitByInstitute = new Map<string, JosaaPrediction>();
    for (const y of years) {
      for (const p of byYear[y].predictions) {
        if (p.institute_type === 'IIT') {
          const cur = iitByInstitute.get(p.institute);
          const pr = p.closing_rank ?? Number.POSITIVE_INFINITY;
          const cr = cur?.closing_rank ?? Number.POSITIVE_INFINITY;
          if (!cur || pr < cr) iitByInstitute.set(p.institute, p);
          continue;
        }
        const key = p.institute;
        if (!byInstitute.has(key)) {
          byInstitute.set(key, {
            institute: p.institute,
            institute_type: p.institute_type,
            state: p.state,
            nirf_rank: p.nirf_rank,
            college_slug: p.college_slug,
            state_slug: p.state_slug,
            city_slug: p.city_slug,
            perYear: {},
          });
        }
        const row = byInstitute.get(key)!;
        if (!row.perYear[y]) row.perYear[y] = p; // keep first (best) chance row per year
      }
    }
    return {
      years,
      rows: Array.from(byInstitute.values()).sort((a, b) => (a.nirf_rank ?? 999) - (b.nirf_rank ?? 999)),
      iitRows: dedupeIitByInstitute(Array.from(iitByInstitute.values())),
    };
  }, [byYear]);

  const ctx = resultContext;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <ToolPageHeader
        toolId="counseling-josaa-predictor"
        meta={
          availableYears.length > 0 ? (
            <Chip
              variant="outlined"
              label={`Closing ranks from ${[...availableYears].sort((a, b) => a - b).join(', ')}`}
              sx={{ fontSize: '0.8125rem' }}
            />
          ) : undefined
        }
      />

      {/* ── Form ─────────────────────────────────────── */}
      <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 3 }} component="form" noValidate onSubmit={handleSubmit}>
        <Stack spacing={2.5}>
          {/* Category */}
          <FormControl fullWidth>
            <InputLabel id="josaa-category-label">Your category</InputLabel>
            <Select
              labelId="josaa-category-label"
              label="Your category"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value} sx={{ minHeight: 48 }}>{opt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControlLabel
            control={<Checkbox checked={pwd} onChange={(e) => setPwd(e.target.checked)} />}
            label="I'm a Person with Benchmark Disability (PwD)"
            sx={{ minHeight: 44 }}
          />

          {/* Rank-type toggle (only when category != OPEN) */}
          {category !== 'OPEN' && (
            <Box>
              <Typography id="josaa-ranktype-label" variant="body2" sx={{ mb: 0.75, fontWeight: 600 }}>
                Which rank are you entering?
              </Typography>
              <ToggleButtonGroup
                exclusive
                fullWidth
                color="primary"
                value={rankType}
                onChange={(_, v) => v && setRankType(v as RankType)}
                aria-labelledby="josaa-ranktype-label"
              >
                <ToggleButton value="CRL">CRL</ToggleButton>
                <ToggleButton value="CATEGORY">{category} category</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          )}

          {/* Rank input */}
          <TextField
            label={`Your ${rankType === 'CRL' ? 'CRL' : `${category} category`} rank`}
            placeholder="e.g. 1067"
            type="number"
            value={rank}
            onChange={(e) => setRank(e.target.value)}
            inputProps={{ min: 1, max: MAX_MAIN_RANK, inputMode: 'numeric', pattern: '[0-9]*' }}
            fullWidth
            FormHelperTextProps={{ component: 'div' } as any}
            helperText={
              <Stack direction="row" spacing={0.5} alignItems="flex-start" sx={{ mt: 0.25 }}>
                <InfoOutlinedIcon aria-hidden="true" sx={{ fontSize: 16, mt: 0.25 }} />
                <Box component="span">{rankHelper}</Box>
              </Stack>
            }
          />

          {/* Optional JEE Advanced rank, powers the IIT B.Arch pathway prediction */}
          <TextField
            label="JEE Advanced rank (optional, for IIT B.Arch)"
            placeholder="e.g. 14500"
            type="number"
            value={advancedRank}
            onChange={(e) => setAdvancedRank(e.target.value)}
            inputProps={{ min: 1, max: MAX_ADVANCED_RANK, inputMode: 'numeric', pattern: '[0-9]*' }}
            fullWidth
            FormHelperTextProps={{ component: 'div' } as any}
            helperText={
              <Stack direction="row" spacing={0.5} alignItems="flex-start" sx={{ mt: 0.25 }}>
                <InfoOutlinedIcon aria-hidden="true" sx={{ fontSize: 16, mt: 0.25 }} />
                <Box component="span">
                  Only the 3 IITs (Kharagpur, Roorkee, BHU) use this. Leave blank if you did not sit JEE Advanced. IIT seats also require passing the AAT.
                </Box>
              </Stack>
            }
          />

          {/* Home state */}
          <FormControl fullWidth>
            <InputLabel id="josaa-home-state-label">Home state</InputLabel>
            <Select
              labelId="josaa-home-state-label"
              label="Home state"
              value={homeState}
              onChange={(e) => setHomeState(e.target.value as string)}
              aria-describedby="josaa-home-state-help"
            >
              <MenuItem value="" sx={{ minHeight: 48 }}>
                <em>All India only (no state quota)</em>
              </MenuItem>
              {STATES.map((s) => (
                <MenuItem key={s} value={s} sx={{ minHeight: 48 }}>{s}</MenuItem>
              ))}
            </Select>
            <FormHelperText id="josaa-home-state-help" sx={{ mx: 0 }}>
              Used to decide HS (Home State) vs OS (Other State) eligibility for NIT seats.
            </FormHelperText>
          </FormControl>

          {/* Gender */}
          <Box>
            <Typography id="josaa-gender-label" variant="body2" sx={{ mb: 0.75, fontWeight: 600 }}>Gender</Typography>
            <ToggleButtonGroup
              exclusive
              fullWidth
              color="primary"
              value={gender}
              onChange={(_, v) => v && setGender(v)}
              aria-labelledby="josaa-gender-label"
            >
              <ToggleButton value="Gender-Neutral">Gender-Neutral</ToggleButton>
              <ToggleButton value="Female-only (including Supernumerary)">Female-only</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Compare mode */}
          <Box>
            <FormControlLabel
              control={<Checkbox checked={compareMode} onChange={(e) => setCompareMode(e.target.checked)} />}
              label="Compare across years"
              sx={{ minHeight: 44 }}
            />
            {compareMode && (
              <ToggleButtonGroup
                color="primary"
                value={compareYears}
                onChange={(_, v: number[]) => setCompareYears([...v].sort((a, b) => b - a))}
                aria-label="Years to compare"
                sx={{ mt: 1, flexWrap: 'wrap' }}
              >
                {availableYears.map((y) => (
                  <ToggleButton key={y} value={y} sx={{ minWidth: 72 }}>
                    {y}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            )}
          </Box>

          {/* Advanced */}
          <Button
            color="inherit"
            startIcon={advancedOpen ? <ExpandLessIcon aria-hidden="true" /> : <ExpandMoreIcon aria-hidden="true" />}
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
            aria-controls="josaa-advanced-options"
            sx={{ alignSelf: 'flex-start' }}
          >
            Advanced (year, round)
          </Button>
          <Collapse in={advancedOpen} id="josaa-advanced-options">
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormControl fullWidth disabled={compareMode}>
                <InputLabel id="josaa-year-label">Year (optional)</InputLabel>
                <Select
                  labelId="josaa-year-label"
                  label="Year (optional)"
                  value={year}
                  onChange={(e) => setYear(e.target.value as number | '')}
                >
                  <MenuItem value="" sx={{ minHeight: 48 }}><em>Latest available</em></MenuItem>
                  {availableYears.map((y) => (
                    <MenuItem key={y} value={y} sx={{ minHeight: 48 }}>{y}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel id="josaa-round-label">Round (optional)</InputLabel>
                <Select
                  labelId="josaa-round-label"
                  label="Round (optional)"
                  value={roundNo}
                  onChange={(e) => setRoundNo(e.target.value as number | '')}
                >
                  <MenuItem value="" sx={{ minHeight: 48 }}><em>Last round of selected year</em></MenuItem>
                  {[1, 2, 3, 4, 5, 6].map((r) => (
                    <MenuItem key={r} value={r} sx={{ minHeight: 48 }}>Round {r}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
          </Collapse>

          {/* Submit */}
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={loading || !rank}
            endIcon={loading ? undefined : <ArrowForwardIcon aria-hidden="true" />}
            sx={{ minHeight: 48 }}
          >
            {loading ? <CircularProgress size={22} color="inherit" aria-label="Predicting" /> : 'Predict colleges'}
          </Button>
        </Stack>
      </Paper>

      {error && (
        <RetryAlert
          message={error.message}
          onRetry={error.retryable ? () => handleSubmit() : undefined}
          sx={{ mb: 2 }}
        />
      )}

      {/* ── Results ───────────────────────────────────── */}
      <Box ref={resultsRef} sx={{ scrollMarginTop: 72 }} aria-live="polite">
        {(grouped || compareRows) && ctx && (
          <Stack spacing={2}>
            {/* Context banner */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} justifyContent="space-between">
                <Box>
                  <Typography component="h2" variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Your rank: {ctx.rank} ({ctx.rankType === 'CRL' ? 'CRL' : `${ctx.category} category`})
                    {ctx.pwd ? ', PwD' : ''}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {ctx.homeState ? `Home state: ${ctx.homeState}` : 'Home state: All India only'} · {ctx.gender}
                    {ctx.compareYears ? ` · Comparing ${ctx.compareYears.join(', ')}` : ''}
                  </Typography>
                </Box>
                {grouped && (
                  <ToggleButtonGroup
                    exclusive
                    value={viewMode}
                    onChange={(_, v) => v && setChosenViewMode(v as ViewMode)}
                    aria-label="View mode"
                  >
                    <ToggleButton value="cards" sx={{ gap: 0.75, px: 2 }}>
                      <ViewModuleIcon fontSize="small" aria-hidden="true" />Cards
                    </ToggleButton>
                    <ToggleButton value="table" sx={{ gap: 0.75, px: 2 }}>
                      <ViewListIcon fontSize="small" aria-hidden="true" />Table
                    </ToggleButton>
                  </ToggleButtonGroup>
                )}
              </Stack>
            </Paper>

            {/* Compare-mode results */}
            {compareRows && <CompareResultsTable rows={compareRows.rows} years={compareRows.years} homeState={ctx.homeState} />}
            {compareRows && compareRows.iitRows.length > 0 && (
              <IITPathwayZone rows={compareRows.iitRows} verdict={null} yearLabel={compareRows.years[0]} />
            )}

            {/* Single-year results */}
            {grouped && viewMode === 'cards' && (
              <GroupedCardsView grouped={grouped} homeState={ctx.homeState} />
            )}
            {grouped && viewMode === 'table' && (
              <FlatTableView predictions={nonIitPredictions || []} homeState={ctx.homeState} />
            )}

            {iitReference && iitReference.length > 0 && (
              <IITPathwayZone rows={iitReference} verdict={iitVerdict} yearLabel={ctx.year || 'latest'} />
            )}

            {predictions && nonIitPredictions && nonIitPredictions.length === 0 && (
              <Alert severity="info">
                No NIT, SPA or GFTI seats match this rank and category.
                {iitReference && iitReference.length > 0
                  ? ' See the IIT B.Arch pathway below.'
                  : ' Try a different seat type or quota.'}
              </Alert>
            )}
          </Stack>
        )}
      </Box>
    </Box>
  );
}

// ── View components ───────────────────────────────────────────────────────

function CollegeLink({ p, name }: { p: Pick<JosaaPrediction, 'college_slug' | 'state_slug' | 'city_slug'>; name: string }) {
  const url = collegeUrl(p);
  if (!url) {
    return (
      <Typography variant="caption" color="text.secondary">
        No profile yet
      </Typography>
    );
  }
  return (
    <Button
      component="a"
      href={url}
      target="_blank"
      rel="noopener"
      variant="text"
      endIcon={<OpenInNewIcon aria-hidden="true" sx={{ fontSize: 16 }} />}
      aria-label={`View ${name} (opens in a new tab)`}
      sx={{ minHeight: 44, px: 1, whiteSpace: 'nowrap' }}
    >
      View college
    </Button>
  );
}

function ChanceChip({ chance }: { chance: Chance }) {
  const c = CHANCE_CONFIG[chance];
  const { Icon } = c;
  return (
    <Chip
      icon={<Icon aria-hidden="true" sx={{ fontSize: 18 }} />}
      label={c.label}
      sx={(t) => ({
        bgcolor: alpha(t.palette[c.paletteKey].main, t.palette.mode === 'dark' ? 0.18 : 0.1),
        color: t.palette.mode === 'dark' ? t.palette[c.paletteKey].main : t.palette[c.paletteKey].dark,
        fontWeight: 600,
        '& .MuiChip-icon': { color: 'inherit' },
      })}
    />
  );
}

function GroupedCardsView({ grouped, homeState }: { grouped: { safe: JosaaPrediction[]; probable: JosaaPrediction[]; reach: JosaaPrediction[] }; homeState: string }) {
  return (
    <Stack spacing={2}>
      {(['safe', 'probable', 'reach'] as const).map((tier) => {
        const items = grouped[tier];
        if (items.length === 0) return null;
        const c = CHANCE_CONFIG[tier];
        const { Icon } = c;
        return (
          <Box key={tier} component="section" aria-label={`${c.label} colleges`}>
            <Typography
              component="h3"
              variant="subtitle1"
              sx={(t) => ({
                fontWeight: 700,
                mb: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                color: t.palette.mode === 'dark' ? t.palette[c.paletteKey].main : t.palette[c.paletteKey].dark,
              })}
            >
              <Icon aria-hidden="true" sx={{ fontSize: 20 }} />
              {c.label} ({items.length})
            </Typography>
            <Stack spacing={1.5}>
              {items.map((p, idx) => (
                <Card key={`${p.institute}-${p.quota}-${p.seat_type}-${idx}`} variant="outlined">
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 1.5 } }}>
                    <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          {p.institute}
                        </Typography>
                        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mt: 0.75 }}>
                          <Chip label={p.institute_type} size="small" variant="outlined" sx={{ fontSize: '0.75rem' }} />
                          {p.state && <Chip label={p.state} size="small" variant="outlined" sx={{ fontSize: '0.75rem' }} />}
                          <Chip label={quotaLabel(p.quota, homeState || null)} size="small" sx={{ fontSize: '0.75rem' }} />
                          {p.nirf_rank != null && (
                            <Chip label={`NIRF ${p.nirf_rank}`} size="small" color="info" variant="outlined" sx={{ fontSize: '0.75rem' }} />
                          )}
                        </Stack>
                      </Box>
                      <ChanceChip chance={p.chance} />
                    </Stack>
                    <Divider sx={{ my: 1 }} />
                    <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap>
                      <Typography variant="body2" color="text.secondary">
                        Closing rank: <b>{p.closing_rank ?? 'Not available'}</b>
                        {p.opening_rank != null && <> · Opening: {p.opening_rank}</>}
                        {' · '}Margin: <b>{formatMargin(p.margin)}</b>
                      </Typography>
                      <CollegeLink p={p} name={p.institute} />
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}

function FlatTableView({ predictions, homeState }: { predictions: JosaaPrediction[]; homeState: string }) {
  return (
    <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
      <Table size="small" aria-label="College predictions">
        <TableHead>
          <TableRow>
            <TableCell>Chance</TableCell>
            <TableCell>Institute</TableCell>
            <TableCell>Type</TableCell>
            <TableCell>State</TableCell>
            <TableCell>Quota</TableCell>
            <TableCell align="right">Closing</TableCell>
            <TableCell align="right">Margin</TableCell>
            <TableCell align="right">NIRF</TableCell>
            <TableCell>Action</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {predictions.map((p, idx) => (
            <TableRow key={`${p.institute}-${p.quota}-${p.seat_type}-${idx}`} hover>
              <TableCell><ChanceChip chance={p.chance} /></TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{p.institute}</TableCell>
              <TableCell>{p.institute_type}</TableCell>
              <TableCell>{p.state ?? NOT_AVAILABLE}</TableCell>
              <TableCell>{quotaLabel(p.quota, homeState || null)}</TableCell>
              <TableCell align="right">{p.closing_rank ?? NOT_AVAILABLE}</TableCell>
              <TableCell align="right">{formatMargin(p.margin)}</TableCell>
              <TableCell align="right">{p.nirf_rank ?? NOT_AVAILABLE}</TableCell>
              <TableCell><CollegeLink p={p} name={p.institute} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}

function IITPathwayZone({
  rows,
  verdict,
  yearLabel,
}: {
  rows: JosaaPrediction[];
  verdict?: Record<string, JosaaPrediction> | null;
  yearLabel?: string | number;
}) {
  const base = getMarketingBaseUrl();
  return (
    <Box component="section" aria-labelledby="iit-pathway-heading">
      <Typography
        id="iit-pathway-heading"
        component="h3"
        variant="subtitle1"
        sx={{ fontWeight: 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.75 }}
      >
        <AccountBalanceOutlinedIcon aria-hidden="true" sx={{ fontSize: 20, color: 'primary.main' }} />
        IIT B.Arch, a separate exam pathway
      </Typography>
      <Alert severity="warning" icon={<InfoOutlinedIcon />} sx={{ mb: 1.5 }}>
        IIT B.Arch (Kharagpur, Roorkee, BHU Varanasi) is <b>not</b> filled from your
        JEE Main Paper 2A rank. Seats go by your <b>JEE Advanced rank</b>, and only
        after you <b>Pass the AAT</b> (Architecture Aptitude Test, a Pass/Fail gate).
        The closing ranks below are JEE Advanced ranks, shown for reference.
      </Alert>

      <Box component="ol" sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1, listStyle: 'none', p: 0, m: 0, mb: 1.5 }}>
        {['Qualify JEE Advanced', 'Pass AAT (Pass/Fail)', 'JoSAA seat by Advanced rank'].map((s, i) => (
          <Box component="li" key={s}>
            <Chip label={`${i + 1}. ${s}`} variant="outlined" sx={{ fontSize: '0.8125rem' }} />
          </Box>
        ))}
      </Box>

      <Stack spacing={1.5}>
        {rows.map((p) => {
          const v = verdict ? verdict[p.institute] : null;
          return (
            <Card key={p.institute} variant="outlined">
              <CardContent sx={{ p: 2, '&:last-child': { pb: 1.5 } }}>
                <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {p.institute}
                    </Typography>
                    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mt: 0.75 }}>
                      <Chip label="IIT" size="small" variant="outlined" sx={{ fontSize: '0.75rem' }} />
                      {p.state && <Chip label={p.state} size="small" variant="outlined" sx={{ fontSize: '0.75rem' }} />}
                      {p.nirf_rank != null && (
                        <Chip label={`NIRF ${p.nirf_rank}`} size="small" color="info" variant="outlined" sx={{ fontSize: '0.75rem' }} />
                      )}
                    </Stack>
                  </Box>
                  {v ? (
                    <ChanceChip chance={v.chance} />
                  ) : (
                    <Chip label="JEE Advanced + AAT" variant="outlined" sx={{ fontWeight: 600, color: 'text.secondary' }} />
                  )}
                </Stack>
                <Divider sx={{ my: 1 }} />
                <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography variant="body2" color="text.secondary">
                    JEE Advanced closing rank{yearLabel ? ` (${yearLabel})` : ''}: <b>{p.closing_rank ?? NOT_AVAILABLE}</b>
                    {v && (
                      <>
                        {' · '}Your margin: <b>{formatMargin(v.margin)}</b>
                      </>
                    )}
                  </Typography>
                  <CollegeLink p={p} name={p.institute} />
                </Stack>
              </CardContent>
            </Card>
          );
        })}
      </Stack>

      <Stack direction="row" sx={{ mt: 1.5, flexWrap: 'wrap', gap: 1 }}>
        <Button
          variant="outlined"
          component="a"
          href={`${base}/counseling/concepts/aat-explained`}
          target="_blank"
          rel="noopener"
          endIcon={<OpenInNewIcon aria-hidden="true" />}
          aria-label="How AAT works (opens in a new tab)"
        >
          How AAT works
        </Button>
        <Button
          variant="text"
          component="a"
          href={`${base}/aat-2026`}
          target="_blank"
          rel="noopener"
          endIcon={<OpenInNewIcon aria-hidden="true" />}
          aria-label="AAT 2026 guide (opens in a new tab)"
        >
          AAT 2026 guide
        </Button>
      </Stack>
    </Box>
  );
}

function CompareResultsTable({ rows, years, homeState }: { rows: CompareRow[]; years: number[]; homeState: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', md: 'none' }, mb: 0.75 }}>
        Swipe the table sideways to see every year.
      </Typography>
      <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
        <Table size="small" aria-label="College predictions by year">
          <TableHead>
            <TableRow>
              <TableCell>Institute</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>State</TableCell>
              <TableCell align="right">NIRF</TableCell>
              {years.map((y) => (
                <TableCell key={y}>{y}</TableCell>
              ))}
              <TableCell>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.institute} hover>
                <TableCell sx={{ fontWeight: 600 }}>{row.institute}</TableCell>
                <TableCell>{row.institute_type}</TableCell>
                <TableCell>{row.state ?? NOT_AVAILABLE}</TableCell>
                <TableCell align="right">{row.nirf_rank ?? NOT_AVAILABLE}</TableCell>
                {years.map((y) => {
                  const p = row.perYear[y];
                  if (!p) {
                    return (
                      <TableCell key={y}>
                        <Typography variant="caption" color="text.secondary">No seat</Typography>
                      </TableCell>
                    );
                  }
                  return (
                    <TableCell key={y}>
                      <Stack spacing={0.5} alignItems="flex-start">
                        <ChanceChip chance={p.chance} />
                        <Typography variant="caption">Close {p.closing_rank ?? NOT_AVAILABLE} · {quotaLabel(p.quota, homeState || null)}</Typography>
                      </Stack>
                    </TableCell>
                  );
                })}
                <TableCell>
                  <CollegeLink p={row} name={row.institute} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}

export default function JosaaPredictorPage() {
  useToolOpened('josaa_predictor');
  return <PredictorContent />;
}
