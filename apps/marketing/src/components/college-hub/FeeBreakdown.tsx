import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { FEE_CATEGORY_LABELS } from '@/lib/college-hub/constants';
import type { CollegeFee } from '@/lib/college-hub/types';

interface FeeBreakdownProps {
  fees: CollegeFee[];
}

function formatFee(amount: number | null): string {
  if (amount === null || amount === undefined) return '—';
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(0)}K`;
  return `₹${amount}`;
}

function totalPerYear(fee: CollegeFee): number {
  return (
    (fee.tuition ?? 0) +
    (fee.hostel ?? 0) +
    (fee.mess ?? 0) +
    (fee.exam_fees ?? 0) +
    (fee.lab_fees ?? 0) +
    (fee.library_fees ?? 0) +
    (fee.other_fees ?? 0)
  );
}

export default function FeeBreakdown({ fees }: FeeBreakdownProps) {
  // Group by academic_year, pick latest
  const years = [...new Set(fees.map((f) => f.academic_year))].sort((a, b) => b.localeCompare(a));
  const categories = [...new Set(fees.map((f) => f.fee_category))];
  const [selectedYear, setSelectedYear] = useState(years[0] ?? '');
  const [selectedCategory, setSelectedCategory] = useState<string>(
    categories.includes('general') ? 'general' : (categories[0] ?? 'general')
  );

  if (fees.length === 0) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">Fee details not yet available for this college.</Typography>
      </Box>
    );
  }

  const filtered = fees.filter(
    (f) => f.academic_year === selectedYear && f.fee_category === selectedCategory
  );

  const grandTotal = filtered.reduce((sum, f) => sum + totalPerYear(f), 0);

  return (
    <Box>
      {/* Year selector */}
      {years.length > 1 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
            Academic Year
          </Typography>
          <ToggleButtonGroup
            value={selectedYear}
            exclusive
            onChange={(_, v) => v && setSelectedYear(v)}
            size="small"
          >
            {years.map((y) => (
              <ToggleButton key={y} value={y} sx={{ fontSize: '0.75rem', py: 0.75 }}>
                {y}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      )}

      {/* Category selector */}
      {categories.length > 1 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
            Category
          </Typography>
          <ToggleButtonGroup
            value={selectedCategory}
            exclusive
            onChange={(_, v) => v && setSelectedCategory(v)}
            size="small"
            sx={{ flexWrap: 'wrap', gap: 0.5 }}
          >
            {categories.map((c) => (
              <ToggleButton key={c} value={c} sx={{ fontSize: '0.75rem', py: 0.75 }}>
                {FEE_CATEGORY_LABELS[c] ?? c}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      )}

      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#f8fafc' }}>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem' }}>Year</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>Tuition</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.8rem', display: { xs: 'none', sm: 'table-cell' } }}>Hostel</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.8rem', display: { xs: 'none', md: 'table-cell' } }}>Other</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>Total/Year</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  <Typography variant="caption" color="text.secondary">
                    No fee data for this combination.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((fee) => (
                <TableRow key={fee.id} hover>
                  <TableCell sx={{ fontSize: '0.85rem' }}>Year {fee.year_number}</TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.85rem' }}>{formatFee(fee.tuition)}</TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.85rem', display: { xs: 'none', sm: 'table-cell' } }}>
                    {formatFee((fee.hostel ?? 0) + (fee.mess ?? 0))}
                  </TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.85rem', display: { xs: 'none', md: 'table-cell' } }}>
                    {formatFee((fee.exam_fees ?? 0) + (fee.lab_fees ?? 0) + (fee.library_fees ?? 0) + (fee.other_fees ?? 0))}
                  </TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    {formatFee(totalPerYear(fee))}
                  </TableCell>
                </TableRow>
              ))
            )}
            {filtered.length > 1 && (
              <TableRow sx={{ bgcolor: '#f0fdf4' }}>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem' }} colSpan={3}>
                  5-Year Total
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.9rem', display: { xs: 'none', md: 'table-cell' } }} />
                <TableCell align="right" sx={{ fontWeight: 800, fontSize: '0.9rem', color: 'success.dark' }}>
                  {formatFee(grandTotal)}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
