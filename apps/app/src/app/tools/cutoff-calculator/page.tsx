'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Grid,
  Card,
  CardContent,
  Alert,
  Divider,
  Slider,
} from '@neram/ui';
import { AuthGate } from '@/components/AuthGate';
import type { Metadata } from 'next';

interface CutoffResult {
  totalScore: number;
  percentage: number;
  prediction: string;
  category: string;
}

export default function CutoffCalculatorPage() {
  const [mathematicsScore, setMathematicsScore] = useState<number>(50);
  const [aptitudeScore, setAptitudeScore] = useState<number>(50);
  const [drawingScore, setDrawingScore] = useState<number>(50);
  const [result, setResult] = useState<CutoffResult | null>(null);
  const [hasCalculated, setHasCalculated] = useState(false);

  const calculateCutoff = () => {
    const totalScore = mathematicsScore + aptitudeScore + drawingScore;
    const percentage = (totalScore / 300) * 100;

    let prediction = '';
    let category = '';

    if (percentage >= 75) {
      prediction = 'Excellent! You have strong chances for top architecture colleges.';
      category = 'Excellent';
    } else if (percentage >= 60) {
      prediction = 'Good! You can expect admission to good architecture colleges.';
      category = 'Good';
    } else if (percentage >= 45) {
      prediction = 'Fair chances. Consider improving your scores for better colleges.';
      category = 'Fair';
    } else {
      prediction = 'Need improvement. Focus on preparation to increase your chances.';
      category = 'Needs Improvement';
    }

    setResult({
      totalScore,
      percentage: parseFloat(percentage.toFixed(2)),
      prediction,
      category,
    });
    setHasCalculated(true);
  };

  const resetCalculator = () => {
    setMathematicsScore(50);
    setAptitudeScore(50);
    setDrawingScore(50);
    setResult(null);
    setHasCalculated(false);
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, mb: 1 }}>
        NATA Cutoff Calculator
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Enter your expected or actual scores to calculate your NATA cutoff and get personalized
        insights.
      </Typography>

      <Grid container spacing={3}>
        {/* Input Section */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h6" gutterBottom>
              Enter Your Scores
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Enter your expected or actual scores for each section (out of 100)
            </Typography>

            <Box sx={{ mb: 4 }}>
              <Typography gutterBottom>Mathematics: {mathematicsScore}/100</Typography>
              <Slider
                value={mathematicsScore}
                onChange={(_, value) => setMathematicsScore(value as number)}
                min={0}
                max={100}
                valueLabelDisplay="auto"
                sx={{ mb: 2 }}
              />
            </Box>

            <Box sx={{ mb: 4 }}>
              <Typography gutterBottom>General Aptitude: {aptitudeScore}/100</Typography>
              <Slider
                value={aptitudeScore}
                onChange={(_, value) => setAptitudeScore(value as number)}
                min={0}
                max={100}
                valueLabelDisplay="auto"
                sx={{ mb: 2 }}
              />
            </Box>

            <Box sx={{ mb: 4 }}>
              <Typography gutterBottom>Drawing Test: {drawingScore}/100</Typography>
              <Slider
                value={drawingScore}
                onChange={(_, value) => setDrawingScore(value as number)}
                min={0}
                max={100}
                valueLabelDisplay="auto"
              />
            </Box>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                fullWidth
                size="large"
                onClick={calculateCutoff}
                sx={{ mt: 2 }}
              >
                Calculate Cutoff
              </Button>
              {hasCalculated && (
                <Button variant="outlined" size="large" onClick={resetCalculator} sx={{ mt: 2 }}>
                  Reset
                </Button>
              )}
            </Box>
          </Paper>
        </Grid>

        {/* Results Section - Gated */}
        <Grid item xs={12} md={6}>
          <AuthGate
            hasData={hasCalculated}
            pendingData={{
              mathematicsScore,
              aptitudeScore,
              drawingScore,
            }}
            onAuthenticated={calculateCutoff}
            title="Sign up to see your results"
            description="Create a free account to view your cutoff analysis and get personalized college recommendations."
          >
            {result ? (
              <Paper sx={{ p: { xs: 2, md: 3 } }}>
                <Typography variant="h6" gutterBottom>
                  Your Results
                </Typography>

                <Card sx={{ mb: 2, bgcolor: 'primary.main', color: 'white' }}>
                  <CardContent>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                      Total Score
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 700 }}>
                      {result.totalScore}/300
                    </Typography>
                    <Typography variant="h5">{result.percentage}%</Typography>
                  </CardContent>
                </Card>

                <Alert
                  severity={
                    result.category === 'Excellent'
                      ? 'success'
                      : result.category === 'Good'
                        ? 'info'
                        : result.category === 'Fair'
                          ? 'warning'
                          : 'error'
                  }
                  sx={{ mb: 2 }}
                >
                  <Typography variant="body2" fontWeight={600}>
                    {result.category}
                  </Typography>
                </Alert>

                <Typography variant="body1" sx={{ mb: 3 }}>
                  {result.prediction}
                </Typography>

                <Divider sx={{ my: 2 }} />

                <Typography variant="subtitle2" gutterBottom fontWeight={600}>
                  Score Breakdown
                </Typography>
                <Box sx={{ mt: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">Mathematics</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {mathematicsScore}/100
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">General Aptitude</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {aptitudeScore}/100
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2">Drawing Test</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {drawingScore}/100
                    </Typography>
                  </Box>
                </Box>

                {/* CTA to College Predictor */}
                <Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                  <Button
                    variant="outlined"
                    fullWidth
                    href="/tools/college-predictor"
                    sx={{ mb: 1 }}
                  >
                    Find Colleges for Your Score →
                  </Button>
                </Box>
              </Paper>
            ) : (
              <Paper
                sx={{
                  p: { xs: 2, md: 3 },
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 300,
                }}
              >
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h6" color="text.secondary" gutterBottom>
                    Enter your scores
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Your cutoff calculation results will appear here
                  </Typography>
                </Box>
              </Paper>
            )}
          </AuthGate>
        </Grid>

        {/* Information Section */}
        <Grid item xs={12}>
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h6" gutterBottom>
              About NATA Cutoff
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              The National Aptitude Test in Architecture (NATA) is conducted by the Council of
              Architecture (COA) for admission to undergraduate architecture programs across India.
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              The exam consists of three sections:
            </Typography>
            <ul style={{ marginLeft: '1.5rem' }}>
              <li>
                <Typography variant="body2" color="text.secondary">
                  Mathematics (100 marks)
                </Typography>
              </li>
              <li>
                <Typography variant="body2" color="text.secondary">
                  General Aptitude (100 marks)
                </Typography>
              </li>
              <li>
                <Typography variant="body2" color="text.secondary">
                  Drawing Test (100 marks)
                </Typography>
              </li>
            </ul>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Use this calculator to estimate your chances based on your expected or actual scores.
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
