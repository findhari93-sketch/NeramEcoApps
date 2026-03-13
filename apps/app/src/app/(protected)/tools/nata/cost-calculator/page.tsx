'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  RadioGroup,
  Radio,
  FormLabel,
  Switch,
  Alert,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@neram/ui';
import { AuthGate } from '@/components/AuthGate';
import Link from 'next/link';

// Fee constants (per attempt)
const FEES: Record<string, number> = {
  'General/OBC(N-CL)': 1750,
  'SC/ST/EWS/PwD': 1250,
  Transgender: 1000,
  'Outside India': 15000,
};

// Indian states
const STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Delhi',
  'Chandigarh',
  'Puducherry',
  'Jammu & Kashmir',
  'Ladakh',
  'Andaman & Nicobar',
  'Dadra & Nagar Haveli',
  'Lakshadweep',
];

// Major exam center cities by state (simplified for travel estimation)
const MAJOR_EXAM_STATES = [
  'Delhi',
  'Maharashtra',
  'Karnataka',
  'Tamil Nadu',
  'West Bengal',
  'Telangana',
  'Uttar Pradesh',
  'Gujarat',
  'Rajasthan',
  'Kerala',
  'Madhya Pradesh',
  'Punjab',
  'Haryana',
  'Bihar',
  'Odisha',
  'Jharkhand',
  'Chhattisgarh',
  'Assam',
  'Chandigarh',
  'Uttarakhand',
  'Andhra Pradesh',
  'Goa',
];

interface CostBreakdown {
  applicationFeePerAttempt: number;
  totalApplicationFee: number;
  estimatedTravel: number;
  travelNote: string;
  accommodation: number;
  accommodationNote: string;
  studyMaterials: { min: number; max: number };
  totalMin: number;
  totalMax: number;
}

const TIPS = [
  'Register early — you can initially opt for 1 test and add a 2nd test later (max 2 in Phase 1).',
  'Exam fees are non-refundable. Plan your attempts wisely.',
  'Book accommodation early near your exam center for better rates.',
  'Consider online study materials which are often more affordable.',
  'Join a coaching institute like Neram Classes for structured NATA preparation.',
  'Factor in practice material costs (drawing sheets, instruments, etc.).',
];

export default function NataCostCalculatorPage() {
  const [category, setCategory] = useState('General/OBC(N-CL)');
  const [attempts, setAttempts] = useState('1');
  const [homeState, setHomeState] = useState('');
  const [needAccommodation, setNeedAccommodation] = useState(false);
  const [result, setResult] = useState<CostBreakdown | null>(null);
  const [hasCalculated, setHasCalculated] = useState(false);

  const calculateCost = () => {
    const feePerAttempt = FEES[category] || 1750;
    const numAttempts = parseInt(attempts);
    const totalFee = feePerAttempt * numAttempts;

    // Travel estimation
    let estimatedTravel = 0;
    let travelNote = '';
    if (homeState && !MAJOR_EXAM_STATES.includes(homeState)) {
      // Remote state - higher travel cost
      estimatedTravel = 5000 * numAttempts;
      travelNote = `Your state (${homeState}) may not have a nearby exam center. Estimated travel cost per attempt: ~₹5,000`;
    } else if (homeState) {
      estimatedTravel = 2000 * numAttempts;
      travelNote = `Exam centers are likely available in or near ${homeState}. Estimated travel cost per attempt: ~₹2,000`;
    }

    // Accommodation
    let accommodation = 0;
    let accommodationNote = '';
    if (needAccommodation) {
      const perAttempt = homeState && !MAJOR_EXAM_STATES.includes(homeState) ? 3000 : 1500;
      accommodation = perAttempt * numAttempts;
      accommodationNote = `Estimated at ₹${perAttempt.toLocaleString('en-IN')} per attempt (1-2 nights)`;
    }

    // Study materials range
    const studyMaterials = { min: 2000, max: 5000 };

    const totalMin = totalFee + estimatedTravel + accommodation + studyMaterials.min;
    const totalMax = totalFee + estimatedTravel + accommodation + studyMaterials.max;

    setResult({
      applicationFeePerAttempt: feePerAttempt,
      totalApplicationFee: totalFee,
      estimatedTravel,
      travelNote,
      accommodation,
      accommodationNote,
      studyMaterials,
      totalMin,
      totalMax,
    });
    setHasCalculated(true);
  };

  const formatCurrency = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, mb: 1 }}>
        NATA Cost Calculator
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Estimate the total cost of appearing for NATA, including exam fees, travel, accommodation,
        and study materials.
      </Typography>

      <Grid container spacing={3}>
        {/* Input Section */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h6" gutterBottom>
              Your Details
            </Typography>

            {/* Category */}
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Category</InputLabel>
              <Select
                value={category}
                label="Category"
                onChange={(e) => {
                  setCategory(e.target.value);
                  setResult(null);
                  setHasCalculated(false);
                }}
              >
                {Object.keys(FEES).map((cat) => (
                  <MenuItem key={cat} value={cat}>
                    {cat}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Number of Attempts */}
            <FormControl sx={{ mb: 2, width: '100%' }}>
              <FormLabel sx={{ fontSize: '0.875rem', mb: 0.5 }}>Number of Attempts</FormLabel>
              <RadioGroup
                row
                value={attempts}
                onChange={(e) => {
                  setAttempts(e.target.value);
                  setResult(null);
                  setHasCalculated(false);
                }}
              >
                <FormControlLabel
                  value="1"
                  control={<Radio size="small" />}
                  label={<Typography variant="body2">1</Typography>}
                />
                <FormControlLabel
                  value="2"
                  control={<Radio size="small" />}
                  label={<Typography variant="body2">2</Typography>}
                />
                {/* NATA 2026: Max 2 attempts in Phase 1, or 1 in Phase 2. "3 attempts" option removed. */}
              </RadioGroup>
            </FormControl>

            {/* Home State */}
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Home State</InputLabel>
              <Select
                value={homeState}
                label="Home State"
                onChange={(e) => {
                  setHomeState(e.target.value);
                  setResult(null);
                  setHasCalculated(false);
                }}
              >
                <MenuItem value="">Select State</MenuItem>
                {STATES.map((state) => (
                  <MenuItem key={state} value={state}>
                    {state}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Need Accommodation */}
            <Box sx={{ mb: 3 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={needAccommodation}
                    onChange={(e) => {
                      setNeedAccommodation(e.target.checked);
                      setResult(null);
                      setHasCalculated(false);
                    }}
                  />
                }
                label={<Typography variant="body2">Need accommodation near exam center</Typography>}
              />
            </Box>

            <Button variant="contained" fullWidth size="large" onClick={calculateCost}>
              Calculate Cost
            </Button>
          </Paper>

          {/* Fee Reference */}
          <Paper sx={{ p: 2, mt: 2 }}>
            <Typography variant="subtitle2" gutterBottom fontWeight={600}>
              Application Fees (per attempt)
            </Typography>
            {Object.entries(FEES).map(([cat, fee]) => (
              <Box
                key={cat}
                sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}
              >
                <Typography variant="body2" color="text.secondary">
                  {cat}
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {formatCurrency(fee)}
                </Typography>
              </Box>
            ))}
          </Paper>
        </Grid>

        {/* Results Section - Gated */}
        <Grid item xs={12} md={8}>
          {!hasCalculated ? (
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
                  Select your category, attempts, and location to estimate total NATA costs
                </Typography>
              </Box>
            </Paper>
          ) : result ? (
            <AuthGate
              hasData={hasCalculated}
              pendingData={{ category, attempts, homeState, needAccommodation }}
              onAuthenticated={calculateCost}
              title="Sign up to see cost breakdown"
              description="Create a free account to see the detailed cost breakdown and money-saving tips."
            >
              <Box>
                {/* Cost Breakdown Table */}
                <Paper sx={{ p: { xs: 2, md: 3 }, mb: 2 }}>
                  <Typography variant="h6" gutterBottom>
                    Cost Breakdown
                  </Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 600 }}>Item</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            Amount
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        <TableRow>
                          <TableCell>
                            <Typography variant="body2">
                              Application Fee (per attempt)
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {category}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            {formatCurrency(result.applicationFeePerAttempt)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>
                            <Typography variant="body2">
                              Total Application Fee ({attempts} attempt
                              {parseInt(attempts) > 1 ? 's' : ''})
                            </Typography>
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            {formatCurrency(result.totalApplicationFee)}
                          </TableCell>
                        </TableRow>

                        {result.estimatedTravel > 0 && (
                          <TableRow>
                            <TableCell>
                              <Typography variant="body2">Estimated Travel</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {result.travelNote}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              {formatCurrency(result.estimatedTravel)}
                            </TableCell>
                          </TableRow>
                        )}

                        {result.accommodation > 0 && (
                          <TableRow>
                            <TableCell>
                              <Typography variant="body2">Accommodation</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {result.accommodationNote}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              {formatCurrency(result.accommodation)}
                            </TableCell>
                          </TableRow>
                        )}

                        <TableRow>
                          <TableCell>
                            <Typography variant="body2">Study Materials (estimated)</Typography>
                            <Typography variant="caption" color="text.secondary">
                              Books, drawing tools, practice papers
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            {formatCurrency(result.studyMaterials.min)} -{' '}
                            {formatCurrency(result.studyMaterials.max)}
                          </TableCell>
                        </TableRow>

                        <TableRow
                          sx={{ '& td': { borderBottom: 'none', pt: 2 } }}
                        >
                          <TableCell>
                            <Typography variant="subtitle1" fontWeight={700}>
                              Total Estimated Cost
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="subtitle1" fontWeight={700} color="primary.main">
                              {formatCurrency(result.totalMin)}
                              {result.totalMin !== result.totalMax &&
                                ` - ${formatCurrency(result.totalMax)}`}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>

                {/* Tips Section */}
                <Paper sx={{ p: { xs: 2, md: 3 }, mb: 2 }}>
                  <Typography variant="h6" gutterBottom>
                    Money-Saving Tips
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                  {TIPS.map((tip, index) => (
                    <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          minWidth: 24,
                          height: 24,
                          borderRadius: '50%',
                          bgcolor: 'primary.main',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          flexShrink: 0,
                        }}
                      >
                        {index + 1}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {tip}
                      </Typography>
                    </Box>
                  ))}
                </Paper>

                {/* CTA */}
                <Alert
                  severity="info"
                  action={
                    <Button
                      component={Link}
                      href="https://neramclasses.com/apply"
                      color="inherit"
                      size="small"
                      variant="outlined"
                    >
                      Apply Now
                    </Button>
                  }
                >
                  <Typography variant="subtitle2">
                    Get expert NATA coaching at Neram Classes
                  </Typography>
                  <Typography variant="body2">
                    Comprehensive preparation including study materials and mock tests.
                  </Typography>
                </Alert>
              </Box>
            </AuthGate>
          ) : null}
        </Grid>

        {/* Info Section */}
        <Grid item xs={12}>
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h6" gutterBottom>
              About NATA Exam Fees
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              NATA exam fees are set by the Council of Architecture (COA) and vary based on category.
              You can take up to 2 tests in Phase 1 (April–June, for CAP admissions) or 1 test in Phase 2
              (August, for vacant seats). You cannot appear in both phases. Each test requires a separate fee.
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Additional costs like travel, accommodation, and study materials vary significantly
              based on your location and preparation approach. The estimates above are approximate
              and meant to help you plan your budget.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Always check the official NATA website (nata.in) for the latest fee structure and
              payment options.
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
