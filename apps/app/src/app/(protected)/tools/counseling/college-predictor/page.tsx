// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';
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
} from '@neram/ui';
import SchoolIcon from '@mui/icons-material/School';
import SearchIcon from '@mui/icons-material/Search';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import EventSeatIcon from '@mui/icons-material/EventSeat';
import GroupIcon from '@mui/icons-material/Group';
import { useFirebaseAuth, getFirebaseAuth } from '@neram/auth';
import { AuthGate } from '@/components/AuthGate';

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

const TIER_CONFIG = {
  safe: { label: 'Safe', color: '#2E7D32', bgColor: '#E8F5E9', chipColor: 'success' as const },
  moderate: { label: 'Moderate', color: '#E65100', bgColor: '#FFF3E0', chipColor: 'warning' as const },
  reach: { label: 'Reach', color: '#C62828', bgColor: '#FFEBEE', chipColor: 'error' as const },
};

const LEGACY_CATEGORIES = ['General', 'OBC', 'SC', 'ST', 'EWS'];

// ─── Seat Info Pill ────────────────────────────────────
function SeatPill({ filled, total, label }: { filled: number; total: number | null; label?: string }) {
  if (total === null) return <Chip label="Seat data unavailable" size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />;
  const remaining = Math.max(0, total - filled);
  const fillRatio = total > 0 ? filled / total : 0;
  const color = fillRatio >= 1 ? '#C62828' : fillRatio >= 0.8 ? '#E65100' : '#2E7D32';
  return (
    <Chip
      icon={<EventSeatIcon sx={{ fontSize: 14 }} />}
      label={`${label ? label + ': ' : ''}${remaining}/${total} seats left`}
      size="small"
      variant="outlined"
      sx={{ height: 22, fontSize: '0.65rem', fontWeight: 600, borderColor: color, color, '& .MuiChip-icon': { color } }}
    />
  );
}

// ─── College Card ────────────────────────────────────
function CollegeCard({ prediction, showCommunity }: { prediction: SeatAwarePrediction; showCommunity?: boolean }) {
  const tier = TIER_CONFIG[prediction.tier];
  return (
    <Card
      elevation={0}
      sx={{
        border: '1px solid',
        borderColor: prediction.isFull ? '#FFCDD2' : 'grey.200',
        borderLeft: `3px solid ${prediction.isFull ? '#C62828' : tier.color}`,
        borderRadius: 1,
        bgcolor: prediction.isFull ? '#FFF8F8' : 'white',
      }}
    >
      <CardContent sx={{ py: 1, px: 1.5, '&:last-child': { pb: 1 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 0.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600} noWrap>
              {prediction.collegeName || `College ${prediction.collegeCode}`}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {prediction.city || 'Unknown'} · Code: {prediction.collegeCode}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
            {prediction.isFull && (
              <Chip label="Likely Full" size="small" sx={{ height: 22, fontSize: '0.65rem', fontWeight: 600, bgcolor: '#FFCDD2', color: '#C62828' }} />
            )}
            <Chip label={tier.label} size="small" color={tier.chipColor} sx={{ height: 22, fontWeight: 600 }} />
          </Box>
        </Box>

        {/* Seat info row */}
        <Box sx={{ display: 'flex', gap: 0.75, mt: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
          {prediction.seatDataAvailable ? (
            <>
              <SeatPill filled={prediction.seatsFilledByHigherRank} total={prediction.totalSeats} />
              {showCommunity && prediction.studentCategory && (
                <SeatPill filled={prediction.categoryFilledByHigherRank} total={prediction.categorySeats} label={prediction.studentCategory} />
              )}
            </>
          ) : (
            <Chip label="Seat data unavailable" size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
          )}
        </Box>

        {/* Closing rank */}
        <Box sx={{ display: 'flex', gap: 1.5, mt: 0.25 }}>
          {prediction.closingRank && (
            <Typography variant="caption" color="text.secondary">
              Last allotted rank: <strong>{prediction.closingRank}</strong>
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            Your rank: <strong>{prediction.predictedRank}</strong>
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────
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

  // Legacy mode
  const [nataScore, setNataScore] = useState('');
  const [legacyCategory, setLegacyCategory] = useState('General');
  const [legacyState, setLegacyState] = useState('');
  const [states, setStates] = useState<string[]>([]);
  const [legacyResults, setLegacyResults] = useState<LegacyPrediction[]>([]);

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

  const categoryOptions = selectedSystem
    ? selectedSystem.categories.map((c) => ({ value: c.code, label: c.code }))
    : [];

  const generalTierCounts = {
    safe: generalPredictions.filter((r) => r.tier === 'safe').length,
    moderate: generalPredictions.filter((r) => r.tier === 'moderate').length,
    reach: generalPredictions.filter((r) => r.tier === 'reach').length,
  };

  const hasResults = generalPredictions.length > 0 || communityPredictions.length > 0;

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
                    <Chip key={t} label={`${TIER_CONFIG[t].label}: ${generalTierCounts[t]}`}
                      sx={{ bgcolor: TIER_CONFIG[t].bgColor, color: TIER_CONFIG[t].color, fontWeight: 600, fontSize: '0.8rem' }} />
                  ))}
                  {seatDataAvailable && (
                    <Chip icon={<EventSeatIcon sx={{ fontSize: 14 }} />} label="Seat data available" size="small" color="info" variant="outlined" />
                  )}
                </Box>

                {/* Tabs: General + Community */}
                {communityPredictions.length > 0 ? (
                  <>
                    <Tabs
                      value={resultTab}
                      onChange={(_, v) => setResultTab(v)}
                      variant="fullWidth"
                      sx={{
                        mb: 1.5,
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

                    {/* Tab Content */}
                    {resultTab === 0 ? (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {generalPredictions.map((p) => (
                          <CollegeCard key={`g-${p.collegeCode}`} prediction={p} />
                        ))}
                      </Box>
                    ) : (
                      <Box>
                        <Alert severity="info" sx={{ mb: 1.5, py: 0.25 }}>
                          <Typography variant="caption">
                            These colleges have <strong>{category}</strong> reserved seats available.
                            Even if general seats are full, you may get admission through community quota.
                          </Typography>
                        </Alert>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          {communityPredictions.map((p) => (
                            <CollegeCard key={`c-${p.collegeCode}`} prediction={p} showCommunity />
                          ))}
                        </Box>
                      </Box>
                    )}
                  </>
                ) : (
                  /* No community tab — just show general */
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {generalPredictions.map((p) => (
                      <CollegeCard key={`g-${p.collegeCode}`} prediction={p} />
                    ))}
                  </Box>
                )}
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
