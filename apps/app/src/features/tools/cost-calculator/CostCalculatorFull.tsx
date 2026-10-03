'use client';

import { useState, useEffect, useRef } from 'react';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
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
  ArrowForwardIcon,
} from '@neram/ui';
import ToolPageHeader from '@/components/tools-hub/ToolPageHeader';
import { useToolOpened } from '@/hooks/useToolOpened';
import { NATA_FEES } from '@/lib/tools/nata-fees';

/**
 * Bring a freshly rendered result into view when it is off screen (phones stack
 * it under the form), then move focus to it so screen readers land there too.
 */
function revealIfNeeded(el: HTMLElement | null) {
  if (!el || typeof window === 'undefined') return;
  const rect = el.getBoundingClientRect();
  const hidden = rect.top < 64 || rect.top > window.innerHeight - 120;
  if (hidden) {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }
  el.focus({ preventScroll: true });
}

// Fee constants (per attempt)
const FEES = NATA_FEES;

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
  'Register early: you can initially opt for 1 test and add a 2nd test later (max 2 in Phase 1).',
  'Exam fees are non-refundable. Plan your attempts wisely.',
  'Book accommodation early near your exam center for better rates.',
  'Consider online study materials which are often more affordable.',
  'Join a coaching institute like Neram Classes for structured NATA preparation.',
  'Factor in practice material costs (drawing sheets, instruments, etc.).',
];

export default function NataCostCalculatorPage() {
  useToolOpened('nata_cost_calculator');
  const [category, setCategory] = useState('General/OBC(N-CL)');
  const [attempts, setAttempts] = useState('1');
  const [homeState, setHomeState] = useState('');
  const [needAccommodation, setNeedAccommodation] = useState(false);
  const [result, setResult] = useState<CostBreakdown | null>(null);
  const [hasCalculated, setHasCalculated] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  // Bumped on every Calculate so the estimate scrolls into view after it renders
  const [revealRequest, setRevealRequest] = useState(0);

  useEffect(() => {
    if (revealRequest > 0) revealIfNeeded(resultsRef.current);
  }, [revealRequest]);

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
      travelNote = `Your state (${homeState}) may not have a nearby exam center. Estimated travel cost per attempt: about ₹5,000`;
    } else if (homeState) {
      estimatedTravel = 2000 * numAttempts;
      travelNote = `Exam centers are likely available in or near ${homeState}. Estimated travel cost per attempt: about ₹2,000`;
    }

    // Accommodation
    let accommodation = 0;
    let accommodationNote = '';
    if (needAccommodation) {
      const perAttempt = homeState && !MAJOR_EXAM_STATES.includes(homeState) ? 3000 : 1500;
      accommodation = perAttempt * numAttempts;
      accommodationNote = `Estimated at ₹${perAttempt.toLocaleString('en-IN')} per attempt (1 to 2 nights)`;
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
    setRevealRequest((n) => n + 1);
  };

  const formatCurrency = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;

  return (
    <Box>
      <ToolPageHeader
        toolId="nata-cost-calculator"
        description="Estimate the total cost of appearing for NATA: exam fees, travel, accommodation and study materials."
      />

      <Box
        sx={{
          display: 'grid',
          gap: { xs: 2, md: 3 },
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 4fr) minmax(0, 8fr)' },
          gridTemplateRows: { md: 'auto 1fr auto' },
          gridTemplateAreas: {
            xs: '"form" "results" "fees" "info"',
            md: '"form results" "fees results" "info info"',
          },
          alignItems: 'start',
        }}
      >
        {/* Input Section */}
        <Paper sx={{ gridArea: 'form', p: { xs: 2, md: 3 } }}>
          <Typography variant="h6" component="h2" gutterBottom>
            Your Details
          </Typography>

          {/* Category */}
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel id="cost-category-label">Category</InputLabel>
            <Select
              labelId="cost-category-label"
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
          <FormControl component="fieldset" sx={{ mb: 2, width: '100%' }}>
            <FormLabel component="legend" sx={{ fontSize: '0.875rem', mb: 0.5 }}>
              Number of Attempts
            </FormLabel>
            <RadioGroup
              row
              value={attempts}
              onChange={(e) => {
                setAttempts(e.target.value);
                setResult(null);
                setHasCalculated(false);
              }}
              sx={{ columnGap: 2 }}
            >
              <FormControlLabel
                value="1"
                control={<Radio />}
                label={<Typography variant="body2">1 attempt</Typography>}
                sx={{ minHeight: 44, mr: 0 }}
              />
              <FormControlLabel
                value="2"
                control={<Radio />}
                label={<Typography variant="body2">2 attempts</Typography>}
                sx={{ minHeight: 44, mr: 0 }}
              />
              {/* NATA 2026: Max 2 attempts in Phase 1, or 1 in Phase 2. "3 attempts" option removed. */}
            </RadioGroup>
            <Typography variant="caption" color="text.secondary">
              Up to 2 tests in Phase 1, or 1 test in Phase 2.
            </Typography>
          </FormControl>

          {/* Home State */}
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel id="cost-state-label">Home State</InputLabel>
            <Select
              labelId="cost-state-label"
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
              sx={{ minHeight: 48, mr: 0 }}
            />
          </Box>

          <Button variant="contained" fullWidth size="large" onClick={calculateCost}>
            Calculate Cost
          </Button>
        </Paper>

        {/* Results Section */}
        <Box
          ref={resultsRef}
          tabIndex={-1}
          role="region"
          aria-label="Your cost estimate"
          sx={{
            gridArea: 'results',
            minWidth: 0,
            scrollMarginTop: { xs: '72px', md: '16px' },
            '&:focus': { outline: 'none' },
          }}
        >
          {!hasCalculated || !result ? (
            <Box
              sx={{
                p: { xs: 2, md: 2.5 },
                borderRadius: 3,
                border: '1px dashed',
                borderColor: 'divider',
                display: 'flex',
                gap: 1.5,
                alignItems: 'flex-start',
              }}
            >
              <AccountBalanceWalletOutlinedIcon
                aria-hidden="true"
                sx={{ color: 'text.secondary', mt: 0.25, flexShrink: 0 }}
              />
              <Box>
                <Typography variant="subtitle2" component="h2" fontWeight={600}>
                  Your estimate shows up here
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Pick your category, attempts and home state, then tap Calculate Cost.
                </Typography>
              </Box>
            </Box>
          ) : (
            <Box>
              {/* Cost Breakdown Table */}
              <Paper sx={{ p: { xs: 2, md: 3 }, mb: 2 }}>
                <Typography variant="h6" component="h2" gutterBottom>
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
                          <Typography variant="body2">Application Fee (per attempt)</Typography>
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
                          <TableCell align="right">{formatCurrency(result.estimatedTravel)}</TableCell>
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
                          <TableCell align="right">{formatCurrency(result.accommodation)}</TableCell>
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
                          {formatCurrency(result.studyMaterials.min)} to{' '}
                          {formatCurrency(result.studyMaterials.max)}
                        </TableCell>
                      </TableRow>

                      <TableRow sx={{ '& td': { borderBottom: 'none', pt: 2 } }}>
                        <TableCell>
                          <Typography variant="subtitle1" component="p" fontWeight={700}>
                            Total Estimated Cost
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="subtitle1"
                            component="p"
                            fontWeight={700}
                            color="primary.main"
                          >
                            {formatCurrency(result.totalMin)}
                            {result.totalMin !== result.totalMax &&
                              ` to ${formatCurrency(result.totalMax)}`}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>

              {/* Tips Section */}
              <Paper sx={{ p: { xs: 2, md: 3 }, mb: 2 }}>
                <Typography variant="h6" component="h2" gutterBottom>
                  Money-Saving Tips
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0 }}>
                  {TIPS.map((tip, index) => (
                    <Box component="li" key={index} sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
                      <Box
                        aria-hidden="true"
                        sx={{
                          minWidth: 24,
                          height: 24,
                          borderRadius: '50%',
                          bgcolor: 'primary.main',
                          color: 'primary.contrastText',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {index + 1}
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        {tip}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Paper>

              {/* CTA */}
              <Paper sx={{ p: { xs: 2, md: 2.5 }, bgcolor: 'action.hover' }}>
                <Typography variant="subtitle2" component="h2" fontWeight={700}>
                  Get expert NATA coaching at Neram Classes
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  Comprehensive preparation including study materials and mock tests.
                </Typography>
                <Button
                  href="https://neramclasses.com/apply"
                  variant="outlined"
                  endIcon={<ArrowForwardIcon />}
                  sx={{ width: { xs: '100%', sm: 'auto' } }}
                >
                  Apply Now
                </Button>
              </Paper>
            </Box>
          )}
        </Box>

        {/* Fee Reference: below the result on phones, under the form on laptops */}
        <Paper sx={{ gridArea: 'fees', p: 2 }}>
          <Typography variant="subtitle2" component="h2" gutterBottom fontWeight={600}>
            Application Fees (per attempt)
          </Typography>
          {Object.entries(FEES).map(([cat, fee]) => (
            <Box key={cat} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mb: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                {cat}
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {formatCurrency(fee)}
              </Typography>
            </Box>
          ))}
        </Paper>

        {/* Info Section */}
        <Paper sx={{ gridArea: 'info', p: { xs: 2, md: 3 } }}>
          <Typography variant="h6" component="h2" gutterBottom>
            About NATA Exam Fees
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            NATA exam fees are set by the Council of Architecture (COA) and vary based on category.
            You can take up to 2 tests in Phase 1 (April to June, for CAP admissions) or 1 test in
            Phase 2 (August, for vacant seats). You cannot appear in both phases. Each test requires a
            separate fee.
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
      </Box>
    </Box>
  );
}
