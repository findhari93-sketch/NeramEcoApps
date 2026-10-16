'use client';

import { useState } from 'react';
import { Box, TextField } from '@neram/ui';
import { CtaButton, QuickCheck, QuickCheckResult } from '@/design-system';

const FULL_TOOL = 'https://app.neramclasses.com/tools/nata/cutoff-calculator';

/** College tier for a NATA score out of 200 (same bands as the full calculator's copy). */
export function cutoffTier(nata: number): string {
  if (nata >= 150) return 'IITs and SPAs range (150+)';
  if (nata >= 130) return 'NITs range (130 to 150)';
  if (nata >= 110) return 'Top state colleges (110 to 130)';
  return 'Private colleges (below 110)';
}

/** Board % converted to /200 plus the NATA score /200 gives the cutoff /400. */
export function cutoffScore(boardPct: number, partA: number, partB: number): number {
  return Math.round(boardPct * 2 + partA + partB);
}

function parse(raw: string, max: number): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}

const fieldSx = { '& .MuiInputBase-root': { minHeight: 48 }, '& input': { fontSize: '1rem' } } as const;

export default function CutoffTeaser() {
  const [board, setBoard] = useState('');
  const [partA, setPartA] = useState('');
  const [partB, setPartB] = useState('');

  const b = parse(board, 100);
  const a = parse(partA, 80);
  const p = parse(partB, 120);
  const ready = b !== null && a !== null && p !== null;

  return (
    <QuickCheck title="Quick check" headingId="cutoff-quick-check">
      <TextField
        label="Board PCM percentage"
        type="number"
        value={board}
        onChange={(e) => setBoard(e.target.value)}
        inputProps={{ min: 0, max: 100, step: 0.1, inputMode: 'decimal' }}
        error={board !== '' && b === null}
        helperText={board !== '' && b === null ? 'Enter a percentage from 0 to 100.' : undefined}
        fullWidth
        sx={fieldSx}
      />
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
        <TextField
          label="Part A"
          type="number"
          value={partA}
          onChange={(e) => setPartA(e.target.value)}
          inputProps={{ min: 0, max: 80, inputMode: 'numeric' }}
          error={partA !== '' && a === null}
          helperText={partA !== '' && a === null ? 'Enter 0 to 80' : 'Out of 80'}
          sx={{ ...fieldSx, minWidth: 0 }}
        />
        <TextField
          label="Part B"
          type="number"
          value={partB}
          onChange={(e) => setPartB(e.target.value)}
          inputProps={{ min: 0, max: 120, inputMode: 'numeric' }}
          error={partB !== '' && p === null}
          helperText={partB !== '' && p === null ? 'Enter 0 to 120' : 'Out of 120'}
          sx={{ ...fieldSx, minWidth: 0 }}
        />
      </Box>

      {ready ? (
        <QuickCheckResult value={cutoffScore(b, a, p)} label="Cutoff score out of 400" summary={cutoffTier(a + p)} />
      ) : (
        <QuickCheckResult label="Your cutoff score out of 400" summary="Enter all three marks to see it" />
      )}

      <CtaButton href={FULL_TOOL} external fullWidth>
        See matching colleges
      </CtaButton>
    </QuickCheck>
  );
}
