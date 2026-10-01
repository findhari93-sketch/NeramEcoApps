'use client';

import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Button,
  TextField,
  InputAdornment,
  LinearProgress,
  Collapse,
  Skeleton,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
} from '@neram/ui';
import { alpha, type Theme } from '@mui/material/styles';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import ToolPageHeader from '@/components/tools-hub/ToolPageHeader';
import { useToolOpened } from '@/hooks/useToolOpened';

// ─── Types ──────────────────────────────────────────────

interface CounselingSystem {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

interface YearWithSource {
  year: number;
  source: 'rank_list' | 'allotment' | 'both';
  count: number;
}

interface Funnel {
  totalApplicants: number;
  totalAllotted: number;
  conversionRate: number | null;
  hasRankData: boolean;
  hasAllotmentData: boolean;
}

interface CommunityStat {
  community: string;
  count: number;
  minRank: number;
  maxRank: number;
  avgScore: number;
}

interface CollegeStat {
  collegeCode: string;
  collegeName: string;
  allotted: number;
  minRank: number | null;
  maxRank: number | null;
  avgScore: number | null;
  categories: string;
}

interface Insights {
  funnel: Funnel | null;
  rankCommunity: CommunityStat[];
  allotmentCommunity: CommunityStat[];
  colleges: CollegeStat[];
}

type Status = 'idle' | 'loading' | 'error' | 'ready';

/** The only counseling system with full rank list, allotment and directory data today. */
const PREFERRED_SYSTEM_CODE = 'TNEA_BARCH';
const COLLEGES_PAGE = 20;

// ─── Helpers ──────────────────────────────────────────────

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-IN').format(n);
}

type Tone = 'success' | 'warning' | 'error';

function conversionTone(rate: number | null): Tone | null {
  if (rate == null) return null;
  if (rate >= 50) return 'success';
  if (rate >= 30) return 'warning';
  return 'error';
}

function toneColor(tone: Tone | null): string {
  return tone ? `${tone}.main` : 'text.secondary';
}

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json() as Promise<T>;
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

// ─── Small building blocks ───────────────────────────────

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert
      severity="error"
      sx={{ mb: 2.5, alignItems: 'center' }}
      action={
        <Button color="inherit" onClick={onRetry} sx={{ minHeight: 44, fontWeight: 700 }}>
          Retry
        </Button>
      }
    >
      {message}
    </Alert>
  );
}

function InsightsSkeleton() {
  return (
    <Box aria-hidden="true" sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
        <Skeleton width={140} height={24} sx={{ mb: 2 }} />
        <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
          <Skeleton variant="rounded" height={112} sx={{ flex: 1 }} />
          <Skeleton variant="rounded" height={112} sx={{ flex: 1 }} />
        </Box>
        <Skeleton variant="rounded" height={10} />
      </Paper>
      <Skeleton variant="rounded" height={56} />
      <Skeleton variant="rounded" height={56} />
    </Box>
  );
}

function PageSkeleton() {
  return (
    <Box aria-busy="true" aria-label="Loading counseling insights">
      <Skeleton variant="rounded" height={56} sx={{ mb: 2 }} />
      <Box sx={{ display: 'flex', gap: 1, mb: 2.5 }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rounded" width={72} height={44} sx={{ borderRadius: 999 }} />
        ))}
      </Box>
      <InsightsSkeleton />
    </Box>
  );
}

interface SectionProps {
  id: string;
  title: string;
  count: number;
  icon: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/** A card whose header is a real button, so it works with a keyboard and a screen reader. */
function CollapsibleSection({ id, title, count, icon, open, onToggle, children }: SectionProps) {
  const panelId = `${id}-panel`;
  return (
    <Paper variant="outlined" component="section" sx={{ borderRadius: 3, overflow: 'hidden' }}>
      <Typography component="h2" sx={{ m: 0 }}>
        <Box
          component="button"
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          sx={{
            width: '100%',
            minHeight: 56,
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            px: 2,
            py: 1.25,
            border: 0,
            bgcolor: 'transparent',
            color: 'text.primary',
            font: 'inherit',
            textAlign: 'left',
            cursor: 'pointer',
            transition: 'background-color 0.15s ease',
            '&:hover': { bgcolor: 'action.hover' },
            '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
          }}
        >
          <Box aria-hidden="true" sx={{ display: 'flex', color: 'primary.main' }}>
            {icon}
          </Box>
          <Box component="span" sx={{ flex: 1, fontSize: '1rem', fontWeight: 700 }}>
            {title}
          </Box>
          <Box
            component="span"
            sx={{
              fontSize: '0.8125rem',
              fontWeight: 700,
              px: 1,
              py: 0.25,
              borderRadius: 999,
              bgcolor: 'action.selected',
              color: 'text.primary',
            }}
          >
            {count}
            <Box component="span" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
              {' '}items
            </Box>
          </Box>
          <ExpandMoreIcon
            aria-hidden="true"
            sx={{
              color: 'text.secondary',
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s ease',
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          />
        </Box>
      </Typography>
      <Collapse in={open} id={panelId}>
        <Box sx={{ px: 2, pb: 2 }}>{children}</Box>
      </Collapse>
    </Paper>
  );
}

function StatCard({
  label,
  value,
  available,
  icon,
  tone,
}: {
  label: string;
  value: number;
  available: boolean;
  icon: ReactNode;
  tone: 'primary' | 'success';
}) {
  return (
    <Box
      sx={(theme: Theme) => ({
        flex: 1,
        minWidth: 0,
        p: { xs: 1.5, sm: 2 },
        textAlign: 'center',
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: available ? alpha(theme.palette[tone].main, 0.3) : 'divider',
        bgcolor: available ? alpha(theme.palette[tone].main, theme.palette.mode === 'light' ? 0.07 : 0.14) : 'action.hover',
      })}
    >
      <Box aria-hidden="true" sx={{ color: available ? `${tone}.main` : 'text.secondary', display: 'flex', justifyContent: 'center', mb: 0.5 }}>
        {icon}
      </Box>
      <Typography
        sx={{
          fontWeight: 700,
          fontSize: available ? { xs: '1.375rem', sm: '1.5rem' } : '1rem',
          lineHeight: 1.3,
          color: available ? `${tone}.main` : 'text.secondary',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {available ? formatNumber(value) : 'Not available'}
      </Typography>
      <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>{label}</Typography>
    </Box>
  );
}

// ─── Page ──────────────────────────────────────────────

export default function CounselingInsightsPage() {
  useToolOpened('counseling_insights');

  return (
    <Box sx={{ maxWidth: 820, mx: 'auto' }}>
      <ToolPageHeader toolId="counseling-insights" />
      {/* useSearchParams needs a Suspense boundary so the page can prerender */}
      <Suspense fallback={<PageSkeleton />}>
        <CounselingInsights />
      </Suspense>
    </Box>
  );
}

function CounselingInsights() {
  const searchParams = useSearchParams();
  const systemParam = searchParams.get('system');

  // Systems
  const [systems, setSystems] = useState<CounselingSystem[]>([]);
  const [systemsStatus, setSystemsStatus] = useState<Status>('loading');
  const [systemsReload, setSystemsReload] = useState(0);
  const [selectedSystemId, setSelectedSystemId] = useState('');

  // Years
  const [yearsWithSource, setYearsWithSource] = useState<YearWithSource[]>([]);
  const [yearsStatus, setYearsStatus] = useState<Status>('idle');
  const [yearsReload, setYearsReload] = useState(0);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  /** Which system the loaded years belong to, so a year is never paired with the wrong system */
  const [yearsSystemId, setYearsSystemId] = useState('');

  // Insights for the selected system and year
  const [insights, setInsights] = useState<Insights | null>(null);
  const [insightsStatus, setInsightsStatus] = useState<Status>('idle');
  const [insightsReload, setInsightsReload] = useState(0);

  // UI
  const [collegeSearch, setCollegeSearch] = useState('');
  const [showAllColleges, setShowAllColleges] = useState(false);
  const [communityOpen, setCommunityOpen] = useState(true);
  const [collegesOpen, setCollegesOpen] = useState(true);

  // 1. Systems. Prefer ?system=CODE, then the system that has data, then the first active one.
  useEffect(() => {
    const controller = new AbortController();
    setSystemsStatus('loading');
    getJson<{ systems?: CounselingSystem[] }>('/api/tools/counseling-insights', controller.signal)
      .then((data) => {
        const all = data.systems || [];
        setSystems(all);
        const wanted = systemParam?.toLowerCase();
        const fromParam = wanted
          ? all.find((s) => s.is_active && (s.code?.toLowerCase() === wanted || s.id === systemParam))
          : undefined;
        const preferred =
          fromParam ??
          all.find((s) => s.is_active && s.code === PREFERRED_SYSTEM_CODE) ??
          all.find((s) => s.is_active);
        setSelectedSystemId((current) => (current && all.some((s) => s.id === current) ? current : preferred?.id ?? ''));
        setSystemsStatus('ready');
      })
      .catch((err) => {
        if (isAbort(err)) return;
        setSystemsStatus('error');
      });
    return () => controller.abort();
  }, [systemParam, systemsReload]);

  // 2. Years for the selected system
  useEffect(() => {
    setYearsWithSource([]);
    setSelectedYear(null);
    setInsights(null);
    setInsightsStatus('idle');
    if (!selectedSystemId) {
      setYearsStatus('idle');
      return;
    }
    const controller = new AbortController();
    setYearsStatus('loading');
    getJson<{ yearsWithSource?: YearWithSource[] }>(
      `/api/tools/counseling-insights?systemId=${encodeURIComponent(selectedSystemId)}`,
      controller.signal,
    )
      .then((data) => {
        const yws = data.yearsWithSource || [];
        setYearsWithSource(yws);
        setSelectedYear(yws.length > 0 ? yws[0].year : null);
        setYearsSystemId(selectedSystemId);
        setYearsStatus('ready');
      })
      .catch((err) => {
        if (isAbort(err)) return;
        setYearsStatus('error');
      });
    return () => controller.abort();
  }, [selectedSystemId, yearsReload]);

  // 3. Insights for the selected year. The old year's numbers are cleared first, and
  //    aborting on change means a slow response for an earlier year can never land last.
  useEffect(() => {
    setInsights(null);
    setCollegeSearch('');
    setShowAllColleges(false);
    if (!selectedSystemId || !selectedYear || yearsSystemId !== selectedSystemId) {
      setInsightsStatus('idle');
      return;
    }
    const controller = new AbortController();
    setInsightsStatus('loading');
    getJson<{
      funnel?: Funnel;
      communityBreakdown?: { rankList?: CommunityStat[]; allotment?: CommunityStat[] };
      colleges?: CollegeStat[];
    }>(
      `/api/tools/counseling-insights?systemId=${encodeURIComponent(selectedSystemId)}&year=${selectedYear}`,
      controller.signal,
    )
      .then((data) => {
        setInsights({
          funnel: data.funnel || null,
          rankCommunity: data.communityBreakdown?.rankList || [],
          allotmentCommunity: data.communityBreakdown?.allotment || [],
          colleges: data.colleges || [],
        });
        setInsightsStatus('ready');
      })
      .catch((err) => {
        if (isAbort(err)) return;
        setInsightsStatus('error');
      });
    return () => controller.abort();
  }, [selectedSystemId, selectedYear, yearsSystemId, insightsReload]);

  const colleges = insights?.colleges ?? [];

  const filteredColleges = useMemo(() => {
    const q = collegeSearch.trim().toLowerCase();
    if (!q) return colleges;
    return colleges.filter(
      (c) =>
        c.collegeName.toLowerCase().includes(q) ||
        c.collegeCode.toLowerCase().includes(q) ||
        (c.categories || '').toLowerCase().includes(q),
    );
  }, [colleges, collegeSearch]);

  const displayColleges = showAllColleges ? filteredColleges : filteredColleges.slice(0, COLLEGES_PAGE);
  const hiddenCount = showAllColleges ? 0 : Math.max(0, filteredColleges.length - COLLEGES_PAGE);

  // Merge community data (applied vs got seats)
  const communityMerged = useMemo(() => {
    const map = new Map<string, { applied: number; allotted: number }>();
    for (const r of insights?.rankCommunity ?? []) {
      map.set(r.community, { applied: r.count, allotted: 0 });
    }
    for (const a of insights?.allotmentCommunity ?? []) {
      const existing = map.get(a.community) || { applied: 0, allotted: 0 };
      existing.allotted = a.count;
      map.set(a.community, existing);
    }
    return [...map.entries()]
      .map(([community, { applied, allotted }]) => ({ community, applied, allotted }))
      .sort((a, b) => b.applied - a.applied || b.allotted - a.allotted);
  }, [insights]);

  const selectedSystem = systems.find((s) => s.id === selectedSystemId);
  const preferredSystem = systems.find((s) => s.is_active && s.code === PREFERRED_SYSTEM_CODE);

  if (systemsStatus === 'loading') return <PageSkeleton />;

  if (systemsStatus === 'error') {
    return (
      <ErrorState
        message="We could not load the counseling systems. Check your connection and try again."
        onRetry={() => setSystemsReload((n) => n + 1)}
      />
    );
  }

  if (systems.length === 0) {
    return <Alert severity="info">Counseling data is not available yet. Please check back soon.</Alert>;
  }

  const funnel = insights?.funnel ?? null;

  return (
    <Box>
      {/* System selector */}
      {systems.length > 1 && (
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel id="insights-system-label">Counseling system</InputLabel>
          <Select
            labelId="insights-system-label"
            value={selectedSystemId}
            onChange={(e) => setSelectedSystemId(String(e.target.value))}
            label="Counseling system"
          >
            {systems.map((s) => (
              <MenuItem key={s.id} value={s.id} disabled={!s.is_active} sx={{ minHeight: 48 }}>
                {s.name}
                {!s.is_active ? ' (coming soon)' : ''}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {/* Years */}
      {yearsStatus === 'loading' && (
        <Box aria-hidden="true" sx={{ display: 'flex', gap: 1, mb: 2.5 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" width={72} height={44} sx={{ borderRadius: 999 }} />
          ))}
        </Box>
      )}

      {yearsStatus === 'error' && (
        <ErrorState
          message="We could not load the years for this counseling system."
          onRetry={() => setYearsReload((n) => n + 1)}
        />
      )}

      {yearsStatus === 'ready' && yearsWithSource.length === 0 && (
        <Alert
          severity="info"
          sx={{ mb: 2.5, alignItems: 'center' }}
          action={
            preferredSystem && preferredSystem.id !== selectedSystemId ? (
              <Button color="inherit" onClick={() => setSelectedSystemId(preferredSystem.id)} sx={{ minHeight: 44, fontWeight: 700 }}>
                Show {preferredSystem.name}
              </Button>
            ) : undefined
          }
        >
          We do not have data for {selectedSystem?.name ?? 'this counseling system'} yet.
        </Alert>
      )}

      {yearsWithSource.length > 0 && (
        <Box
          role="group"
          aria-label="Choose a year"
          sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2.5 }}
        >
          {yearsWithSource.map((yw) => {
            const selected = selectedYear === yw.year;
            return (
              <Box
                key={yw.year}
                component="button"
                type="button"
                aria-pressed={selected}
                onClick={() => setSelectedYear(yw.year)}
                sx={(theme: Theme) => ({
                  minHeight: 44,
                  minWidth: 72,
                  px: 2,
                  borderRadius: 999,
                  border: '1px solid',
                  borderColor: selected ? 'primary.main' : 'divider',
                  bgcolor: selected ? alpha(theme.palette.primary.main, 0.12) : 'background.paper',
                  color: selected ? 'primary.main' : 'text.primary',
                  font: 'inherit',
                  fontSize: '0.9375rem',
                  fontWeight: selected ? 700 : 500,
                  fontVariantNumeric: 'tabular-nums',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease, background-color 0.15s ease',
                  '&:hover': { borderColor: 'primary.main' },
                })}
              >
                {yw.year}
              </Box>
            );
          })}
        </Box>
      )}

      {/* Insights */}
      {insightsStatus === 'loading' && <InsightsSkeleton />}

      {insightsStatus === 'error' && (
        <ErrorState
          message={`We could not load the ${selectedYear ?? ''} statistics. Your connection may have dropped.`}
          onRetry={() => setInsightsReload((n) => n + 1)}
        />
      )}

      {insightsStatus === 'ready' && !funnel && (
        <Alert severity="info">No statistics are available for {selectedYear}. Try a different year.</Alert>
      )}

      {insightsStatus === 'ready' && funnel && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {/* Overview */}
          <Paper variant="outlined" component="section" aria-labelledby="overview-heading" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 3 }}>
            <Typography id="overview-heading" component="h2" sx={{ fontSize: '1rem', fontWeight: 700, mb: 2 }}>
              Overview for {selectedYear}
            </Typography>

            <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
              <StatCard
                label="Applied"
                value={funnel.totalApplicants}
                available={funnel.hasRankData}
                tone="primary"
                icon={<PeopleOutlineIcon sx={{ fontSize: 26 }} />}
              />
              <StatCard
                label="Got seats"
                value={funnel.totalAllotted}
                available={funnel.hasAllotmentData}
                tone="success"
                icon={<SchoolOutlinedIcon sx={{ fontSize: 26 }} />}
              />
            </Box>

            {funnel.hasRankData && funnel.hasAllotmentData && funnel.conversionRate != null ? (
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
                  <Typography id="acceptance-label" sx={{ fontSize: '0.9375rem', color: 'text.secondary' }}>
                    Applicants who got a seat
                  </Typography>
                  <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700, color: toneColor(conversionTone(funnel.conversionRate)) }}>
                    {funnel.conversionRate}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  aria-labelledby="acceptance-label"
                  value={Math.min(funnel.conversionRate, 100)}
                  sx={{
                    height: 10,
                    borderRadius: 5,
                    bgcolor: 'action.hover',
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 5,
                      bgcolor: toneColor(conversionTone(funnel.conversionRate)),
                    },
                  }}
                />
              </Box>
            ) : funnel.hasRankData !== funnel.hasAllotmentData ? (
              <Alert severity="info">
                {!funnel.hasRankData
                  ? 'The rank list for this year is not available, so only seat allotment data is shown.'
                  : 'Seat allotment data for this year is not available yet, so only applicant data is shown.'}
              </Alert>
            ) : null}
          </Paper>

          {/* Community breakdown */}
          {communityMerged.length > 0 && (
            <CollapsibleSection
              id="community"
              title="By community"
              count={communityMerged.length}
              icon={<GroupsOutlinedIcon sx={{ fontSize: 22 }} />}
              open={communityOpen}
              onToggle={() => setCommunityOpen((o) => !o)}
            >
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small" aria-label={`Applicants and seats by community, ${selectedYear}`}>
                  <TableHead>
                    <TableRow>
                      <HeadCell>Category</HeadCell>
                      {funnel.hasRankData && <HeadCell align="right">Applied</HeadCell>}
                      {funnel.hasAllotmentData && <HeadCell align="right">Got seats</HeadCell>}
                      {funnel.hasRankData && funnel.hasAllotmentData && <HeadCell align="right">Rate</HeadCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {communityMerged.map((row) => {
                      const rate = row.applied > 0 ? Math.round((row.allotted / row.applied) * 100) : null;
                      return (
                        <TableRow key={row.community}>
                          <TableCell component="th" scope="row" sx={{ ...bodyCellSx, fontWeight: 600 }}>
                            {row.community}
                          </TableCell>
                          {funnel.hasRankData && (
                            <TableCell align="right" sx={{ ...bodyCellSx, color: row.applied > 0 ? 'primary.main' : 'text.secondary' }}>
                              {row.applied > 0 ? formatNumber(row.applied) : 'N/A'}
                            </TableCell>
                          )}
                          {funnel.hasAllotmentData && (
                            <TableCell align="right" sx={{ ...bodyCellSx, color: row.allotted > 0 ? 'success.main' : 'text.secondary' }}>
                              {row.allotted > 0 ? formatNumber(row.allotted) : 'N/A'}
                            </TableCell>
                          )}
                          {funnel.hasRankData && funnel.hasAllotmentData && (
                            <TableCell align="right" sx={{ ...bodyCellSx, fontWeight: 700, color: toneColor(conversionTone(rate)) }}>
                              {rate != null ? `${rate}%` : 'N/A'}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </CollapsibleSection>
          )}

          {/* College breakdown */}
          {colleges.length > 0 && (
            <CollapsibleSection
              id="colleges"
              title="By college"
              count={colleges.length}
              icon={<SchoolOutlinedIcon sx={{ fontSize: 22 }} />}
              open={collegesOpen}
              onToggle={() => setCollegesOpen((o) => !o)}
            >
              <TextField
                type="search"
                fullWidth
                placeholder="Search college name, code or category"
                value={collegeSearch}
                onChange={(e) => {
                  setCollegeSearch(e.target.value);
                  setShowAllColleges(false);
                }}
                inputProps={{ 'aria-label': 'Search colleges', enterKeyHint: 'search' }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 1.5 }}
              />

              {collegeSearch.trim() && (
                <Typography role="status" sx={{ fontSize: '0.875rem', color: 'text.secondary', mb: 1 }}>
                  {filteredColleges.length} {filteredColleges.length === 1 ? 'college' : 'colleges'} found
                </Typography>
              )}

              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                {displayColleges.map((c, idx) => (
                  <Box
                    component="li"
                    key={`${c.collegeCode}-${idx}`}
                    sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography component="h3" sx={{ fontWeight: 700, fontSize: '0.9375rem', lineHeight: 1.35, overflowWrap: 'anywhere' }}>
                          {c.collegeName}
                        </Typography>
                        <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>Code {c.collegeCode}</Typography>
                      </Box>
                      <Box
                        component="span"
                        sx={(theme: Theme) => ({
                          flexShrink: 0,
                          fontSize: '0.8125rem',
                          fontWeight: 700,
                          px: 1,
                          py: 0.25,
                          borderRadius: 999,
                          color: 'primary.main',
                          bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'light' ? 0.1 : 0.16),
                          whiteSpace: 'nowrap',
                        })}
                      >
                        {c.allotted} {c.allotted === 1 ? 'seat' : 'seats'}
                      </Box>
                    </Box>
                    {(c.minRank != null && c.maxRank != null) || c.avgScore != null ? (
                      <Box sx={{ display: 'flex', columnGap: 2, rowGap: 0.25, mt: 0.75, flexWrap: 'wrap' }}>
                        {c.minRank != null && c.maxRank != null && (
                          <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                            Ranks {formatNumber(c.minRank)} to {formatNumber(c.maxRank)}
                          </Typography>
                        )}
                        {c.avgScore != null && (
                          <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>Average score {c.avgScore}</Typography>
                        )}
                      </Box>
                    ) : null}
                    {c.categories && (
                      <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
                        {c.categories.split(', ').map((cat) => (
                          <Box
                            component="span"
                            key={cat}
                            sx={{
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              lineHeight: 1.5,
                              px: 0.875,
                              py: 0.125,
                              borderRadius: 1,
                              border: '1px solid',
                              borderColor: 'divider',
                              color: 'text.secondary',
                            }}
                          >
                            {cat}
                          </Box>
                        ))}
                      </Box>
                    )}
                  </Box>
                ))}
              </Box>

              {filteredColleges.length === 0 && (
                <Typography sx={{ fontSize: '0.9375rem', color: 'text.secondary', textAlign: 'center', py: 3 }}>
                  No colleges match your search.
                </Typography>
              )}

              {hiddenCount > 0 && (
                <Box sx={{ textAlign: 'center', mt: 1.5 }}>
                  <Button variant="outlined" onClick={() => setShowAllColleges(true)} sx={{ minHeight: 44 }}>
                    Show {hiddenCount} more {hiddenCount === 1 ? 'college' : 'colleges'}
                  </Button>
                </Box>
              )}
            </CollapsibleSection>
          )}

          {!funnel.hasRankData && !funnel.hasAllotmentData && (
            <Alert severity="warning">No data is available for {selectedYear}. Try a different year.</Alert>
          )}
        </Box>
      )}
    </Box>
  );
}

const bodyCellSx = {
  fontSize: '0.9375rem',
  py: 1.25,
  fontVariantNumeric: 'tabular-nums',
  borderColor: 'divider',
} as const;

function HeadCell({ children, align }: { children: ReactNode; align?: 'right' }) {
  return (
    <TableCell
      align={align}
      sx={{ fontSize: '0.8125rem', fontWeight: 700, color: 'text.secondary', py: 1, borderColor: 'divider', whiteSpace: 'nowrap' }}
    >
      {children}
    </TableCell>
  );
}
