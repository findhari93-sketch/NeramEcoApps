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
  Stack,
  Divider,
  Tooltip,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Checkbox,
  FormControlLabel,
  Link as MuiLink,
} from '@neram/ui';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { getFirebaseAuth, useFirebaseAuth } from '@neram/auth';
import { AuthGate } from '@/components/AuthGate';
import { partitionByIit, dedupeIitByInstitute } from '@/lib/josaa-zones';

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

const CHANCE_CONFIG: Record<Chance, { label: string; color: string; bgColor: string; emoji: string }> = {
  safe: { label: 'Safe', color: '#2E7D32', bgColor: '#E8F5E9', emoji: '✅' },
  probable: { label: 'Probable', color: '#E65100', bgColor: '#FFF3E0', emoji: '⚖️' },
  reach: { label: 'Reach', color: '#C62828', bgColor: '#FFEBEE', emoji: '🔥' },
};

const MARKETING_BASE_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ||
  (typeof window !== 'undefined' && window.location.hostname.includes('staging')
    ? 'https://staging.neramclasses.com'
    : 'https://neramclasses.com');

const IIT_AAT_GUIDE_URL = `${MARKETING_BASE_URL}/counseling/concepts/aat-explained`;
const IIT_AAT_HUB_URL = `${MARKETING_BASE_URL}/aat-2026`;

function collegeUrl(p: JosaaPrediction): string | null {
  if (!p.college_slug || !p.state_slug || !p.city_slug) return null;
  return `${MARKETING_BASE_URL}/colleges/${p.state_slug}/${p.city_slug}/${p.college_slug}`;
}

function quotaLabel(quota: string, homeState: string | null, instState: string | null): string {
  if (quota === 'AI') return 'All India';
  if (quota === 'HS') return `Home State${homeState ? ` (${homeState})` : ''}`;
  if (quota === 'OS') return 'Other State';
  if (quota === 'GO') return 'Goa quota';
  if (quota === 'JK') return 'J&K quota';
  if (quota === 'LA') return 'Ladakh quota';
  return quota;
}

function PredictorContent() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { user } = useFirebaseAuth();

  // ── Form state ──────────────────────────────────────────
  const [category, setCategory] = useState<Category>('OPEN');
  const [pwd, setPwd] = useState(false);
  const [rankType, setRankType] = useState<RankType>('CRL');
  const [rank, setRank] = useState('');
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
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<JosaaPrediction[] | null>(null);
  const [counts, setCounts] = useState<{ safe: number; probable: number; reach: number } | null>(null);
  const [byYear, setByYear] = useState<Record<number, { predictions: JosaaPrediction[]; counts: any }> | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(isMobile ? 'cards' : 'table');

  // When category becomes 'OPEN', rank-type is forced to CRL.
  useEffect(() => {
    if (category === 'OPEN' && rankType !== 'CRL') setRankType('CRL');
  }, [category, rankType]);

  // Discover which years are actually loaded in the DB so the UI surfaces
  // 2019/2020 if/when they get scraped + imported later, without redeploy.
  useEffect(() => {
    fetch('/api/tools/josaa-predictor/years', { method: 'GET' })
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
      .catch(() => {});
  }, []);

  const rankHelper = useMemo(() => {
    if (category === 'OPEN') return 'CRL = your Common Rank List position (the "CRL" column on your JEE Main Paper 2A scorecard).';
    if (rankType === 'CRL') return `You're using your CRL rank. The predictor will compare it against OPEN seat closing ranks only.`;
    return `You're using your ${category} category rank from the "${category}" column on your scorecard. Predictor compares against ${category} seats.`;
  }, [category, rankType]);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setPredictions(null);
    setCounts(null);
    setByYear(null);

    const rankNum = parseInt(rank, 10);
    if (!Number.isFinite(rankNum) || rankNum < 1) {
      setError('Enter a valid JEE Main Paper 2A rank.');
      return;
    }
    if (compareMode && compareYears.length === 0) {
      setError('Select at least one year to compare.');
      return;
    }

    setSubmitted(true);
    if (!user) return;

    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Please sign in again.');

      const body: any = {
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

      const res = await fetch('/api/tools/josaa-predictor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to predict colleges.');

      if (compareMode && json.byYear) {
        setByYear(json.byYear);
      } else {
        setPredictions(json.predictions || []);
        setCounts(json.counts || { safe: 0, probable: 0, reach: 0 });
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to predict colleges.');
    } finally {
      setLoading(false);
    }
  }, [rank, rankType, category, pwd, gender, homeState, year, roundNo, compareMode, compareYears, user]);

  // Re-run after sign-in
  useEffect(() => {
    if (user && submitted && !predictions && !byYear && !loading) handleSubmit();
  }, [user, submitted, predictions, byYear, loading, handleSubmit]);

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

  // For compare mode: union of institutes across years, ordered by best chance + nirf.
  // IITs are pulled out into a separate reference list (different admission pathway).
  const compareRows = useMemo(() => {
    if (!byYear) return null;
    const years = Object.keys(byYear).map((y) => parseInt(y, 10)).sort((a, b) => b - a);
    const byInstitute = new Map<string, { institute: string; institute_type: string; state: string | null; nirf_rank: number | null; college_slug: string | null; state_slug: string | null; city_slug: string | null; perYear: Record<number, JosaaPrediction | null> }>();
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

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 2, sm: 3 } }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <AccountBalanceIcon color="primary" />
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          JoSAA B.Arch Predictor
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Predicts your B.Arch chances at IITs, NITs, SPAs and GFTIs using real JoSAA closing ranks
        from 2023, 2024 and 2025.
      </Typography>

      {/* ── Form ─────────────────────────────────────── */}
      <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 3 }} component="form" onSubmit={handleSubmit}>
        <Stack spacing={2.5}>
          {/* ① Category */}
          <FormControl fullWidth size="medium">
            <InputLabel id="josaa-category-label">Your category</InputLabel>
            <Select
              labelId="josaa-category-label"
              label="Your category"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControlLabel
            control={<Checkbox checked={pwd} onChange={(e) => setPwd(e.target.checked)} />}
            label="I'm a Person with Benchmark Disability (PwD)"
          />

          {/* ② Rank-type toggle (only when category != OPEN) */}
          {category !== 'OPEN' && (
            <Box>
              <Typography variant="body2" sx={{ mb: 0.75, fontWeight: 600 }}>
                Which rank are you entering?
              </Typography>
              <ToggleButtonGroup
                exclusive
                fullWidth
                color="primary"
                value={rankType}
                onChange={(_, v) => v && setRankType(v as RankType)}
                size="small"
              >
                <ToggleButton value="CRL">CRL</ToggleButton>
                <ToggleButton value="CATEGORY">{category} category</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          )}

          {/* ③ Rank input */}
          <TextField
            label={`Your ${rankType === 'CRL' ? 'CRL' : `${category} category`} rank`}
            placeholder="e.g. 1067"
            type="number"
            value={rank}
            onChange={(e) => setRank(e.target.value)}
            inputProps={{ min: 1, max: 1500000, inputMode: 'numeric', pattern: '[0-9]*' }}
            fullWidth
            helperText={
              <Stack direction="row" spacing={0.5} alignItems="flex-start" sx={{ mt: 0.25 }}>
                <InfoOutlinedIcon sx={{ fontSize: 16, mt: 0.25 }} />
                <Box component="span">{rankHelper}</Box>
              </Stack>
            }
          />

          {/* ④ Home state */}
          <FormControl fullWidth>
            <InputLabel id="josaa-home-state-label">Home state</InputLabel>
            <Select
              labelId="josaa-home-state-label"
              label="Home state"
              value={homeState}
              onChange={(e) => setHomeState(e.target.value as string)}
            >
              <MenuItem value="">
                <em>All India only (no state quota)</em>
              </MenuItem>
              {STATES.map((s) => (
                <MenuItem key={s} value={s}>{s}</MenuItem>
              ))}
            </Select>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
              Used to decide HS (Home State) vs OS (Other State) eligibility for NIT seats.
            </Typography>
          </FormControl>

          {/* ⑤ Gender */}
          <Box>
            <Typography variant="body2" sx={{ mb: 0.75, fontWeight: 600 }}>Gender</Typography>
            <ToggleButtonGroup
              exclusive
              fullWidth
              color="primary"
              value={gender}
              onChange={(_, v) => v && setGender(v)}
              size="small"
            >
              <ToggleButton value="Gender-Neutral">Gender-Neutral</ToggleButton>
              <ToggleButton value="Female-only (including Supernumerary)">Female-only</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* ⑥ Compare mode */}
          <Box>
            <FormControlLabel
              control={<Checkbox checked={compareMode} onChange={(e) => setCompareMode(e.target.checked)} />}
              label="Compare across years"
            />
            {compareMode && (
              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}>
                {availableYears.map((y) => (
                  <Chip
                    key={y}
                    label={y}
                    color={compareYears.includes(y) ? 'primary' : 'default'}
                    onClick={() => setCompareYears((prev) => prev.includes(y) ? prev.filter((x) => x !== y) : [...prev, y].sort((a, b) => b - a))}
                  />
                ))}
              </Stack>
            )}
          </Box>

          {/* ⑦ Advanced */}
          <Button
            size="small"
            color="inherit"
            startIcon={advancedOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            onClick={() => setAdvancedOpen((v) => !v)}
            sx={{ alignSelf: 'flex-start' }}
          >
            Advanced (year, round)
          </Button>
          <Collapse in={advancedOpen}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormControl fullWidth disabled={compareMode}>
                <InputLabel id="josaa-year-label">Year (optional)</InputLabel>
                <Select
                  labelId="josaa-year-label"
                  label="Year (optional)"
                  value={year}
                  onChange={(e) => setYear(e.target.value as number | '')}
                >
                  <MenuItem value=""><em>Latest available</em></MenuItem>
                  {availableYears.map((y) => (
                    <MenuItem key={y} value={y}>{y}</MenuItem>
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
                  <MenuItem value=""><em>Last round of selected year</em></MenuItem>
                  {[1, 2, 3, 4, 5, 6].map((r) => (
                    <MenuItem key={r} value={r}>Round {r}</MenuItem>
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
            sx={{ minHeight: 48 }}
          >
            {loading ? <CircularProgress size={22} color="inherit" /> : 'Predict colleges →'}
          </Button>
        </Stack>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Auth gate (only blocks results, not the form) */}
      <AuthGate
        hasData={submitted && !user}
        title="Sign in to see your predictions"
        description="A free Neram account unlocks your full B.Arch predictions and saves them for later."
        pendingData={{ rank, rankType, category, pwd, gender, homeState }}
      >
        <></>
      </AuthGate>

      {/* ── Results ───────────────────────────────────── */}
      {(grouped || compareRows) && (
        <Stack spacing={2}>
          {/* Context banner */}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }} justifyContent="space-between">
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Your rank: {rank} ({rankType === 'CRL' ? 'CRL' : `${category} category`})
                  {pwd ? ' · PwD' : ''}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {homeState ? `Home state: ${homeState}` : 'Home state: All India only'} · {gender}
                  {compareMode ? ` · Comparing ${compareYears.join(', ')}` : ''}
                </Typography>
              </Box>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={viewMode}
                onChange={(_, v) => v && setViewMode(v as ViewMode)}
                aria-label="View mode"
              >
                <ToggleButton value="cards" aria-label="Cards"><ViewModuleIcon fontSize="small" />&nbsp;Cards</ToggleButton>
                <ToggleButton value="table" aria-label="Table"><ViewListIcon fontSize="small" />&nbsp;Table</ToggleButton>
              </ToggleButtonGroup>
            </Stack>
          </Paper>

          {/* Compare-mode results */}
          {compareRows && <CompareResultsTable rows={compareRows.rows} years={compareRows.years} homeState={homeState} />}
          {compareRows && compareRows.iitRows.length > 0 && (
            <IITPathwayZone rows={compareRows.iitRows} verdict={null} yearLabel={compareRows.years[0]} />
          )}

          {/* Single-year results */}
          {grouped && viewMode === 'cards' && (
            <GroupedCardsView grouped={grouped} homeState={homeState} />
          )}
          {grouped && viewMode === 'table' && (
            <FlatTableView predictions={predictions!} homeState={homeState} />
          )}

          {iitReference && iitReference.length > 0 && (
            <IITPathwayZone rows={iitReference} verdict={null} yearLabel={year || 'latest'} />
          )}

          {predictions && predictions.length === 0 && (
            <Alert severity="info">
              No JoSAA seats match this rank + category. Try a different seat type or quota.
            </Alert>
          )}
        </Stack>
      )}
    </Box>
  );
}

// ── View components ───────────────────────────────────────────────────────

function CollegeLink({ p }: { p: JosaaPrediction }) {
  const url = collegeUrl(p);
  if (!url) {
    return (
      <Tooltip title="Marketing page for this college isn't on Neram yet">
        <Typography variant="caption" color="text.disabled">No profile yet</Typography>
      </Tooltip>
    );
  }
  return (
    <MuiLink href={url} target="_blank" rel="noopener" variant="caption" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      View college <OpenInNewIcon sx={{ fontSize: 13 }} />
    </MuiLink>
  );
}

function ChanceChip({ chance }: { chance: Chance }) {
  const c = CHANCE_CONFIG[chance];
  return (
    <Chip
      label={`${c.emoji} ${c.label}`}
      size="small"
      sx={{ bgcolor: c.bgColor, color: c.color, fontWeight: 600 }}
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
        return (
          <Box key={tier}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, color: c.color }}>
              {c.emoji} {c.label} ({items.length})
            </Typography>
            <Stack spacing={1.5}>
              {items.map((p, idx) => (
                <Card key={`${p.institute}-${p.quota}-${p.seat_type}-${idx}`} variant="outlined">
                  <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                    <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          {p.institute}
                        </Typography>
                        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                          <Chip label={p.institute_type} size="small" variant="outlined" />
                          {p.state && <Chip label={p.state} size="small" variant="outlined" />}
                          <Chip label={quotaLabel(p.quota, homeState || null, p.state)} size="small" />
                          {p.nirf_rank != null && (
                            <Chip label={`NIRF ${p.nirf_rank}`} size="small" color="info" variant="outlined" />
                          )}
                        </Stack>
                      </Box>
                      <ChanceChip chance={p.chance} />
                    </Stack>
                    <Divider sx={{ my: 1 }} />
                    <Stack direction="row" spacing={2} justifyContent="space-between" alignItems="center" flexWrap="wrap">
                      <Typography variant="caption" color="text.secondary">
                        Closing rank: <b>{p.closing_rank ?? '—'}</b>
                        {p.opening_rank != null && <> · Opening: {p.opening_rank}</>}
                        {' · '}Margin: <b>{p.margin > 0 ? `+${p.margin}` : p.margin}</b>
                      </Typography>
                      <CollegeLink p={p} />
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
      <Table size="small">
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
              <TableCell>{p.state ?? '—'}</TableCell>
              <TableCell>{quotaLabel(p.quota, homeState || null, p.state)}</TableCell>
              <TableCell align="right">{p.closing_rank ?? '—'}</TableCell>
              <TableCell align="right">{p.margin > 0 ? `+${p.margin}` : p.margin}</TableCell>
              <TableCell align="right">{p.nirf_rank ?? '—'}</TableCell>
              <TableCell><CollegeLink p={p} /></TableCell>
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
  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
        🏛️ IIT B.Arch, a separate exam pathway
      </Typography>
      <Alert severity="warning" icon={<InfoOutlinedIcon />} sx={{ mb: 1.5 }}>
        IIT B.Arch (Kharagpur, Roorkee, BHU Varanasi) is <b>not</b> filled from your
        JEE Main Paper 2A rank. Seats go by your <b>JEE Advanced rank</b>, and only
        after you <b>Pass the AAT</b> (Architecture Aptitude Test, a Pass/Fail gate).
        The closing ranks below are JEE Advanced ranks, shown for reference.
      </Alert>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1.5 }}>
        {['1. Qualify JEE Advanced', '2. Pass AAT (Pass/Fail)', '3. JoSAA seat by Advanced rank'].map((s) => (
          <Chip key={s} label={s} size="small" variant="outlined" />
        ))}
      </Stack>

      <Stack spacing={1.5}>
        {rows.map((p) => {
          const v = verdict ? verdict[p.institute] : null;
          return (
            <Card key={p.institute} variant="outlined">
              <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {p.institute}
                    </Typography>
                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                      <Chip label="IIT" size="small" variant="outlined" />
                      {p.state && <Chip label={p.state} size="small" variant="outlined" />}
                      {p.nirf_rank != null && (
                        <Chip label={`NIRF ${p.nirf_rank}`} size="small" color="info" variant="outlined" />
                      )}
                    </Stack>
                  </Box>
                  {v ? (
                    <ChanceChip chance={v.chance} />
                  ) : (
                    <Chip
                      label="JEE Advanced + AAT"
                      size="small"
                      sx={{ bgcolor: '#ECEFF1', color: '#455A64', fontWeight: 600 }}
                    />
                  )}
                </Stack>
                <Divider sx={{ my: 1 }} />
                <Stack direction="row" spacing={2} justifyContent="space-between" alignItems="center" flexWrap="wrap">
                  <Typography variant="caption" color="text.secondary">
                    JEE Advanced closing rank{yearLabel ? ` (${yearLabel})` : ''}: <b>{p.closing_rank ?? '—'}</b>
                    {v && (
                      <>
                        {' · '}Your margin: <b>{v.margin > 0 ? `+${v.margin}` : v.margin}</b>
                      </>
                    )}
                  </Typography>
                  <CollegeLink p={p} />
                </Stack>
              </CardContent>
            </Card>
          );
        })}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap">
        <Button size="small" variant="outlined" href={IIT_AAT_GUIDE_URL} target="_blank" rel="noopener" endIcon={<OpenInNewIcon />}>
          How AAT works
        </Button>
        <Button size="small" variant="text" href={IIT_AAT_HUB_URL} target="_blank" rel="noopener" endIcon={<OpenInNewIcon />}>
          AAT 2026 guide
        </Button>
      </Stack>
    </Box>
  );
}

function CompareResultsTable({ rows, years, homeState }: { rows: any[]; years: number[]; homeState: string }) {
  return (
    <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
      <Table size="small">
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
              <TableCell>{row.state ?? '—'}</TableCell>
              <TableCell align="right">{row.nirf_rank ?? '—'}</TableCell>
              {years.map((y) => {
                const p = row.perYear[y];
                if (!p) return <TableCell key={y}><Typography variant="caption" color="text.disabled">—</Typography></TableCell>;
                return (
                  <TableCell key={y}>
                    <Stack spacing={0.5}>
                      <ChanceChip chance={p.chance} />
                      <Typography variant="caption">Close {p.closing_rank} · {quotaLabel(p.quota, homeState || null, p.state)}</Typography>
                    </Stack>
                  </TableCell>
                );
              })}
              <TableCell>
                <CollegeLink p={{
                  ...rows[0],
                  college_slug: row.college_slug,
                  state_slug: row.state_slug,
                  city_slug: row.city_slug,
                } as any} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}

export default function JosaaPredictorPage() {
  return <PredictorContent />;
}
