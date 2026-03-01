'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Chip,
  Collapse,
  Divider,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@neram/ui';
import CalculateIcon from '@mui/icons-material/Calculate';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import type { ScoreCalculation, CalculationPurpose } from '@neram/database';

// ─── Purpose badge config ─────────────────────────────────────────────────────

type PurposeKey = CalculationPurpose | 'unknown';

const PURPOSE_CONFIG: Record<PurposeKey, { label: string; color: string; bgColor: string }> = {
  actual_score: { label: 'Actual Score', color: '#2E7D32', bgColor: '#2E7D3214' },
  prediction:   { label: 'Prediction',   color: '#1565C0', bgColor: '#1565C014' },
  target:       { label: 'Target',       color: '#E65100', bgColor: '#E6510014' },
  exploring:    { label: 'Exploring',    color: '#616161', bgColor: '#61616114' },
  unknown:      { label: 'Not set',      color: '#9E9E9E', bgColor: '#9E9E9E14' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function summarizeInputs(inputData: Record<string, unknown>): string {
  const board = (inputData.board as string) ?? '?';
  const marks = (inputData.marksSecured as number) ?? 0;
  const maxMarks = (inputData.maxMarks as number) ?? 0;
  const attempts = (inputData.attempts as Array<{ partA: number; partB: number }>) ?? [];
  const nataTotal = attempts.reduce(
    (best, a) => Math.max(best, (a.partA ?? 0) + (a.partB ?? 0)),
    0
  );
  return `${board} ${marks}/${maxMarks} · NATA best: ${nataTotal}`;
}

// ─── Expandable row ───────────────────────────────────────────────────────────

function CalcRow({ calc }: { calc: ScoreCalculation }) {
  const [expanded, setExpanded] = useState(false);
  const result = calc.result_data as Record<string, unknown>;
  const input = calc.input_data as Record<string, unknown>;
  const purposeKey = ((calc.purpose ?? 'unknown') as PurposeKey) in PURPOSE_CONFIG
    ? (calc.purpose ?? 'unknown') as PurposeKey
    : 'unknown';
  const pc = PURPOSE_CONFIG[purposeKey];

  return (
    <>
      <TableRow
        sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
        onClick={() => setExpanded((e) => !e)}
      >
        <TableCell sx={{ fontSize: 12, py: 1.25, whiteSpace: 'nowrap' }}>
          {formatDate(calc.created_at)}
        </TableCell>
        <TableCell sx={{ fontSize: 12, py: 1.25, color: 'text.secondary' }}>
          {summarizeInputs(input)}
        </TableCell>
        <TableCell sx={{ py: 1.25 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
            <Typography
              variant="body2"
              fontWeight={700}
              sx={{ fontFamily: 'monospace', fontSize: 14 }}
            >
              {String(result.finalCutoff ?? '--')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              /400
            </Typography>
          </Box>
        </TableCell>
        <TableCell sx={{ py: 1.25 }}>
          <Box>
            <Chip
              label={pc.label}
              size="small"
              sx={{
                height: 20,
                fontSize: 10,
                fontWeight: 700,
                bgcolor: pc.bgColor,
                color: pc.color,
                borderRadius: 1,
                border: `1px solid ${pc.color}30`,
              }}
            />
            {calc.label && (
              <Typography
                variant="caption"
                display="block"
                color="text.secondary"
                sx={{ mt: 0.25, fontSize: 10 }}
              >
                {calc.label}
              </Typography>
            )}
          </Box>
        </TableCell>
        <TableCell sx={{ py: 1.25 }}>
          <IconButton size="small" sx={{ p: 0.25 }}>
            {expanded ? (
              <ExpandLessIcon sx={{ fontSize: 16 }} />
            ) : (
              <ExpandMoreIcon sx={{ fontSize: 16 }} />
            )}
          </IconButton>
        </TableCell>
      </TableRow>

      {/* Expanded detail */}
      <TableRow>
        <TableCell colSpan={5} sx={{ p: 0, border: 0 }}>
          <Collapse in={expanded}>
            <Box
              sx={{
                p: 2,
                bgcolor: 'grey.50',
                borderBottom: '1px solid',
                borderColor: 'grey.200',
              }}
            >
              <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <Box sx={{ flex: 1, minWidth: 240 }}>
                  <Typography
                    variant="overline"
                    sx={{ fontSize: 10, color: 'text.secondary', display: 'block', mb: 0.5 }}
                  >
                    Inputs
                  </Typography>
                  <pre
                    style={{
                      fontSize: 11,
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {JSON.stringify(calc.input_data, null, 2)}
                  </pre>
                </Box>
                <Box sx={{ flex: 1, minWidth: 240 }}>
                  <Typography
                    variant="overline"
                    sx={{ fontSize: 10, color: 'text.secondary', display: 'block', mb: 0.5 }}
                  >
                    Results
                  </Typography>
                  <pre
                    style={{
                      fontSize: 11,
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {JSON.stringify(calc.result_data, null, 2)}
                  </pre>
                </Box>
              </Box>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

// ─── Main section component ───────────────────────────────────────────────────

interface ScoreCalculationsSectionProps {
  userId: string;
}

export function ScoreCalculationsSection({ userId }: ScoreCalculationsSectionProps) {
  const [calculations, setCalculations] = useState<ScoreCalculation[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/crm/users/${userId}/score-calculations`);
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        setCalculations(data.calculations ?? []);
        setCount(data.count ?? 0);
      } catch (err: unknown) {
        setError('Failed to load score calculations');
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  return (
    <Paper
      elevation={0}
      sx={{ border: '1px solid', borderColor: 'grey.200', borderRadius: 2, overflow: 'hidden' }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2.5,
          py: 1.75,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          bgcolor: 'grey.50',
          borderBottom: '1px solid',
          borderColor: 'grey.200',
        }}
      >
        <CalculateIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
        <Typography variant="subtitle2" fontWeight={600}>
          Score Calculations
        </Typography>
        {count > 0 && (
          <Chip
            label={count}
            size="small"
            sx={{ height: 18, fontSize: 10, ml: 'auto' }}
          />
        )}
      </Box>

      {/* Body */}
      {loading && (
        <Box sx={{ px: 2.5, py: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Loading…
          </Typography>
        </Box>
      )}

      {error && !loading && (
        <Box sx={{ px: 2.5, py: 2 }}>
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        </Box>
      )}

      {!loading && !error && calculations.length === 0 && (
        <Box sx={{ px: 2.5, py: 2 }}>
          <Typography variant="body2" color="text.secondary">
            No calculations yet.
          </Typography>
        </Box>
      )}

      {!loading && !error && calculations.length > 0 && (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell sx={{ fontSize: 11, fontWeight: 600, py: 1 }}>Date</TableCell>
                <TableCell sx={{ fontSize: 11, fontWeight: 600, py: 1 }}>Inputs</TableCell>
                <TableCell sx={{ fontSize: 11, fontWeight: 600, py: 1 }}>Cutoff</TableCell>
                <TableCell sx={{ fontSize: 11, fontWeight: 600, py: 1 }}>Purpose</TableCell>
                <TableCell sx={{ py: 1, width: 36 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {calculations.map((calc) => (
                <CalcRow key={calc.id} calc={calc} />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
}
