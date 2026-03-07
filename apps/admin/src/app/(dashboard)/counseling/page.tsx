// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Alert,
  Skeleton,
  TextField,
  MenuItem,
  Chip,
  IconButton,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Collapse,
  LinearProgress,
} from '@neram/ui';
import GavelIcon from '@mui/icons-material/Gavel';
import RefreshIcon from '@mui/icons-material/Refresh';
import SchoolIcon from '@mui/icons-material/School';
import BarChartIcon from '@mui/icons-material/BarChart';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import AssignmentIcon from '@mui/icons-material/Assignment';
import HistoryIcon from '@mui/icons-material/History';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';

interface CounselingSystem {
  id: string;
  code: string;
  name: string;
  short_name: string | null;
  state: string;
  is_active: boolean;
}

interface Stats {
  totalColleges: number;
  totalCutoffRecords: number;
  totalRankListEntries: number;
  totalAllotmentEntries: number;
  availableYears: number[];
}

interface YearSummary {
  year: number;
  totalEntries: number;
}

interface UnifiedYearData {
  year: number;
  rankListEntries: number;
  allotmentEntries: number;
}

interface CommunityStatRow {
  community: string;
  count: number;
  minRank: number;
  maxRank: number;
  avgScore: number;
  minScore: number;
  maxScore: number;
}

function StatCard({
  title,
  value,
  icon,
  color,
  loading,
  onClick,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  loading: boolean;
  onClick?: () => void;
}) {
  return (
    <Paper
      elevation={0}
      onClick={onClick}
      sx={{
        p: 1.5,
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'grey.200',
        flex: 1,
        minWidth: 140,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.2s',
        '&:hover': onClick ? { borderColor: color } : {},
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: 1,
            bgcolor: `${color}14`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" noWrap>
            {title}
          </Typography>
          {loading ? (
            <Skeleton width={50} height={28} />
          ) : (
            <Typography variant="h6" fontWeight={700} sx={{ color, lineHeight: 1.2 }}>
              {typeof value === 'number' ? value.toLocaleString() : value}
            </Typography>
          )}
        </Box>
      </Box>
    </Paper>
  );
}

/** Determine which tools a year's data powers */
function getToolsForYear(yd: UnifiedYearData): { label: string; color: string }[] {
  const tools: { label: string; color: string }[] = [];
  if (yd.rankListEntries > 0 || yd.allotmentEntries > 0) {
    tools.push({ label: 'Rank Predictor', color: '#E65100' });
  }
  if (yd.allotmentEntries > 0) {
    tools.push({ label: 'College Predictor', color: '#6A1B9A' });
  }
  return tools;
}

/** Expandable year row with unified data columns */
function UnifiedYearRow({
  yearData,
  systemId,
  isOpen,
  onToggle,
}: {
  yearData: UnifiedYearData;
  systemId: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const [communityStats, setCommunityStats] = useState<CommunityStatRow[]>([]);
  const [dataSourceLabel, setDataSourceLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (isOpen && !fetched) {
      setLoading(true);
      // Use rank list community stats if available, otherwise allotment
      const action = yearData.rankListEntries > 0
        ? 'rank-list-community-stats'
        : 'allotment-community-stats';
      const sourceLabel = yearData.rankListEntries > 0
        ? 'Rank List'
        : 'Allotment Data';

      fetch(`/api/counseling/data?action=${action}&systemId=${systemId}&year=${yearData.year}`)
        .then((res) => res.json())
        .then((data) => {
          setCommunityStats(data.stats || []);
          setDataSourceLabel(sourceLabel);
          setFetched(true);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [isOpen, fetched, systemId, yearData]);

  const totalEntries = yearData.rankListEntries + yearData.allotmentEntries;
  const tools = getToolsForYear(yearData);

  return (
    <>
      <TableRow
        hover
        onClick={onToggle}
        sx={{ cursor: 'pointer', '& > *': { borderBottom: isOpen ? 'none !important' : undefined } }}
      >
        <TableCell sx={{ width: 40, px: 1 }}>
          <IconButton size="small">
            {isOpen ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell>
          <Typography variant="body2" fontWeight={600}>{yearData.year}</Typography>
        </TableCell>
        <TableCell align="center">
          {yearData.rankListEntries > 0 ? (
            <Chip
              label={yearData.rankListEntries.toLocaleString()}
              size="small"
              sx={{ bgcolor: '#FFF3E0', color: '#E65100', fontWeight: 600, fontSize: '0.75rem', height: 24 }}
            />
          ) : (
            <Typography variant="body2" color="text.disabled">--</Typography>
          )}
        </TableCell>
        <TableCell align="center">
          {yearData.allotmentEntries > 0 ? (
            <Chip
              label={yearData.allotmentEntries.toLocaleString()}
              size="small"
              sx={{ bgcolor: '#F3E5F5', color: '#6A1B9A', fontWeight: 600, fontSize: '0.75rem', height: 24 }}
            />
          ) : (
            <Typography variant="body2" color="text.disabled">--</Typography>
          )}
        </TableCell>
        <TableCell>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {tools.map((t) => (
              <Chip
                key={t.label}
                label={t.label}
                size="small"
                variant="outlined"
                sx={{ fontSize: '0.65rem', height: 20, borderColor: t.color, color: t.color }}
              />
            ))}
          </Box>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={5} sx={{ py: 0, px: 0 }}>
          <Collapse in={isOpen} timeout="auto" unmountOnExit>
            <Box sx={{ px: 2, py: 1.5, bgcolor: 'grey.50' }}>
              {loading ? (
                <Box sx={{ py: 2 }}><LinearProgress /></Box>
              ) : communityStats.length > 0 ? (
                <>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                    Community breakdown from {dataSourceLabel} ({totalEntries.toLocaleString()} total entries)
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {communityStats.map((cs) => {
                      const total = communityStats.reduce((s, c) => s + c.count, 0);
                      const pct = total > 0 ? ((cs.count / total) * 100).toFixed(1) : '0';
                      return (
                        <Paper
                          key={cs.community}
                          variant="outlined"
                          sx={{ px: 1.5, py: 1, borderRadius: 1, minWidth: 130 }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                            <Chip label={cs.community} size="small" variant="outlined" sx={{ fontWeight: 600, height: 22, fontSize: '0.75rem' }} />
                            <Typography variant="caption" color="text.secondary">{pct}%</Typography>
                          </Box>
                          <Typography variant="body2" fontWeight={700}>{cs.count.toLocaleString()}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            Rank {cs.minRank}--{cs.maxRank} · Avg {cs.avgScore}
                          </Typography>
                        </Paper>
                      );
                    })}
                  </Box>
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No community data for {yearData.year}.
                </Typography>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

export default function CounselingDashboard() {
  const router = useRouter();
  const [systems, setSystems] = useState<CounselingSystem[]>([]);
  const [selectedSystem, setSelectedSystem] = useState<string>('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Unified year-wise data
  const [unifiedYears, setUnifiedYears] = useState<UnifiedYearData[]>([]);
  const [expandedYear, setExpandedYear] = useState<number | null>(null);

  const fetchSystems = useCallback(async () => {
    try {
      const res = await fetch('/api/counseling?action=systems');
      if (!res.ok) throw new Error('Failed to fetch systems');
      const data = await res.json();
      setSystems(data.systems || []);
      if (data.systems?.length > 0 && !selectedSystem) {
        setSelectedSystem(data.systems[0].id);
      }
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!selectedSystem) return;
    setLoading(true);
    setError('');
    try {
      const [statsRes, rankYearRes, allotmentYearRes] = await Promise.all([
        fetch(`/api/counseling?action=stats&systemId=${selectedSystem}`),
        fetch(`/api/counseling/data?action=rank-list-year-summary&systemId=${selectedSystem}`),
        fetch(`/api/counseling/data?action=allotment-year-summary&systemId=${selectedSystem}`),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.stats);
      }

      // Merge rank list and allotment year summaries
      const rankYears: YearSummary[] = rankYearRes.ok ? (await rankYearRes.json()).summary || [] : [];
      const allotmentYears: YearSummary[] = allotmentYearRes.ok ? (await allotmentYearRes.json()).summary || [] : [];

      const yearMap = new Map<number, UnifiedYearData>();
      for (const ry of rankYears) {
        yearMap.set(ry.year, {
          year: ry.year,
          rankListEntries: ry.totalEntries,
          allotmentEntries: 0,
        });
      }
      for (const ay of allotmentYears) {
        const existing = yearMap.get(ay.year);
        if (existing) {
          existing.allotmentEntries = ay.totalEntries;
        } else {
          yearMap.set(ay.year, {
            year: ay.year,
            rankListEntries: 0,
            allotmentEntries: ay.totalEntries,
          });
        }
      }

      const merged = [...yearMap.values()].sort((a, b) => b.year - a.year);
      setUnifiedYears(merged);

      if (merged.length > 0) {
        setExpandedYear(merged[0].year);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedSystem]);

  useEffect(() => {
    fetchSystems();
  }, [fetchSystems]);

  useEffect(() => {
    if (selectedSystem) fetchData();
  }, [selectedSystem, fetchData]);

  const selectedSystemData = systems.find((s) => s.id === selectedSystem);

  const actionCards = [
    { label: 'Rank Lists', desc: 'Upload CSV rank list data', icon: <UploadFileIcon sx={{ color: '#E65100', fontSize: 18 }} />, color: '#E65100', href: '/counseling/rank-lists' },
    { label: 'Allotments', desc: 'Upload CSV allotment data', icon: <UploadFileIcon sx={{ color: '#6A1B9A', fontSize: 18 }} />, color: '#6A1B9A', href: '/counseling/allotment-lists' },
    { label: 'Cutoffs', desc: 'Upload CSV cutoff marks', icon: <UploadFileIcon sx={{ color: '#2E7D32', fontSize: 18 }} />, color: '#2E7D32', href: '/counseling/cutoffs' },
    { label: 'Audit Log', desc: 'View data change history', icon: <HistoryIcon sx={{ color: '#5E35B1', fontSize: 18 }} />, color: '#5E35B1', href: '/counseling/audit-log' },
  ];

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 42,
              height: 42,
              borderRadius: 1,
              bgcolor: '#5E35B1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <GavelIcon sx={{ color: 'white', fontSize: 22 }} />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.2 }}>
              Counseling Intelligence
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Manage counseling systems, cutoffs, rank lists, and allotments
            </Typography>
          </Box>
        </Box>
        <Tooltip title="Refresh">
          <span>
            <IconButton size="small" onClick={fetchData} disabled={loading}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* System Selector + Stats */}
      <Paper
        elevation={0}
        sx={{ p: 2, mb: 2, borderRadius: 1, border: '1px solid', borderColor: 'grey.200' }}
      >
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
          <TextField
            select
            size="small"
            label="Counseling System"
            value={selectedSystem}
            onChange={(e) => {
              setSelectedSystem(e.target.value);
              setExpandedYear(null);
              setUnifiedYears([]);
            }}
            sx={{ minWidth: 280 }}
          >
            {systems.map((sys) => (
              <MenuItem key={sys.id} value={sys.id}>
                {sys.name}
              </MenuItem>
            ))}
          </TextField>
          {selectedSystemData && (
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Chip label={selectedSystemData.state} size="small" variant="outlined" />
              <Chip
                label={selectedSystemData.is_active ? 'Active' : 'Inactive'}
                size="small"
                color={selectedSystemData.is_active ? 'success' : 'default'}
              />
            </Box>
          )}
        </Box>

        {/* Stats inline */}
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <StatCard
            title="Colleges"
            value={stats?.totalColleges || 0}
            icon={<SchoolIcon sx={{ color: '#1565C0', fontSize: 18 }} />}
            color="#1565C0"
            loading={loading}
          />
          <StatCard
            title="Cutoffs"
            value={stats?.totalCutoffRecords || 0}
            icon={<BarChartIcon sx={{ color: '#2E7D32', fontSize: 18 }} />}
            color="#2E7D32"
            loading={loading}
            onClick={() => router.push('/counseling/cutoffs')}
          />
          <StatCard
            title="Rank List"
            value={stats?.totalRankListEntries || 0}
            icon={<FormatListNumberedIcon sx={{ color: '#E65100', fontSize: 18 }} />}
            color="#E65100"
            loading={loading}
            onClick={() => router.push('/counseling/rank-lists')}
          />
          <StatCard
            title="Allotments"
            value={stats?.totalAllotmentEntries || 0}
            icon={<AssignmentIcon sx={{ color: '#6A1B9A', fontSize: 18 }} />}
            color="#6A1B9A"
            loading={loading}
            onClick={() => router.push('/counseling/allotment-lists')}
          />
        </Box>
      </Paper>

      {/* Tools Impact Info */}
      <Paper
        elevation={0}
        sx={{ p: 1.5, mb: 2, borderRadius: 1, border: '1px solid', borderColor: 'grey.200', bgcolor: '#FAFAFA' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <InfoOutlinedIcon sx={{ color: 'text.secondary', fontSize: 18, mt: 0.2 }} />
          <Box>
            <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              How data powers student tools
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Typography variant="caption" color="text.secondary">
                <Box component="span" sx={{ color: '#E65100', fontWeight: 600 }}>Rank List</Box> → Rank Predictor (primary)
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <Box component="span" sx={{ color: '#6A1B9A', fontWeight: 600 }}>Allotment</Box> → Rank Predictor (fallback) + College Predictor (allotment history)
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <Box component="span" sx={{ color: '#2E7D32', fontWeight: 600 }}>Cutoffs</Box> → College Predictor (cutoff-based)
              </Typography>
            </Box>
          </Box>
        </Box>
      </Paper>

      {/* Unified Year-wise Data Table */}
      {unifiedYears.length > 0 && (
        <Paper
          elevation={0}
          sx={{ mb: 2, borderRadius: 1, border: '1px solid', borderColor: 'grey.200', overflow: 'hidden' }}
        >
          <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'grey.100', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle2" fontWeight={600}>
                Year-wise Data Overview
              </Typography>
              {selectedSystemData && (
                <Chip
                  label={selectedSystemData.short_name || selectedSystemData.name}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: '0.7rem', height: 22 }}
                />
              )}
            </Box>
            <Typography variant="caption" color="text.secondary">
              Click a year to see category breakdown
            </Typography>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 40, px: 1 }} />
                  <TableCell sx={{ fontWeight: 600 }}>Year</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#E65100' }} align="center">Rank List</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#6A1B9A' }} align="center">Allotment</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Used By</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {unifiedYears.map((yd) => (
                  <UnifiedYearRow
                    key={yd.year}
                    yearData={yd}
                    systemId={selectedSystem}
                    isOpen={expandedYear === yd.year}
                    onToggle={() => setExpandedYear(expandedYear === yd.year ? null : yd.year)}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Quick Actions */}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        {actionCards.map((ac) => (
          <Paper
            key={ac.label}
            elevation={0}
            sx={{
              p: 1.5,
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'grey.200',
              flex: 1,
              minWidth: 180,
              cursor: 'pointer',
              transition: 'border-color 0.2s',
              '&:hover': { borderColor: ac.color },
            }}
            onClick={() => router.push(ac.href)}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              {ac.icon}
              <Typography variant="body2" fontWeight={600}>{ac.label}</Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">{ac.desc}</Typography>
          </Paper>
        ))}
      </Box>
    </Box>
  );
}
