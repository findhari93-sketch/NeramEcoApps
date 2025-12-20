'use client';

import { useState } from 'react';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  TextField,
  Paper,
  Divider,
} from '@neram/ui';
import Link from 'next/link';

// Historical cutoff data for reference
const cutoffData = {
  2024: { general: 110, obc: 100, sc: 90, st: 85 },
  2023: { general: 105, obc: 95, sc: 85, st: 80 },
  2022: { general: 100, obc: 90, sc: 80, st: 75 },
};

const collegeRanges = [
  { range: '150+', colleges: 'IIT Kharagpur, IIT Roorkee, SPA Delhi' },
  { range: '130-150', colleges: 'NIT Trichy, NIT Calicut, SPA Bhopal' },
  { range: '110-130', colleges: 'CEPT, JJ College, MANIT, NIT Patna' },
  { range: '90-110', colleges: 'State Architecture Colleges' },
  { range: '70-90', colleges: 'Private Architecture Colleges' },
];

export default function CutoffCalculatorPage() {
  const [score, setScore] = useState<string>('');
  const [category, setCategory] = useState<string>('general');
  const [result, setResult] = useState<{ rank: string; colleges: string } | null>(null);

  const calculateCutoff = () => {
    const numScore = parseInt(score);
    if (isNaN(numScore) || numScore < 0 || numScore > 200) {
      alert('Please enter a valid score between 0 and 200');
      return;
    }

    let estimatedRank: string;
    let eligibleColleges: string;

    if (numScore >= 150) {
      estimatedRank = '1 - 500';
      eligibleColleges = 'IIT Kharagpur, IIT Roorkee, SPA Delhi, Top NITs';
    } else if (numScore >= 130) {
      estimatedRank = '500 - 2000';
      eligibleColleges = 'NIT Trichy, NIT Calicut, SPA Bhopal, CEPT';
    } else if (numScore >= 110) {
      estimatedRank = '2000 - 5000';
      eligibleColleges = 'JJ College, MANIT, NIT Patna, State Colleges';
    } else if (numScore >= 90) {
      estimatedRank = '5000 - 10000';
      eligibleColleges = 'Good Private Colleges, Some State Colleges';
    } else if (numScore >= 70) {
      estimatedRank = '10000 - 20000';
      eligibleColleges = 'Private Architecture Colleges';
    } else {
      estimatedRank = '20000+';
      eligibleColleges = 'Limited options. Consider improvement.';
    }

    setResult({ rank: estimatedRank, colleges: eligibleColleges });
  };

  return (
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          py: { xs: 6, md: 10 },
          background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)',
          color: 'white',
        }}
      >
        <Container maxWidth="lg">
          <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2rem', md: '3rem' } }}>
            NATA Cutoff Calculator 2025
          </Typography>
          <Typography variant="h5" sx={{ mb: 3, opacity: 0.9 }}>
            Estimate your rank and eligible colleges based on your expected score
          </Typography>
        </Container>
      </Box>

      {/* Calculator Section */}
      <Box sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Grid container spacing={4}>
            {/* Calculator Card */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent sx={{ p: 4 }}>
                  <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
                    Enter Your Details
                  </Typography>

                  <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                      Expected NATA Score (out of 200)
                    </Typography>
                    <TextField
                      fullWidth
                      type="number"
                      value={score}
                      onChange={(e) => setScore(e.target.value)}
                      placeholder="Enter your score"
                      inputProps={{ min: 0, max: 200 }}
                    />
                  </Box>

                  <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                      Category
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {['general', 'obc', 'sc', 'st'].map((cat) => (
                        <Button
                          key={cat}
                          variant={category === cat ? 'contained' : 'outlined'}
                          size="small"
                          onClick={() => setCategory(cat)}
                        >
                          {cat.toUpperCase()}
                        </Button>
                      ))}
                    </Box>
                  </Box>

                  <Button
                    variant="contained"
                    fullWidth
                    size="large"
                    onClick={calculateCutoff}
                    sx={{ mb: 3 }}
                  >
                    Calculate Rank
                  </Button>

                  {result && (
                    <Paper sx={{ p: 3, bgcolor: 'success.50', border: '1px solid', borderColor: 'success.main' }}>
                      <Typography variant="h6" color="success.main" gutterBottom>
                        Your Estimated Rank
                      </Typography>
                      <Typography variant="h3" sx={{ fontWeight: 700, mb: 2 }}>
                        AIR {result.rank}
                      </Typography>
                      <Divider sx={{ my: 2 }} />
                      <Typography variant="subtitle2" gutterBottom>
                        Eligible Colleges:
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {result.colleges}
                      </Typography>
                    </Paper>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Score Range Reference */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent sx={{ p: 4 }}>
                  <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
                    Score vs College Eligibility
                  </Typography>
                  {collegeRanges.map((range, index) => (
                    <Box key={index} sx={{ mb: 2, pb: 2, borderBottom: index < collegeRanges.length - 1 ? '1px solid' : 'none', borderColor: 'divider' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="h6" color="primary" sx={{ fontWeight: 600 }}>
                          {range.range} Marks
                        </Typography>
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        {range.colleges}
                      </Typography>
                    </Box>
                  ))}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Historical Cutoffs */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 6 }}>
            Historical NATA Cutoffs
          </Typography>
          <Grid container spacing={3}>
            {Object.entries(cutoffData).map(([year, data]) => (
              <Grid item xs={12} md={4} key={year}>
                <Card>
                  <CardContent sx={{ p: 3, textAlign: 'center' }}>
                    <Typography variant="h4" color="primary" sx={{ fontWeight: 700, mb: 2 }}>
                      {year}
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">General</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>{data.general}</Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">OBC</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>{data.obc}</Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">SC</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>{data.sc}</Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">ST</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>{data.st}</Typography>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Disclaimer */}
      <Box sx={{ py: 4, bgcolor: 'warning.50' }}>
        <Container maxWidth="lg">
          <Typography variant="body2" color="text.secondary" align="center">
            <strong>Disclaimer:</strong> This calculator provides estimated ranks based on historical data.
            Actual cutoffs may vary based on difficulty level, number of candidates, and other factors.
            Use this as a reference only.
          </Typography>
        </Container>
      </Box>

      {/* CTA Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'primary.main', color: 'white', textAlign: 'center' }}>
        <Container maxWidth="md">
          <Typography variant="h3" component="h2" gutterBottom sx={{ fontWeight: 700 }}>
            Want to Improve Your Score?
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
            Join Neram Classes for expert coaching and boost your NATA score
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              size="large"
              component={Link}
              href="/apply"
              sx={{ bgcolor: 'white', color: 'primary.main' }}
            >
              Join Coaching
            </Button>
            <Button
              variant="outlined"
              size="large"
              component={Link}
              href="/nata-preparation-guide"
              sx={{ borderColor: 'white', color: 'white' }}
            >
              Preparation Guide
            </Button>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}
