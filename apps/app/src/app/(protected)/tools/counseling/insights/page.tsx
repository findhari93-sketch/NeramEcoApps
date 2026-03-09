// @ts-nocheck
'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  TextField,
  InputAdornment,
  LinearProgress,
  Collapse,
  IconButton,
  useTheme,
  useMediaQuery,
} from '@neram/ui';
import InsightsIcon from '@mui/icons-material/Insights';
import PeopleIcon from '@mui/icons-material/People';
import SchoolIcon from '@mui/icons-material/School';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { useFirebaseAuth } from '@neram/auth';
import { AuthGate } from '@/components/AuthGate';

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

// ─── Helpers ──────────────────────────────────────────────

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-IN').format(n);
}

function getConversionColor(rate: number | null): string {
  if (rate == null) return '#9E9E9E';
  if (rate >= 50) return '#2E7D32';
  if (rate >= 30) return '#E65100';
  return '#C62828';
}

// ─── Page ──────────────────────────────────────────────

export default function CounselingInsightsPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { user } = useFirebaseAuth();

  // State
  const [systems, setSystems] = useState<CounselingSystem[]>([]);
  const [selectedSystemId, setSelectedSystemId] = useState('');
  const [yearsWithSource, setYearsWithSource] = useState<YearWithSource[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSystems, setLoadingSystems] = useState(true);

  // Data
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [rankCommunity, setRankCommunity] = useState<CommunityStat[]>([]);
  const [allotmentCommunity, setAllotmentCommunity] = useState<CommunityStat[]>([]);
  const [colleges, setColleges] = useState<CollegeStat[]>([]);

  // UI
  const [collegeSearch, setCollegeSearch] = useState('');
  const [showAllColleges, setShowAllColleges] = useState(false);
  const [communityOpen, setCommunityOpen] = useState(true);
  const [collegesOpen, setCollegesOpen] = useState(true);

  // Fetch systems on mount
  useEffect(() => {
    fetch('/api/tools/counseling-insights')
      .then((res) => res.json())
      .then((data) => {
        const allSystems: CounselingSystem[] = data.systems || [];
        setSystems(allSystems);
        const active = allSystems.find((s) => s.is_active);
        if (active) setSelectedSystemId(active.id);
      })
      .catch(() => {})
      .finally(() => setLoadingSystems(false));
  }, []);

  // Fetch years when system changes
  useEffect(() => {
    if (!selectedSystemId) return;
    setYearsWithSource([]);
    setSelectedYear(null);
    setFunnel(null);
    fetch(`/api/tools/counseling-insights?systemId=${selectedSystemId}`)
      .then((res) => res.json())
      .then((data) => {
        const yws: YearWithSource[] = data.yearsWithSource || [];
        setYearsWithSource(yws);
        if (yws.length > 0) setSelectedYear(yws[0].year);
      })
      .catch(() => {});
  }, [selectedSystemId]);

  // Fetch insights when year changes
  useEffect(() => {
    if (!selectedSystemId || !selectedYear) return;
    setLoading(true);
    fetch(`/api/tools/counseling-insights?systemId=${selectedSystemId}&year=${selectedYear}`)
      .then((res) => res.json())
      .then((data) => {
        setFunnel(data.funnel || null);
        setRankCommunity(data.communityBreakdown?.rankList || []);
        setAllotmentCommunity(data.communityBreakdown?.allotment || []);
        setColleges(data.colleges || []);
        setCollegeSearch('');
        setShowAllColleges(false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedSystemId, selectedYear]);

  // Filtered colleges
  const filteredColleges = useMemo(() => {
    if (!collegeSearch.trim()) return colleges;
    const q = collegeSearch.toLowerCase();
    return colleges.filter(
      (c) =>
        c.collegeName.toLowerCase().includes(q) ||
        c.collegeCode.toLowerCase().includes(q) ||
        c.categories.toLowerCase().includes(q)
    );
  }, [colleges, collegeSearch]);

  const displayColleges = showAllColleges ? filteredColleges : filteredColleges.slice(0, 20);
  const hasMore = filteredColleges.length > 20 && !showAllColleges;

  // Merge community data (applied vs allotted)
  const communityMerged = useMemo(() => {
    const map = new Map<string, { applied: number; allotted: number }>();
    for (const r of rankCommunity) {
      map.set(r.community, { applied: r.count, allotted: 0 });
    }
    for (const a of allotmentCommunity) {
      const existing = map.get(a.community) || { applied: 0, allotted: 0 };
      existing.allotted = a.count;
      map.set(a.community, existing);
    }
    return [...map.entries()]
      .map(([community, { applied, allotted }]) => ({ community, applied, allotted }))
      .sort((a, b) => b.applied - a.applied || b.allotted - a.allotted);
  }, [rankCommunity, allotmentCommunity]);

  const selectedYearSource = yearsWithSource.find((y) => y.year === selectedYear);

  if (loadingSystems) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <InsightsIcon sx={{ color: '#1565C0', fontSize: 28 }} />
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Counseling Insights
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        Understand the counseling landscape — how many applied, how many got seats, and which colleges are most competitive.
      </Typography>

      {/* System Selector */}
      {systems.length > 1 && (
        <FormControl size="small" fullWidth sx={{ mb: 2 }}>
          <InputLabel>Counseling System</InputLabel>
          <Select
            value={selectedSystemId}
            onChange={(e) => setSelectedSystemId(e.target.value)}
            label="Counseling System"
          >
            {systems.map((s) => (
              <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {/* Year Chips */}
      {yearsWithSource.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            overflowX: 'auto',
            pb: 1,
            mb: 2.5,
            WebkitOverflowScrolling: 'touch',
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {yearsWithSource.map((yw) => (
            <Chip
              key={yw.year}
              label={yw.year}
              variant={selectedYear === yw.year ? 'filled' : 'outlined'}
              color={selectedYear === yw.year ? 'primary' : 'default'}
              onClick={() => setSelectedYear(yw.year)}
              sx={{ fontWeight: selectedYear === yw.year ? 700 : 400, minWidth: 64 }}
            />
          ))}
        </Box>
      )}

      {/* Auth gate */}
      <AuthGate
        hasData={!!selectedYear}
        pendingData={{ systemId: selectedSystemId, year: selectedYear }}
        onAuthenticated={() => {}}
        title="Sign in to view counseling insights"
        description="Create a free account to see detailed counseling statistics."
      >
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : funnel ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* ═══ FUNNEL OVERVIEW ═══ */}
            <Paper sx={{ p: 2.5, borderRadius: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2, color: '#1565C0', textTransform: 'uppercase', fontSize: 12, letterSpacing: 0.5 }}>
                Overview — {selectedYear}
              </Typography>

              <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                {/* Applied */}
                <Paper
                  variant="outlined"
                  sx={{ flex: 1, p: 2, textAlign: 'center', borderRadius: 2, bgcolor: funnel.hasRankData ? '#E3F2FD' : '#F5F5F5' }}
                >
                  <PeopleIcon sx={{ color: funnel.hasRankData ? '#1565C0' : '#9E9E9E', fontSize: 28, mb: 0.5 }} />
                  <Typography variant="h5" sx={{ fontWeight: 700, color: funnel.hasRankData ? '#0D47A1' : '#9E9E9E' }}>
                    {funnel.hasRankData ? formatNumber(funnel.totalApplicants) : '—'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Applied
                  </Typography>
                </Paper>

                {/* Allotted */}
                <Paper
                  variant="outlined"
                  sx={{ flex: 1, p: 2, textAlign: 'center', borderRadius: 2, bgcolor: funnel.hasAllotmentData ? '#E8F5E9' : '#F5F5F5' }}
                >
                  <SchoolIcon sx={{ color: funnel.hasAllotmentData ? '#2E7D32' : '#9E9E9E', fontSize: 28, mb: 0.5 }} />
                  <Typography variant="h5" sx={{ fontWeight: 700, color: funnel.hasAllotmentData ? '#1B5E20' : '#9E9E9E' }}>
                    {funnel.hasAllotmentData ? formatNumber(funnel.totalAllotted) : '—'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Got Seats
                  </Typography>
                </Paper>
              </Box>

              {/* Conversion bar */}
              {funnel.hasRankData && funnel.hasAllotmentData && funnel.conversionRate != null ? (
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">
                      Acceptance Rate
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: getConversionColor(funnel.conversionRate) }}>
                      {funnel.conversionRate}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(funnel.conversionRate, 100)}
                    sx={{
                      height: 10,
                      borderRadius: 5,
                      bgcolor: '#E0E0E0',
                      '& .MuiLinearProgress-bar': {
                        borderRadius: 5,
                        bgcolor: getConversionColor(funnel.conversionRate),
                      },
                    }}
                  />
                </Box>
              ) : (
                <Alert severity="info" sx={{ mt: 1 }}>
                  {!funnel.hasRankData
                    ? 'Rank list data not available for this year. Only allotment data is shown.'
                    : 'Allotment data not available for this year. Only applicant data is shown.'}
                </Alert>
              )}
            </Paper>

            {/* ═══ COMMUNITY BREAKDOWN ═══ */}
            {communityMerged.length > 0 && (
              <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
                <Box
                  onClick={() => setCommunityOpen(!communityOpen)}
                  sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    p: 2, cursor: 'pointer', '&:hover': { bgcolor: '#F5F5F5' },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TrendingUpIcon sx={{ color: '#E65100', fontSize: 20 }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 12, letterSpacing: 0.5, color: '#E65100' }}>
                      Community Breakdown
                    </Typography>
                    <Chip label={communityMerged.length} size="small" sx={{ height: 20, fontSize: 11 }} />
                  </Box>
                  <IconButton size="small">
                    {communityOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </IconButton>
                </Box>
                <Collapse in={communityOpen}>
                  <Box sx={{ px: 2, pb: 2 }}>
                    {/* Table header */}
                    <Box sx={{ display: 'flex', gap: 1, py: 1, borderBottom: '1px solid #E0E0E0', mb: 0.5 }}>
                      <Typography variant="caption" sx={{ flex: 2, fontWeight: 700, color: '#666' }}>Category</Typography>
                      {funnel.hasRankData && (
                        <Typography variant="caption" sx={{ flex: 1, fontWeight: 700, color: '#666', textAlign: 'right' }}>Applied</Typography>
                      )}
                      {funnel.hasAllotmentData && (
                        <Typography variant="caption" sx={{ flex: 1, fontWeight: 700, color: '#666', textAlign: 'right' }}>Joined</Typography>
                      )}
                      {funnel.hasRankData && funnel.hasAllotmentData && (
                        <Typography variant="caption" sx={{ flex: 1, fontWeight: 700, color: '#666', textAlign: 'right' }}>Rate</Typography>
                      )}
                    </Box>
                    {/* Rows */}
                    {communityMerged.map((row) => {
                      const rate = row.applied > 0 ? Math.round((row.allotted / row.applied) * 100) : null;
                      return (
                        <Box
                          key={row.community}
                          sx={{ display: 'flex', gap: 1, py: 1, borderBottom: '1px solid #F5F5F5', alignItems: 'center' }}
                        >
                          <Typography variant="body2" sx={{ flex: 2, fontWeight: 600, fontSize: 13 }}>
                            {row.community}
                          </Typography>
                          {funnel.hasRankData && (
                            <Typography variant="body2" sx={{ flex: 1, textAlign: 'right', fontSize: 13, color: '#1565C0' }}>
                              {row.applied > 0 ? formatNumber(row.applied) : '—'}
                            </Typography>
                          )}
                          {funnel.hasAllotmentData && (
                            <Typography variant="body2" sx={{ flex: 1, textAlign: 'right', fontSize: 13, color: '#2E7D32' }}>
                              {row.allotted > 0 ? formatNumber(row.allotted) : '—'}
                            </Typography>
                          )}
                          {funnel.hasRankData && funnel.hasAllotmentData && (
                            <Typography variant="body2" sx={{ flex: 1, textAlign: 'right', fontSize: 13, fontWeight: 600, color: getConversionColor(rate) }}>
                              {rate != null ? `${rate}%` : '—'}
                            </Typography>
                          )}
                        </Box>
                      );
                    })}
                  </Box>
                </Collapse>
              </Paper>
            )}

            {/* ═══ COLLEGE BREAKDOWN ═══ */}
            {colleges.length > 0 && (
              <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
                <Box
                  onClick={() => setCollegesOpen(!collegesOpen)}
                  sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    p: 2, cursor: 'pointer', '&:hover': { bgcolor: '#F5F5F5' },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <SchoolIcon sx={{ color: '#1565C0', fontSize: 20 }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 12, letterSpacing: 0.5, color: '#1565C0' }}>
                      College Breakdown
                    </Typography>
                    <Chip label={colleges.length} size="small" sx={{ height: 20, fontSize: 11 }} />
                  </Box>
                  <IconButton size="small">
                    {collegesOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </IconButton>
                </Box>
                <Collapse in={collegesOpen}>
                  <Box sx={{ px: 2, pb: 2 }}>
                    {/* Search */}
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="Search college name or code..."
                      value={collegeSearch}
                      onChange={(e) => { setCollegeSearch(e.target.value); setShowAllColleges(false); }}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon sx={{ fontSize: 18, color: '#999' }} />
                          </InputAdornment>
                        ),
                      }}
                      sx={{ mb: 1.5 }}
                    />

                    {/* College rows */}
                    {displayColleges.map((c, idx) => (
                      <Paper
                        key={`${c.collegeCode}-${idx}`}
                        variant="outlined"
                        sx={{ p: 1.5, mb: 1, borderRadius: 1.5, borderColor: '#E8E8E8' }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3 }} noWrap>
                              {c.collegeName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Code: {c.collegeCode}
                            </Typography>
                          </Box>
                          <Chip
                            label={`${c.allotted} seats`}
                            size="small"
                            sx={{ ml: 1, bgcolor: '#E3F2FD', color: '#0D47A1', fontWeight: 700, fontSize: 11, height: 22 }}
                          />
                        </Box>
                        <Box sx={{ display: 'flex', gap: 2, mt: 0.5, flexWrap: 'wrap' }}>
                          {c.minRank != null && c.maxRank != null && (
                            <Typography variant="caption" color="text.secondary">
                              Rank #{c.minRank} – #{c.maxRank}
                            </Typography>
                          )}
                          {c.avgScore != null && (
                            <Typography variant="caption" color="text.secondary">
                              Avg Score: {c.avgScore}
                            </Typography>
                          )}
                        </Box>
                        {c.categories && (
                          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.75, flexWrap: 'wrap' }}>
                            {c.categories.split(', ').map((cat) => (
                              <Chip
                                key={cat}
                                label={cat}
                                size="small"
                                variant="outlined"
                                sx={{ height: 20, fontSize: 10, borderColor: '#DDD' }}
                              />
                            ))}
                          </Box>
                        )}
                      </Paper>
                    ))}

                    {filteredColleges.length === 0 && (
                      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                        No colleges match your search.
                      </Typography>
                    )}

                    {hasMore && (
                      <Box sx={{ textAlign: 'center', mt: 1 }}>
                        <Chip
                          label={`Show ${filteredColleges.length - 20} more colleges`}
                          onClick={() => setShowAllColleges(true)}
                          sx={{ cursor: 'pointer', fontWeight: 600 }}
                        />
                      </Box>
                    )}
                  </Box>
                </Collapse>
              </Paper>
            )}

            {/* No data state */}
            {!funnel.hasRankData && !funnel.hasAllotmentData && (
              <Alert severity="warning">
                No data available for {selectedYear}. Try a different year.
              </Alert>
            )}
          </Box>
        ) : selectedYear ? (
          <Alert severity="info">Select a year to view counseling insights.</Alert>
        ) : (
          <Alert severity="info">No data available for this counseling system.</Alert>
        )}
      </AuthGate>
    </Box>
  );
}
