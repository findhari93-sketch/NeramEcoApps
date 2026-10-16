'use client';

import { Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import CutoffSparkline from './CutoffSparkline';
import { CUTOFF_TYPE_LABELS, type CutoffTable } from '@/lib/college-hub/detail-content';
import type { CollegeCutoff } from '@/lib/college-hub/types';
import { tokens } from '@/design-system';

interface CutoffTablesProps {
  tables: CutoffTable[];
  cutoffs: CollegeCutoff[];
}

/**
 * One small table per counselling system: last three years by category.
 * Plain HTML table so the numbers are in the server HTML; the trend chart is
 * an extra, shown only when a category has two or more years.
 */
export default function CutoffTables({ tables, cutoffs }: CutoffTablesProps) {
  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      {tables.map((t) => (
        <Box key={t.system}>
          <Typography component="h3" sx={{ fontSize: '1rem', fontWeight: 700, mb: 1 }}>
            {t.label} {CUTOFF_TYPE_LABELS[t.cutoffType]?.toLowerCase() ?? 'cutoff'}
          </Typography>
          <TableContainer sx={{ border: '1px solid', borderColor: tokens.line, borderRadius: 1, overflowX: 'auto' }}>
            <Table size="small" aria-label={`${t.label} cutoffs by category and year`}>
              <TableHead>
                <TableRow>
                  <TableCell component="th" scope="col" sx={{ fontWeight: 700 }}>
                    Category
                  </TableCell>
                  {t.years.map((y) => (
                    <TableCell key={y} component="th" scope="col" align="right" sx={{ fontWeight: 700 }}>
                      {y}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {t.rows.map((r) => (
                  <TableRow key={r.category}>
                    <TableCell component="th" scope="row" sx={{ fontSize: '0.9375rem' }}>
                      {r.label}
                    </TableCell>
                    {r.values.map((v, i) => (
                      <TableCell key={t.years[i]} align="right" sx={{ fontSize: '0.9375rem', fontVariantNumeric: 'tabular-nums' }}>
                        {v ?? <span aria-label="No data">-</span>}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {t.trendPoints >= 2 && (
            <Box sx={{ mt: 2 }}>
              <CutoffSparkline cutoffs={cutoffs} counselingSystem={t.system} category={t.trendCategory} />
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}
