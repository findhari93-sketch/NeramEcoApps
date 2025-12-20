'use client';

import { useState, useEffect } from 'react';
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
} from '@neram/ui';

interface CollegePrediction {
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

export default function CollegePredictorPage() {
  const [nataScore, setNataScore] = useState<string>('');
  const [category, setCategory] = useState<string>('General');
  const [state, setState] = useState<string>('');
  const [states, setStates] = useState<string[]>([]);
  const [results, setResults] = useState<CollegePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [statesLoading, setStatesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch available states on mount
  useEffect(() => {
    fetch('/api/tools/college-predictor')
      .then((res) => res.json())
      .then((data) => {
        setStates(data.states || []);
      })
      .catch((err) => {
        console.error('Failed to fetch states:', err);
      })
      .finally(() => {
        setStatesLoading(false);
      });
  }, []);

  const predictColleges = async () => {
    const score = parseFloat(nataScore);
    if (isNaN(score) || score < 0 || score > 200) {
      setError('Please enter a valid NATA score between 0 and 200');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/tools/college-predictor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nataScore: score,
          category,
          state: state || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to predict colleges');
      }

      setResults(data.predictions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const getChanceColor = (chance: string) => {
    switch (chance) {
      case 'High':
        return 'success';
      case 'Medium':
        return 'warning';
      case 'Low':
        return 'error';
      default:
        return 'default';
    }
  };

  const formatFees = (fee: number | null) => {
    if (!fee) return 'Contact college';
    return `₹${fee.toLocaleString('en-IN')}/year`;
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
        College Predictor
      </Typography>

      <Grid container spacing={3}>
        {/* Input Section */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h6" gutterBottom>
              Enter Your Details
            </Typography>

            <TextField
              fullWidth
              label="NATA Score"
              type="number"
              value={nataScore}
              onChange={(e) => setNataScore(e.target.value)}
              placeholder="Enter score (0-200)"
              sx={{ mb: 2 }}
              inputProps={{ min: 0, max: 200 }}
            />

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Category</InputLabel>
              <Select
                value={category}
                label="Category"
                onChange={(e) => setCategory(e.target.value)}
              >
                <MenuItem value="General">General</MenuItem>
                <MenuItem value="OBC">OBC</MenuItem>
                <MenuItem value="SC">SC</MenuItem>
                <MenuItem value="ST">ST</MenuItem>
                <MenuItem value="EWS">EWS</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth sx={{ mb: 3 }}>
              <InputLabel>Preferred State</InputLabel>
              <Select
                value={state}
                label="Preferred State"
                onChange={(e) => setState(e.target.value)}
                disabled={statesLoading}
              >
                <MenuItem value="">Any State</MenuItem>
                {states.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Button
              variant="contained"
              fullWidth
              size="large"
              onClick={predictColleges}
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : 'Predict Colleges'}
            </Button>
          </Paper>

          <Paper sx={{ p: 2, mt: 2 }}>
            <Typography variant="subtitle2" gutterBottom fontWeight={600}>
              Score Guide
            </Typography>
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                170+ : Top tier colleges
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                140-170 : Premier colleges
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                100-140 : Good colleges
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Below 100 : Private colleges
              </Typography>
            </Box>
          </Paper>
        </Grid>

        {/* Results Section */}
        <Grid item xs={12} md={8}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {loading ? (
            <Paper
              sx={{
                p: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 400,
              }}
            >
              <CircularProgress />
            </Paper>
          ) : results.length > 0 ? (
            <Box>
              <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
                Predicted Colleges ({results.length})
              </Typography>
              <Grid container spacing={2}>
                {results.map((college) => (
                  <Grid item xs={12} key={college.id}>
                    <Card>
                      <CardContent>
                        <Box
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            mb: 1,
                          }}
                        >
                          <Typography variant="h6" sx={{ fontSize: '1.1rem' }}>
                            {college.name}
                          </Typography>
                          <Chip
                            label={`${college.chance} Chance`}
                            color={getChanceColor(college.chance) as any}
                            size="small"
                          />
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                          <Chip
                            label={`${college.city}, ${college.state}`}
                            size="small"
                            variant="outlined"
                          />
                          <Chip label={college.collegeType} size="small" variant="outlined" />
                          {college.cutoffScore > 0 && (
                            <Chip
                              label={`Cutoff: ${college.cutoffScore}`}
                              size="small"
                              variant="outlined"
                              color="primary"
                            />
                          )}
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                          Annual Fees: {formatFees(college.annualFee)}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Box>
          ) : (
            <Paper
              sx={{
                p: { xs: 2, md: 3 },
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 400,
              }}
            >
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  Enter your details
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Fill in your NATA score and preferences to get college predictions
                </Typography>
              </Box>
            </Paper>
          )}
        </Grid>

        {/* Info Section */}
        <Grid item xs={12}>
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h6" gutterBottom>
              How College Prediction Works
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Our college predictor uses historical cutoff data, admission trends, and your NATA
              score to predict colleges where you have chances of admission.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Predictions are based on previous year data and may vary depending on various
              factors including the number of applicants, seat availability, and cutoff trends.
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
