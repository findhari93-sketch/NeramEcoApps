// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Button,
  Alert,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useTheme,
  useMediaQuery,
  Card,
  CardContent,
  Grid,
  Tooltip,
} from '@neram/ui';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import SchoolIcon from '@mui/icons-material/School';
import PeopleIcon from '@mui/icons-material/People';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { AuthGate } from '@/components/AuthGate';
import { useFirebaseAuth, getFirebaseAuth } from '@neram/auth';

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

interface SimilarStudent {
  rank: number;
  aggregate_mark: number;
  community: string;
  community_rank: number | null;
}

export default function CounselingRankPredictorPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const searchParams = useSearchParams();
  const { user } = useFirebaseAuth();

  // Systems
  const [systems, setSystems] = useState<CounselingSystem[]>([]);
  const [loadingSystems, setLoadingSystems] = useState(true);
  const [selectedSystemCode, setSelectedSystemCode] = useState('');

  // Input
  const [compositeScore, setCompositeScore] = useState(searchParams.get('score') || '');
  const [category, setCategory] = useState(searchParams.get('category') || '');
  const [selectedYear, setSelectedYear] = useState<number | ''>('');

  // Results
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [similarStudents, setSimilarStudents] = useState<SimilarStudent[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [communityStats, setCommunityStats] = useState<{ community: string; count: number; avgScore: number }[]>([]);
  const [communityTotal, setCommunityTotal] = useState(0);
  const [allotmentCount, setAllotmentCount] = useState(0);

  const selectedSystem = systems.find((s) => s.code === selectedSystemCode) || null;
  const hasData = availableYears.length > 0;
  const hasResults = prediction !== null;

  // Fetch systems on mount
  useEffect(() => {
    async function fetchSystems() {
      try {
        const res = await fetch('/api/tools/rank-predictor');
        const data = await res.json();
        const allSystems: CounselingSystem[] = data.systems || [];
        setSystems(allSystems);

        const systemParam = searchParams.get('system');
        const match = systemParam
          ? allSystems.find((s) => s.code === systemParam)
          : allSystems.find((s) => s.is_active);
        if (match) setSelectedSystemCode(match.code);
      } catch {
        // ignore
      } finally {
        setLoadingSystems(false);
      }
    }
    fetchSystems();
  }, []);

  // Fetch years when system changes
  useEffect(() => {
    if (!selectedSystem) return;
    setAvailableYears([]);
    setSelectedYear('');
    async function fetchYears() {
      try {
        const res = await fetch(`/api/tools/rank-predictor?action=years&systemId=${selectedSystem!.id}`);
        const data = await res.json();
        const years = data.years || [];
        setAvailableYears(years);
        if (years.length > 0) setSelectedYear(years[0]);
        // Set community stats from the response
        if (data.communityStats) {
          setCommunityStats(data.communityStats);
          setCommunityTotal(data.communityStats.reduce((sum: number, s: any) => sum + s.count, 0));
        }
        setAllotmentCount(data.allotmentCount || 0);
      } catch {
        setAvailableYears([]);
      }
    }
    fetchYears();
  }, [selectedSystemCode]);

  const handlePredict = useCallback(async () => {
    if (!selectedSystem) return;
    const score = parseFloat(compositeScore);
    const maxScore = selectedSystem.merit_formula.total_marks;
    if (isNaN(score) || score < 0 || score > maxScore) {
      setError(`Enter a valid score between 0 and ${maxScore}`);
      return;
    }
    setLoading(true);
    setError('');
    setPrediction(null);
    setSimilarStudents([]);
    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setError('Please sign in to use rank predictor');
        setLoading(false);
        return;
      }
      const token = await currentUser.getIdToken();
      const res = await fetch('/api/tools/rank-predictor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          systemCode: selectedSystem.code,
          compositeScore: score,
          category: category || undefined,
          year: selectedYear || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Prediction failed');
      setPrediction(data.prediction);
      setSimilarStudents(data.similarStudents || []);
      if (data.availableYears?.length > 0) setAvailableYears(data.availableYears);
    } catch (err: any) {
      setError(err.message || 'Failed to predict rank');
    } finally {
      setLoading(false);
    }
  }, [compositeScore, category, selectedYear, selectedSystem]);

  // Dynamic category options
  const categoryOptions = selectedSystem
    ? [{ value: '', label: 'All Categories' }, ...selectedSystem.categories.map((c) => ({ value: c.code, label: c.code }))]
    : [];

  const formulaSummary = selectedSystem
    ? selectedSystem.merit_formula.components.map((c) => `${c.name}(${c.max_marks})`).join(' + ')
    : '';

  return (
    <Box sx={{ maxWidth: 700, mx: 'auto', pb: 4, overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <Box sx={{ width: 40, height: 40, borderRadius: 1.5, bgcolor: '#E65100', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <TrendingUpIcon sx={{ color: 'white', fontSize: 22 }} />
        </Box>
        <Box>
          <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2 }}>Rank Predictor</Typography>
          <Typography variant="caption" color="text.secondary">Predict your counseling rank from your composite score</Typography>
        </Box>
      </Box>

      {/* Compact Form */}
      <Paper elevation={0} sx={{ p: isMobile ? 2 : 2.5, mb: 2, borderRadius: 2, border: '1px solid', borderColor: 'grey.200' }}>
        {/* Row 1: System + Score */}
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
          <FormControl size="small" sx={{ minWidth: 200, flex: 1 }}>
            <InputLabel>Counseling System</InputLabel>
            <Select
              value={selectedSystemCode}
              onChange={(e) => {
                setSelectedSystemCode(e.target.value);
                setCategory('');
                setPrediction(null);
                setSimilarStudents([]);
              }}
              label="Counseling System"
            >
              {systems.map((sys) => (
                <MenuItem key={sys.code} value={sys.code} disabled={!sys.is_active}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                    <span>{sys.name}</span>
                    {!sys.is_active && (
                      <Chip label="Soon" size="small" sx={{ height: 18, fontSize: '0.6rem', ml: 'auto' }} />
                    )}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            size="small"
            label={selectedSystem ? `Score (out of ${selectedSystem.merit_formula.total_marks})` : 'Composite Score'}
            type="number"
            value={compositeScore}
            onChange={(e) => setCompositeScore(e.target.value)}
            inputProps={{ min: 0, max: selectedSystem?.merit_formula.total_marks || 400, step: 0.01 }}
            sx={{ flex: 1, minWidth: 160 }}
            disabled={!hasData}
          />
        </Box>

        {/* Row 2: Category + Year + Button */}
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <FormControl size="small" sx={{ minWidth: 140, flex: 1 }}>
            <InputLabel>Category</InputLabel>
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              label="Category"
              disabled={!hasData || !selectedSystem}
            >
              {categoryOptions.map((cat) => (
                <MenuItem key={cat.value} value={cat.value}>{cat.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {availableYears.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 90 }}>
              <InputLabel>Year</InputLabel>
              <Select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value as number)} label="Year">
                {availableYears.map((y) => (
                  <MenuItem key={y} value={y}>{y}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <Button
            variant="contained"
            onClick={handlePredict}
            disabled={loading || !compositeScore || !hasData || !selectedSystem}
            startIcon={loading ? <CircularProgress size={16} /> : <TrendingUpIcon sx={{ fontSize: 18 }} />}
            sx={{ py: 0.9, px: 2.5, bgcolor: '#E65100', '&:hover': { bgcolor: '#BF360C' }, whiteSpace: 'nowrap' }}
          >
            {loading ? 'Predicting...' : 'Predict Rank'}
          </Button>
        </Box>

        {/* Helper text */}
        {selectedSystem && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            {formulaSummary} = {selectedSystem.merit_formula.total_marks}
            {!hasData && ' · Data not available yet — coming soon'}
          </Typography>
        )}
      </Paper>

      {/* Community Stats Summary */}
      {communityStats.length > 0 && selectedYear && !hasResults && (
        <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 2, border: '1px solid', borderColor: 'grey.100', bgcolor: 'grey.50' }}>
          <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
            Based on {selectedYear} data: {communityTotal.toLocaleString()} applied{allotmentCount > 0 ? ` · ${allotmentCount.toLocaleString()} got seats` : ''}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            {communityStats.map((cs) => (
              <Chip
                key={cs.community}
                label={`${cs.community}: ${cs.count.toLocaleString()}`}
                size="small"
                variant="outlined"
                sx={{ fontSize: '0.7rem' }}
              />
            ))}
          </Box>
        </Paper>
      )}

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 1.5 }}>{error}</Alert>}

      {/* Results */}
      {hasResults && selectedSystem && (
        <AuthGate
          hasData={hasResults}
          title="Sign up to see your predicted rank"
          description="Create a free account to view your rank prediction."
          pendingData={{ compositeScore, category, selectedYear }}
        >
          <Box>
            {/* Compact result cards */}
            <Box sx={{ display: 'flex', gap: 1.5, mb: 2, overflowX: 'auto', pb: 0.5, flexWrap: { xs: 'nowrap', sm: 'wrap' } }}>
              {/* Overall Rank */}
              <Paper
                elevation={0}
                sx={{ flex: 1, minWidth: 140, p: 1.5, borderRadius: 1.5, border: '2px solid', borderColor: '#E65100', textAlign: 'center' }}
              >
                <Typography variant="caption" color="text.secondary">Overall Rank</Typography>
                {prediction?.predictedRank ? (
                  <Typography variant="h5" fontWeight={700} color="#E65100" sx={{ lineHeight: 1.2, my: 0.25 }}>
                    {prediction.predictedRank.min === prediction.predictedRank.max
                      ? prediction.predictedRank.min
                      : `${prediction.predictedRank.min}–${prediction.predictedRank.max}`}
                  </Typography>
                ) : (
                  <Typography variant="h6" color="text.secondary">—</Typography>
                )}
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                  of {prediction?.totalCandidates?.toLocaleString() || '?'}
                </Typography>
              </Paper>

              {/* Category Rank */}
              {category && (
                <Paper
                  elevation={0}
                  sx={{ flex: 1, minWidth: 140, p: 1.5, borderRadius: 1.5, border: '1px solid', borderColor: 'grey.200', textAlign: 'center' }}
                >
                  <Typography variant="caption" color="text.secondary">
                    {category} Rank
                  </Typography>
                  {prediction?.categoryRank ? (
                    <Typography variant="h5" fontWeight={700} color="#1565C0" sx={{ lineHeight: 1.2, my: 0.25 }}>
                      {prediction.categoryRank.min === prediction.categoryRank.max
                        ? prediction.categoryRank.min
                        : `${prediction.categoryRank.min}–${prediction.categoryRank.max}`}
                    </Typography>
                  ) : (
                    <Typography variant="h6" color="text.secondary">—</Typography>
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                    within {category}
                  </Typography>
                </Paper>
              )}

              {/* Better Than */}
              <Tooltip title="Your predicted score is better than this percentage of all candidates" arrow placement="top">
                <Paper
                  elevation={0}
                  sx={{ flex: 1, minWidth: 100, p: 1.5, borderRadius: 1.5, border: '1px solid', borderColor: 'grey.200', textAlign: 'center', cursor: 'help' }}
                >
                  <Typography variant="caption" color="text.secondary">Better Than</Typography>
                  {prediction?.percentile != null ? (
                    <Typography variant="h5" fontWeight={700} color="#2E7D32" sx={{ lineHeight: 1.2, my: 0.25 }}>
                      {prediction.percentile.toFixed(1)}%
                    </Typography>
                  ) : (
                    <Typography variant="h6" color="text.secondary">—</Typography>
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                    of students
                  </Typography>
                </Paper>
              </Tooltip>

              {/* Accuracy */}
              <Tooltip title="Students with scores within ±5 marks of yours, used to predict your rank" arrow placement="top">
                <Paper
                  elevation={0}
                  sx={{ flex: 1, minWidth: 100, p: 1.5, borderRadius: 1.5, border: '1px solid', borderColor: 'grey.200', textAlign: 'center', cursor: 'help' }}
                >
                  <Typography variant="caption" color="text.secondary">Accuracy</Typography>
                  <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.2, my: 0.25 }}>
                    {prediction?.matchedEntries || 0}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>nearby students</Typography>
                </Paper>
              </Tooltip>
            </Box>

            {prediction?.predictedRank && (
              <Alert severity="info" sx={{ mb: 2, borderRadius: 1.5, py: 0.5 }} icon={false}>
                <Typography variant="caption">
                  Based on {prediction.dataSourceLabel || `${selectedYear || 'latest'} data`}. Actual ranks may vary.
                </Typography>
              </Alert>
            )}

            {/* Similar Students */}
            {similarStudents.length > 0 && (() => {
              const hasCollegeData = similarStudents.some((s: any) => s.college_name);
              const hasNameData = similarStudents.some((s: any) => s.candidate_name);
              const hasCommRank = similarStudents.some((s: any) => s.community_rank != null);
              return (
              <Paper elevation={0} sx={{ mb: 2, borderRadius: 1.5, border: '1px solid', borderColor: 'grey.200', overflow: 'hidden' }}>
                <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'grey.100', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <PeopleIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="caption" fontWeight={600}>Similar Students (±5 marks)</Typography>
                </Box>
                <TableContainer sx={{ maxHeight: 280, overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600, py: 0.75 }}>Rank</TableCell>
                        {hasNameData && (
                          <TableCell sx={{ fontWeight: 600, py: 0.75 }}>Name</TableCell>
                        )}
                        <TableCell sx={{ fontWeight: 600, py: 0.75 }} align="right">Score</TableCell>
                        <TableCell sx={{ fontWeight: 600, py: 0.75 }}>Community</TableCell>
                        {hasCommRank && (
                          <TableCell sx={{ fontWeight: 600, py: 0.75 }}>Comm. Rank</TableCell>
                        )}
                        {hasCollegeData && (
                          <TableCell sx={{ fontWeight: 600, py: 0.75 }}>Allotted College</TableCell>
                        )}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {similarStudents.map((s: any, i: number) => (
                        <TableRow key={i} sx={{ bgcolor: Math.abs(s.aggregate_mark - parseFloat(compositeScore)) < 1 ? 'action.selected' : 'inherit' }}>
                          <TableCell sx={{ py: 0.5 }}><strong>{s.rank}</strong></TableCell>
                          {hasNameData && (
                            <TableCell sx={{ py: 0.5, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
                                {s.candidate_name || '–'}
                              </Typography>
                            </TableCell>
                          )}
                          <TableCell sx={{ py: 0.5 }} align="right">{s.aggregate_mark}</TableCell>
                          <TableCell sx={{ py: 0.5 }}><Chip label={s.community} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} /></TableCell>
                          {hasCommRank && (
                            <TableCell sx={{ py: 0.5 }}>{s.community_rank ?? '–'}</TableCell>
                          )}
                          {hasCollegeData && (
                            <TableCell sx={{ py: 0.5, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <Tooltip title={s.college_name || ''} arrow placement="top">
                                <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
                                  {s.college_name || '–'}
                                </Typography>
                              </Tooltip>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
              );
            })()}

            {/* CTA to College Predictor */}
            {prediction?.predictedRank && (
              <Paper
                elevation={0}
                sx={{ p: 2, borderRadius: 1.5, border: '1px solid', borderColor: '#1565C0', bgcolor: '#E3F2FD', textAlign: 'center' }}
              >
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
                  Find colleges for rank {prediction.predictedRank.min}–{prediction.predictedRank.max}
                </Typography>
                <Button
                  size="small"
                  variant="contained"
                  endIcon={<ArrowForwardIcon sx={{ fontSize: 16 }} />}
                  href={`/tools/counseling/college-predictor?system=${selectedSystem.code}&score=${compositeScore}&rank=${prediction.predictedRank.min}&year=${selectedYear}${category ? `&category=${category}` : ''}`}
                  sx={{ bgcolor: '#1565C0', '&:hover': { bgcolor: '#0D47A1' } }}
                >
                  College Predictor
                </Button>
              </Paper>
            )}
          </Box>
        </AuthGate>
      )}

      {/* Help text when no results */}
      {!hasResults && !loading && selectedSystem && hasData && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 1 }}>
          Enter your composite score ({formulaSummary}) and click Predict Rank.
        </Typography>
      )}
    </Box>
  );
}
