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
  useTheme,
  useMediaQuery,
} from '@neram/ui';
import SchoolIcon from '@mui/icons-material/School';
import SearchIcon from '@mui/icons-material/Search';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
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

interface CounselingPrediction {
  college: { id: string; name: string; slug: string; city: string; type: string; annual_fee_approx: number | null; neram_tier: string | null };
  tier: 'safe' | 'moderate' | 'reach';
  closingMark: number;
  closingRank: number | null;
  openingMark: number | null;
  gap: number;
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

export default function CounselingCollegePredictorPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const searchParams = useSearchParams();
  const { user } = useFirebaseAuth();

  const urlScore = searchParams.get('score');
  const urlSystem = searchParams.get('system');
  const urlCategory = searchParams.get('category');
  const isCounselingMode = !!(urlSystem || urlScore);

  // Systems
  const [systems, setSystems] = useState<CounselingSystem[]>([]);
  const [selectedSystemCode, setSelectedSystemCode] = useState(urlSystem || '');
  const selectedSystem = systems.find((s) => s.code === selectedSystemCode) || null;

  // Input
  const [compositeScore, setCompositeScore] = useState(urlScore || '');
  const [category, setCategory] = useState(urlCategory || '');
  const [year, setYear] = useState(2025);
  const [results, setResults] = useState<CounselingPrediction[]>([]);
  const [allotmentResults, setAllotmentResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

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
          // Set default category from system
          const sys = allSystems.find((s) => s.code === (urlSystem || first?.code));
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
        body: JSON.stringify({ systemCode: selectedSystem.code, compositeScore: score, category: category || undefined, year }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Prediction failed');
      setResults(data.predictions || []);
      setAllotmentResults(data.allotmentPredictions || []);
    } catch (err: any) {
      setError(err.message);
      setResults([]);
      setAllotmentResults([]);
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
    if (user && hasSearched && results.length === 0 && legacyResults.length === 0 && !loading) {
      if (isCounselingMode) handleCounselingPredict();
      else handleLegacyPredict();
    }
  }, [user]);

  const categoryOptions = selectedSystem
    ? selectedSystem.categories.map((c) => ({ value: c.code, label: c.code }))
    : [];

  const tierCounts = {
    safe: results.filter((r) => r.tier === 'safe').length,
    moderate: results.filter((r) => r.tier === 'moderate').length,
    reach: results.filter((r) => r.tier === 'reach').length,
  };

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
            {isCounselingMode ? 'Find colleges based on your counseling score' : 'Find colleges matching your NATA score'}
          </Typography>
        </Box>
      </Box>

      {/* Counseling Mode — compact form */}
      {isCounselingMode ? (
        <>
          <Paper elevation={0} sx={{ p: isMobile ? 2 : 2.5, mb: 2, borderRadius: 2, border: '1px solid', borderColor: 'grey.200' }}>
            {/* Row 1: System + Score */}
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
              <FormControl size="small" sx={{ minWidth: 200, flex: 1 }}>
                <InputLabel>Counseling System</InputLabel>
                <Select
                  value={selectedSystemCode}
                  onChange={(e) => { setSelectedSystemCode(e.target.value); setCategory(''); setResults([]); }}
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
            ) : results.length > 0 ? (
              <Box>
                {/* Tier chips */}
                <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
                  {(['safe', 'moderate', 'reach'] as const).map((t) => (
                    <Chip key={t} label={`${TIER_CONFIG[t].label}: ${tierCounts[t]}`}
                      sx={{ bgcolor: TIER_CONFIG[t].bgColor, color: TIER_CONFIG[t].color, fontWeight: 600, fontSize: '0.8rem' }} />
                  ))}
                  <Chip label={`Total: ${results.length}`} variant="outlined" size="small" />
                </Box>

                {/* College list */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {results.map((p) => {
                    const tier = TIER_CONFIG[p.tier];
                    return (
                      <Card key={p.college.id} elevation={0}
                        sx={{ border: '1px solid', borderColor: 'grey.200', borderLeft: `3px solid ${tier.color}`, borderRadius: 1 }}>
                        <CardContent sx={{ py: 1, px: 1.5, '&:last-child': { pb: 1 } }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography variant="body2" fontWeight={600} noWrap>{p.college.name}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {p.college.city} · {p.college.type}
                                {p.college.annual_fee_approx && ` · ₹${p.college.annual_fee_approx.toLocaleString('en-IN')}/yr`}
                              </Typography>
                            </Box>
                            <Chip label={tier.label} size="small" color={tier.chipColor} sx={{ ml: 1, fontWeight: 600, height: 22 }} />
                          </Box>
                          <Box sx={{ display: 'flex', gap: 1.5, mt: 0.25 }}>
                            <Typography variant="caption" color="text.secondary">
                              Closing: <strong>{p.closingMark}</strong>
                            </Typography>
                            {p.closingRank && (
                              <Typography variant="caption" color="text.secondary">
                                Rank: <strong>{p.closingRank}</strong>
                              </Typography>
                            )}
                            <Typography variant="caption" color="text.secondary">
                              Gap: <strong style={{ color: p.gap >= 0 ? '#2E7D32' : '#C62828' }}>
                                {p.gap >= 0 ? '+' : ''}{p.gap.toFixed(1)}
                              </strong>
                            </Typography>
                          </Box>
                        </CardContent>
                      </Card>
                    );
                  })}
                </Box>

                {/* Allotment History */}
                {allotmentResults.length > 0 && (
                  <Paper elevation={0} sx={{ mt: 2, borderRadius: 1.5, border: '1px solid', borderColor: '#6A1B9A', overflow: 'hidden' }}>
                    <Box sx={{ px: 1.5, py: 1, bgcolor: '#F3E5F5', borderBottom: '1px solid', borderColor: '#CE93D8' }}>
                      <Typography variant="subtitle2" fontWeight={600} color="#6A1B9A">
                        Allotment History — Students at similar ranks got these colleges
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Based on {year} allotment data · {allotmentResults.length} colleges found
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                      {allotmentResults.slice(0, 15).map((a: any, i: number) => (
                        <Box key={`${a.collegeCode}-${a.branchCode}-${i}`}
                          sx={{ px: 1.5, py: 0.75, borderBottom: '1px solid', borderColor: 'grey.100', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.8rem' }} noWrap>
                              {a.collegeName || `College ${a.collegeCode}`}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.25 }}>
                              <Typography variant="caption" color="text.secondary">
                                {a.branchCode}{a.branchName ? ` · ${a.branchName}` : ''}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                · Rank {a.minRank}–{a.maxRank}
                              </Typography>
                            </Box>
                          </Box>
                          <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                            <Chip label={`${a.allottedCount} students`} size="small" variant="outlined" color="secondary"
                              sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600 }} />
                            <Box sx={{ display: 'flex', gap: 0.25, mt: 0.25, justifyContent: 'flex-end' }}>
                              {a.categories.slice(0, 3).map((cat: string) => (
                                <Chip key={cat} label={cat} size="small" variant="outlined"
                                  sx={{ height: 16, fontSize: '0.55rem', '& .MuiChip-label': { px: 0.5 } }} />
                              ))}
                            </Box>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  </Paper>
                )}
              </Box>
            ) : hasSearched && user ? (
              <Box>
                {allotmentResults.length > 0 ? (
                  <Paper elevation={0} sx={{ borderRadius: 1.5, border: '1px solid', borderColor: '#6A1B9A', overflow: 'hidden' }}>
                    <Box sx={{ px: 1.5, py: 1, bgcolor: '#F3E5F5', borderBottom: '1px solid', borderColor: '#CE93D8' }}>
                      <Typography variant="subtitle2" fontWeight={600} color="#6A1B9A">
                        Allotment History — Students at similar ranks got these colleges
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        No cutoff data available. Showing {year} allotment data instead.
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                      {allotmentResults.slice(0, 15).map((a: any, i: number) => (
                        <Box key={`${a.collegeCode}-${a.branchCode}-${i}`}
                          sx={{ px: 1.5, py: 0.75, borderBottom: '1px solid', borderColor: 'grey.100', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.8rem' }} noWrap>
                              {a.collegeName || `College ${a.collegeCode}`}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {a.branchCode} · Rank {a.minRank}–{a.maxRank}
                            </Typography>
                          </Box>
                          <Chip label={`${a.allottedCount} students`} size="small" variant="outlined" color="secondary"
                            sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600 }} />
                        </Box>
                      ))}
                    </Box>
                  </Paper>
                ) : (
                  <Paper sx={{ p: 3, textAlign: 'center' }}>
                    <Typography variant="body1" color="text.secondary" gutterBottom>No colleges found for this score</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Try a different year or category. Cutoff data may not be available yet.
                    </Typography>
                  </Paper>
                )}
              </Box>
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
