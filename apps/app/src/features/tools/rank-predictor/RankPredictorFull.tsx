'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { alpha } from '@mui/material/styles';
import {
  Box,
  Typography,
  Paper,
  Button,
  Alert,
  TextField,
  MenuItem,
  Chip,
  CircularProgress,
  Skeleton,
} from '@neram/ui';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PeopleIcon from '@mui/icons-material/People';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { getFirebaseAuth } from '@neram/auth';
import { useToolOpened } from '@/hooks/useToolOpened';
import ToolPageHeader from '@/components/tools-hub/ToolPageHeader';
import RetryAlert from '@/components/counseling/RetryAlert';
import {
  pickDefaultSystem,
  isSystemSelectable,
  readJsonOrThrow,
  isAbortError,
} from '@/components/counseling/counselingSystems';

interface CounselingSystem {
  id: string;
  code: string;
  name: string;
  short_name: string | null;
  state: string;
  conducting_body: string;
  merit_formula: {
    method: string;
    components: { name: string; key: string; max_marks: number; source: string }[];
    total_marks: number;
  };
  exams_accepted: string[];
  categories: { code: string; name: string; description?: string }[];
  is_active: boolean;
  has_data?: boolean;
}

interface PredictionResult {
  predictedRank: { min: number; max: number } | null;
  categoryRank: { min: number; max: number } | null;
  percentile: number | null;
  totalCandidates: number;
  matchedEntries: number;
  confidenceBand: string;
  dataSource?: 'rank_list' | 'allotment_list';
  dataSourceLabel?: string;
}

/**
 * Only the fields this page is allowed to show. Names, dates of birth and
 * application numbers are never copied out of the response.
 */
interface SimilarStudent {
  rank: number;
  aggregate_mark: number;
  community: string | null;
  community_rank: number | null;
  college_name: string | null;
}

interface CommunityStats {
  systemId: string;
  year: number;
  rows: { community: string; count: number }[];
  total: number;
  allotmentCount: number;
}

interface ResultInputs {
  systemCode: string;
  systemName: string;
  score: number;
  category: string;
  year: number | '';
}

type LoadStatus = 'loading' | 'ready' | 'error';

const NOT_AVAILABLE = 'Not available';
const SIMILAR_PREVIEW = 10;

function toSafeStudents(rows: unknown): SimilarStudent[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r: any) => ({
    rank: Number(r?.rank),
    aggregate_mark: Number(r?.aggregate_mark),
    community: typeof r?.community === 'string' ? r.community : null,
    community_rank: typeof r?.community_rank === 'number' ? r.community_rank : null,
    college_name: typeof r?.college_name === 'string' && r.college_name ? r.college_name : null,
  }));
}

function formatRange(range: { min: number; max: number } | null): string | null {
  if (!range) return null;
  if (range.min === range.max) return range.min.toLocaleString('en-IN');
  return `${range.min.toLocaleString('en-IN')}–${range.max.toLocaleString('en-IN')}`;
}

// ─── Stat tile ───────────────────────────────────────────

function StatTile({
  label,
  value,
  help,
  emphasis = false,
}: {
  label: string;
  value: string | null;
  help: string;
  emphasis?: boolean;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 1.5, sm: 2 },
        borderRadius: 2,
        border: emphasis ? '2px solid' : '1px solid',
        borderColor: emphasis ? 'primary.main' : 'divider',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.25,
      }}
    >
      <Typography variant="body2" color="text.secondary" fontWeight={600}>
        {label}
      </Typography>
      {value ? (
        <Typography
          sx={{
            fontSize: { xs: '1.375rem', sm: '1.5rem' },
            fontWeight: 700,
            lineHeight: 1.2,
            color: emphasis ? 'primary.main' : 'text.primary',
            overflowWrap: 'anywhere',
          }}
        >
          {value}
        </Typography>
      ) : (
        <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: 'text.secondary', lineHeight: 1.5 }}>
          {NOT_AVAILABLE}
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary">
        {help}
      </Typography>
    </Paper>
  );
}

// ─── Skeleton for the first load ─────────────────────────

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
        <Skeleton variant="rounded" height={48} sx={{ minWidth: 160 }} />
      </Box>
    </Paper>
  );
}

// ─── Page ────────────────────────────────────────────────

export default function CounselingRankPredictorPage() {
  useToolOpened('rank_predictor');
  return (
    <Box sx={{ maxWidth: 760, mx: 'auto' }}>
      <ToolPageHeader toolId="counseling-rank-predictor" />
      <Suspense fallback={<FormSkeleton />}>
        <RankPredictorFromUrl />
      </Suspense>
    </Box>
  );
}

/** Re-mount the tool when the query string changes, so new URL inputs always apply */
function RankPredictorFromUrl() {
  const searchParams = useSearchParams();
  const key = searchParams.toString();
  return (
    <RankPredictorContent
      key={key}
      urlSystem={searchParams.get('system')}
      urlScore={searchParams.get('score')}
      urlCategory={searchParams.get('category')}
    />
  );
}

function RankPredictorContent({
  urlSystem,
  urlScore,
  urlCategory,
}: {
  urlSystem: string | null;
  urlScore: string | null;
  urlCategory: string | null;
}) {
  // Systems
  const [systems, setSystems] = useState<CounselingSystem[]>([]);
  const [systemsStatus, setSystemsStatus] = useState<LoadStatus>('loading');
  const [systemsReload, setSystemsReload] = useState(0);
  const [selectedSystemCode, setSelectedSystemCode] = useState('');

  // Years and stats
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [yearsStatus, setYearsStatus] = useState<LoadStatus>('loading');
  const [yearsReload, setYearsReload] = useState(0);
  const [stats, setStats] = useState<CommunityStats | null>(null);

  // Input
  const [compositeScore, setCompositeScore] = useState(urlScore || '');
  const [category, setCategory] = useState(urlCategory || '');
  const [selectedYear, setSelectedYear] = useState<number | ''>('');

  // Results
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [resultInputs, setResultInputs] = useState<ResultInputs | null>(null);
  const [similarStudents, setSimilarStudents] = useState<SimilarStudent[]>([]);
  const [showAllSimilar, setShowAllSimilar] = useState(false);

  // Only the newest prediction request may write results
  const requestIdRef = useRef(0);
  const predictAbortRef = useRef<AbortController | null>(null);

  const selectedSystem = systems.find((s) => s.code === selectedSystemCode) || null;
  const hasData = yearsStatus === 'ready' && availableYears.length > 0;

  // Fetch systems
  useEffect(() => {
    const controller = new AbortController();
    setSystemsStatus('loading');
    fetch('/api/tools/rank-predictor', { signal: controller.signal })
      .then((res) => readJsonOrThrow<{ systems?: CounselingSystem[] }>(res, 'Could not load counseling systems.'))
      .then((data) => {
        const all = data.systems || [];
        setSystems(all);
        setSelectedSystemCode((current) => {
          if (current && all.some((s) => s.code === current)) return current;
          return pickDefaultSystem(all, urlSystem)?.code ?? '';
        });
        setSystemsStatus('ready');
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setSystemsStatus('error');
      });
    return () => controller.abort();
  }, [systemsReload, urlSystem]);

  // Keep the category valid for the selected system
  useEffect(() => {
    if (!selectedSystem) return;
    if (category && !selectedSystem.categories.some((c) => c.code === category)) setCategory('');
  }, [selectedSystem, category]);

  // Fetch years (and stats for the latest year) when the system changes
  useEffect(() => {
    if (!selectedSystem) return;
    const controller = new AbortController();
    const systemId = selectedSystem.id;
    setAvailableYears([]);
    setSelectedYear('');
    setStats(null);
    setYearsStatus('loading');
    fetch(`/api/tools/rank-predictor?action=years&systemId=${encodeURIComponent(systemId)}`, { signal: controller.signal })
      .then((res) => readJsonOrThrow<any>(res, 'Could not load data years.'))
      .then((data) => {
        const years: number[] = Array.isArray(data.years) ? data.years : [];
        setAvailableYears(years);
        if (years.length > 0) setSelectedYear(years[0]);
        const statsYear = typeof data.statsYear === 'number' ? data.statsYear : years[0];
        if (Array.isArray(data.communityStats) && statsYear) {
          const rows = data.communityStats.map((s: any) => ({ community: String(s.community), count: Number(s.count) || 0 }));
          setStats({
            systemId,
            year: statsYear,
            rows,
            total: rows.reduce((sum: number, r: { count: number }) => sum + r.count, 0),
            allotmentCount: Number(data.allotmentCount) || 0,
          });
        }
        setYearsStatus('ready');
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setYearsStatus('error');
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSystem?.id, yearsReload]);

  // Refetch community stats when the student picks a different year
  useEffect(() => {
    if (!selectedSystem || selectedYear === '' || yearsStatus !== 'ready') return;
    if (stats && stats.systemId === selectedSystem.id && stats.year === selectedYear) return;
    const controller = new AbortController();
    const systemId = selectedSystem.id;
    const year = selectedYear;
    fetch(`/api/tools/rank-predictor?action=years&systemId=${encodeURIComponent(systemId)}&year=${year}`, { signal: controller.signal })
      .then((res) => readJsonOrThrow<any>(res, 'Could not load statistics.'))
      .then((data) => {
        if (!Array.isArray(data.communityStats)) {
          setStats(null);
          return;
        }
        const rows = data.communityStats.map((s: any) => ({ community: String(s.community), count: Number(s.count) || 0 }));
        setStats({
          systemId,
          year,
          rows,
          total: rows.reduce((sum: number, r: { count: number }) => sum + r.count, 0),
          allotmentCount: Number(data.allotmentCount) || 0,
        });
      })
      .catch((err) => {
        // Stats are a bonus; on failure hide them rather than show another year's numbers
        if (!isAbortError(err)) setStats(null);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSystem?.id, selectedYear, yearsStatus]);

  // Cancel any in-flight prediction on unmount
  useEffect(() => () => predictAbortRef.current?.abort(), []);

  const clearResults = useCallback(() => {
    requestIdRef.current += 1;
    predictAbortRef.current?.abort();
    setLoading(false);
    setPrediction(null);
    setResultInputs(null);
    setSimilarStudents([]);
    setShowAllSimilar(false);
    setError(null);
  }, []);

  const handlePredict = useCallback(async () => {
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
    const inputs: ResultInputs = {
      systemCode: selectedSystem.code,
      systemName: selectedSystem.name,
      score,
      category,
      year: selectedYear,
    };

    setLoading(true);
    setError(null);
    setPrediction(null);
    setSimilarStudents([]);
    setShowAllSimilar(false);
    try {
      const currentUser = getFirebaseAuth().currentUser;
      if (!currentUser) throw new Error('Your session ended. Please sign in again.');
      const token = await currentUser.getIdToken();
      const res = await fetch('/api/tools/rank-predictor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          systemCode: inputs.systemCode,
          compositeScore: score,
          category: category || undefined,
          year: selectedYear || undefined,
        }),
        signal: controller.signal,
      });
      const data = await readJsonOrThrow<any>(res, 'Prediction failed. Please try again.');
      if (requestId !== requestIdRef.current) return;
      setPrediction(data.prediction ?? null);
      setResultInputs(inputs);
      setSimilarStudents(toSafeStudents(data.similarStudents));
    } catch (err: any) {
      if (isAbortError(err) || requestId !== requestIdRef.current) return;
      setError({ message: err?.message || 'Prediction failed. Please try again.', retryable: true });
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [compositeScore, category, selectedYear, selectedSystem]);

  const categoryOptions = selectedSystem
    ? [{ value: '', label: 'All categories' }, ...selectedSystem.categories.map((c) => ({ value: c.code, label: c.name ? `${c.code}: ${c.name}` : c.code }))]
    : [];

  const formulaSummary = selectedSystem
    ? selectedSystem.merit_formula.components.map((c) => `${c.name} (${c.max_marks})`).join(' + ')
    : '';

  // ─── Render ─────────────────────────────────────────────

  if (systemsStatus === 'loading' && systems.length === 0) return <FormSkeleton />;

  if (systemsStatus === 'error' && systems.length === 0) {
    return (
      <RetryAlert
        message="We could not load the counseling systems. Check your connection and try again."
        onRetry={() => setSystemsReload((n) => n + 1)}
      />
    );
  }

  const statsForYear =
    stats && selectedSystem && stats.systemId === selectedSystem.id && stats.year === selectedYear && stats.rows.length > 0
      ? stats
      : null;

  const scoreValue = parseFloat(compositeScore);
  const visibleStudents = showAllSimilar ? similarStudents : similarStudents.slice(0, SIMILAR_PREVIEW);
  const hasCollegeData = similarStudents.some((s) => s.college_name);

  const collegeHref =
    prediction?.predictedRank && resultInputs
      ? `/tools/counseling/college-predictor?${new URLSearchParams({
          system: resultInputs.systemCode,
          score: String(resultInputs.score),
          rank: String(prediction.predictedRank.min),
          ...(resultInputs.year ? { year: String(resultInputs.year) } : {}),
          ...(resultInputs.category ? { category: resultInputs.category } : {}),
        }).toString()}`
      : null;

  return (
    <Box>
      {/* Form */}
      <Paper
        component="form"
        noValidate
        onSubmit={(e: React.FormEvent) => {
          e.preventDefault();
          if (!loading && compositeScore && hasData) handlePredict();
        }}
        elevation={0}
        sx={{ p: { xs: 2, sm: 2.5 }, mb: 2, borderRadius: 2 }}
      >
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'minmax(0,2fr) minmax(0,1fr)' } }}>
          <TextField
            select
            fullWidth
            label="Counseling system"
            value={selectedSystemCode}
            onChange={(e) => {
              setSelectedSystemCode(e.target.value);
              setCategory('');
              clearResults();
            }}
          >
            {systems.map((sys) => {
              const selectable = isSystemSelectable(sys);
              return (
                <MenuItem key={sys.code} value={sys.code} disabled={!selectable} sx={{ minHeight: 48, whiteSpace: 'normal' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                    <span>{sys.name}</span>
                    {!selectable && <Chip label="Coming soon" size="small" sx={{ ml: 'auto', fontSize: '0.75rem' }} />}
                  </Box>
                </MenuItem>
              );
            })}
          </TextField>

          <TextField
            fullWidth
            label={selectedSystem ? `Score (out of ${selectedSystem.merit_formula.total_marks})` : 'Composite score'}
            type="number"
            value={compositeScore}
            onChange={(e) => setCompositeScore(e.target.value)}
            inputProps={{ min: 0, max: selectedSystem?.merit_formula.total_marks || 400, step: 0.01, inputMode: 'decimal' }}
            disabled={!hasData}
          />
        </Box>

        <Box
          sx={{
            display: 'grid',
            gap: 2,
            mt: 2,
            alignItems: 'center',
            gridTemplateColumns: { xs: '1fr', sm: availableYears.length > 0 ? '1fr 1fr' : '1fr', md: availableYears.length > 0 ? 'minmax(0,1fr) minmax(0,1fr) auto' : 'minmax(0,1fr) auto' },
          }}
        >
          <TextField
            select
            fullWidth
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={!hasData || !selectedSystem}
            SelectProps={{ displayEmpty: true }}
            InputLabelProps={{ shrink: true }}
          >
            {categoryOptions.map((cat) => (
              <MenuItem key={cat.value || 'all'} value={cat.value} sx={{ minHeight: 48 }}>
                {cat.label}
              </MenuItem>
            ))}
          </TextField>

          {availableYears.length > 0 && (
            <TextField
              select
              fullWidth
              label="Data year"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            >
              {availableYears.map((y) => (
                <MenuItem key={y} value={y} sx={{ minHeight: 48 }}>
                  {y}
                </MenuItem>
              ))}
            </TextField>
          )}

          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={loading || !compositeScore || !hasData || !selectedSystem}
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <TrendingUpIcon aria-hidden="true" />}
            sx={{ minHeight: 48, width: { xs: '100%', md: 'auto' }, gridColumn: { sm: availableYears.length > 0 ? '1 / -1' : 'auto', md: 'auto' }, whiteSpace: 'nowrap' }}
          >
            {loading ? 'Predicting...' : 'Predict rank'}
          </Button>
        </Box>

        {selectedSystem && formulaSummary && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            Score = {formulaSummary} = {selectedSystem.merit_formula.total_marks}
          </Typography>
        )}
      </Paper>

      {/* Years: loading, error or no data */}
      {selectedSystem && yearsStatus === 'loading' && (
        <Skeleton variant="rounded" height={88} sx={{ mb: 2 }} aria-label="Loading data" />
      )}
      {selectedSystem && yearsStatus === 'error' && (
        <RetryAlert
          message={`We could not load the data for ${selectedSystem.name}. Check your connection and try again.`}
          onRetry={() => setYearsReload((n) => n + 1)}
          sx={{ mb: 2 }}
        />
      )}
      {selectedSystem && yearsStatus === 'ready' && availableYears.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Rank data for {selectedSystem.name} is not available yet. Pick another counseling system, such as TNEA or KEAM B.Arch.
        </Alert>
      )}

      {/* Community stats for the selected year */}
      {statsForYear && !prediction && !loading && (
        <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
          <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
            {statsForYear.year} data: {statsForYear.total.toLocaleString('en-IN')} applied
            {statsForYear.allotmentCount > 0 ? `, ${statsForYear.allotmentCount.toLocaleString('en-IN')} got seats` : ''}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {statsForYear.rows.map((cs) => (
              <Chip
                key={cs.community}
                label={`${cs.community}: ${cs.count.toLocaleString('en-IN')}`}
                variant="outlined"
                sx={{ fontSize: '0.8125rem' }}
              />
            ))}
          </Box>
        </Paper>
      )}

      {error && (
        <RetryAlert
          message={error.message}
          onRetry={error.retryable ? handlePredict : undefined}
          sx={{ mb: 2 }}
        />
      )}

      {/* Loading results */}
      {loading && (
        <Box aria-busy="true" aria-label="Predicting your rank" sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', sm: 'repeat(4, minmax(0,1fr))' }, mb: 2 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={112} />
          ))}
        </Box>
      )}

      {/* Results */}
      {prediction && resultInputs && !loading && (
        <Box aria-live="polite">
          <Box
            sx={{
              display: 'grid',
              gap: 1.5,
              mb: 2,
              gridTemplateColumns: {
                xs: 'repeat(2, minmax(0,1fr))',
                sm: `repeat(${resultInputs.category ? 4 : 3}, minmax(0,1fr))`,
              },
            }}
          >
            <StatTile
              emphasis
              label="Overall rank"
              value={formatRange(prediction.predictedRank)}
              help={`out of ${prediction.totalCandidates ? prediction.totalCandidates.toLocaleString('en-IN') : 'all'} candidates`}
            />
            {resultInputs.category && (
              <StatTile
                label={`${resultInputs.category} rank`}
                value={formatRange(prediction.categoryRank)}
                help={`among ${resultInputs.category} candidates`}
              />
            )}
            <StatTile
              label="Better than"
              value={prediction.percentile != null ? `${prediction.percentile.toFixed(1)}%` : null}
              help="of all candidates (they scored lower than you)"
            />
            <StatTile
              label="Nearby students"
              value={(prediction.matchedEntries || 0).toLocaleString('en-IN')}
              help="scored within 5 marks of you; the estimate is based on them"
            />
          </Box>

          {prediction.predictedRank && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Based on {prediction.dataSourceLabel || `${resultInputs.year || 'the latest'} ${resultInputs.systemName} data`}. Actual ranks may vary.
            </Typography>
          )}

          {/* Similar students: rank, score, community and allotted college only */}
          {similarStudents.length > 0 && (
            <Paper elevation={0} sx={{ mb: 2, borderRadius: 2, overflow: 'hidden' }}>
              <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                <PeopleIcon aria-hidden="true" sx={{ fontSize: 20, color: 'text.secondary' }} />
                <Typography component="h2" variant="subtitle2">
                  Students who scored close to you
                </Typography>
              </Box>
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {visibleStudents.map((s, i) => {
                  const isClosest = !isNaN(scoreValue) && Math.abs(s.aggregate_mark - scoreValue) < 1;
                  return (
                    <Box
                      component="li"
                      key={`${s.rank}-${i}`}
                      sx={{
                        px: 2,
                        py: 1.25,
                        display: 'grid',
                        gridTemplateColumns: 'auto minmax(0,1fr) auto',
                        gap: 1.5,
                        alignItems: 'center',
                        borderTop: i === 0 ? 'none' : '1px solid',
                        borderColor: 'divider',
                        bgcolor: isClosest ? 'action.selected' : 'transparent',
                      }}
                    >
                      <Box sx={{ minWidth: 64 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          Rank
                        </Typography>
                        <Typography variant="body2" fontWeight={700}>
                          {Number.isFinite(s.rank) ? s.rank.toLocaleString('en-IN') : NOT_AVAILABLE}
                        </Typography>
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2">
                          Score <strong>{Number.isFinite(s.aggregate_mark) ? s.aggregate_mark : NOT_AVAILABLE}</strong>
                          {s.community_rank != null && (
                            <Box component="span" sx={{ color: 'text.secondary' }}>
                              {`, ${s.community || 'community'} rank ${s.community_rank.toLocaleString('en-IN')}`}
                            </Box>
                          )}
                        </Typography>
                        {hasCollegeData && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                            {s.college_name ? `Allotted: ${s.college_name}` : 'No seat allotted'}
                          </Typography>
                        )}
                      </Box>
                      {s.community && <Chip label={s.community} variant="outlined" sx={{ fontSize: '0.75rem' }} />}
                    </Box>
                  );
                })}
              </Box>
              {similarStudents.length > SIMILAR_PREVIEW && (
                <Box sx={{ px: 2, py: 1, borderTop: '1px solid', borderColor: 'divider' }}>
                  <Button fullWidth onClick={() => setShowAllSimilar((v) => !v)} aria-expanded={showAllSimilar}>
                    {showAllSimilar ? 'Show fewer' : `Show all ${similarStudents.length}`}
                  </Button>
                </Box>
              )}
            </Paper>
          )}

          {/* Hand-off to the college predictor */}
          {collegeHref && prediction.predictedRank && (
            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 2,
                borderColor: 'primary.main',
                bgcolor: (t) => alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.12 : 0.06),
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                alignItems: { xs: 'stretch', sm: 'center' },
                justifyContent: 'space-between',
                gap: 1.5,
              }}
            >
              <Typography variant="subtitle1" component="p">
                Find colleges for rank {formatRange(prediction.predictedRank)}
              </Typography>
              <Button
                component={Link}
                href={collegeHref}
                variant="contained"
                endIcon={<ArrowForwardIcon aria-hidden="true" />}
                sx={{ minHeight: 48 }}
              >
                Open College Predictor
              </Button>
            </Paper>
          )}
        </Box>
      )}

      {!prediction && !loading && !error && selectedSystem && hasData && (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 1 }}>
          Enter your composite score and tap Predict rank.
        </Typography>
      )}
    </Box>
  );
}
