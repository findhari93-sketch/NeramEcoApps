'use client';

import { useState } from 'react';
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
} from '@neram/ui';

interface College {
  name: string;
  location: string;
  type: string;
  fees: string;
  chance: 'High' | 'Medium' | 'Low';
}

export default function CollegePredictorPage() {
  const [nataScore, setNataScore] = useState<string>('');
  const [category, setCategory] = useState<string>('General');
  const [state, setState] = useState<string>('');
  const [results, setResults] = useState<College[]>([]);

  const predictColleges = () => {
    const score = parseFloat(nataScore);
    if (isNaN(score) || score < 0 || score > 200) {
      alert('Please enter a valid NATA score between 0 and 200');
      return;
    }

    // Mock data - replace with actual API call
    const mockColleges: College[] = [
      {
        name: 'IIT Kharagpur - Architecture',
        location: 'West Bengal',
        type: 'Government',
        fees: '₹2,00,000/year',
        chance: score >= 160 ? 'High' : score >= 140 ? 'Medium' : 'Low',
      },
      {
        name: 'NIT Trichy - Architecture',
        location: 'Tamil Nadu',
        type: 'Government',
        fees: '₹1,50,000/year',
        chance: score >= 150 ? 'High' : score >= 130 ? 'Medium' : 'Low',
      },
      {
        name: 'School of Planning and Architecture, Delhi',
        location: 'Delhi',
        type: 'Government',
        fees: '₹1,00,000/year',
        chance: score >= 170 ? 'High' : score >= 150 ? 'Medium' : 'Low',
      },
      {
        name: 'Chandigarh College of Architecture',
        location: 'Chandigarh',
        type: 'Government',
        fees: '₹80,000/year',
        chance: score >= 140 ? 'High' : score >= 120 ? 'Medium' : 'Low',
      },
      {
        name: 'SRM Institute of Science and Technology',
        location: 'Tamil Nadu',
        type: 'Private',
        fees: '₹2,50,000/year',
        chance: score >= 100 ? 'High' : score >= 80 ? 'Medium' : 'Low',
      },
    ];

    setResults(mockColleges);
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
              >
                <MenuItem value="">Any State</MenuItem>
                <MenuItem value="Delhi">Delhi</MenuItem>
                <MenuItem value="Maharashtra">Maharashtra</MenuItem>
                <MenuItem value="Karnataka">Karnataka</MenuItem>
                <MenuItem value="Tamil Nadu">Tamil Nadu</MenuItem>
                <MenuItem value="West Bengal">West Bengal</MenuItem>
                <MenuItem value="Telangana">Telangana</MenuItem>
              </Select>
            </FormControl>

            <Button
              variant="contained"
              fullWidth
              size="large"
              onClick={predictColleges}
            >
              Predict Colleges
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
          {results.length > 0 ? (
            <Box>
              <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
                Predicted Colleges ({results.length})
              </Typography>
              <Grid container spacing={2}>
                {results.map((college, index) => (
                  <Grid item xs={12} key={index}>
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
                          <Chip label={college.location} size="small" variant="outlined" />
                          <Chip label={college.type} size="small" variant="outlined" />
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                          Annual Fees: {college.fees}
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
