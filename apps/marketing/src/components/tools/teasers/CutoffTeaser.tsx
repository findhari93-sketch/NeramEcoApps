'use client';

import { useMemo, useState } from 'react';
import { Box, Button, MenuItem, TextField, Typography } from '@neram/ui';
import {
  BOARD_CONFIG,
  calculateBestNataScore,
  checkBoardEligibility,
  convertBoardMarks,
  cutoffPrefillQuery,
  type BoardType,
} from '@neram/tools-core/cutoff';
import { CtaButton, QuickCheck, QuickCheckResult } from '@/design-system';
import { APP_URL } from '@/lib/seo/constants';

const FULL_TOOL = `${APP_URL}/tools/nata/cutoff-calculator`;
const ASK = `${APP_URL}/ask`;

/** NATA 2026: Part A (drawing) is out of 80, Part B (MCQ) out of 120. */
const PART_MAX = { a: 80, b: 120 } as const;

function parse(raw: string, max: number): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}

const fieldSx = { '& .MuiInputBase-root': { minHeight: 48 }, '& input': { fontSize: '1rem' } } as const;

/**
 * The free NATA cutoff calculator on neramclasses.com/tools/cutoff-calculator.
 * Same maths as the app (@neram/tools-core): each board's real maximum marks,
 * the best of two NATA attempts, the 45% check. "See colleges" opens Ask
 * aiArchitek with the score; "Open the full calculator" carries every value.
 */
export default function CutoffTeaser() {
  const [board, setBoard] = useState<BoardType>('CBSE');
  const [maxMarks, setMaxMarks] = useState(String(BOARD_CONFIG.CBSE.maxMarks));
  const [marks, setMarks] = useState('');
  const [attempts, setAttempts] = useState([{ a: '', b: '' }]);

  const max = parse(maxMarks, 2000);
  const secured = max ? parse(marks, max) : null;
  const parsed = attempts.map((t) => ({ a: parse(t.a, PART_MAX.a), b: parse(t.b, PART_MAX.b) }));
  const anyNata = parsed.some((p) => p.a !== null || p.b !== null);

  const result = useMemo(() => {
    if (!max || secured === null || !anyNata) return null;
    const best = calculateBestNataScore(
      parsed.map((p) => ({ partA: String(p.a ?? 0), partB: String(p.b ?? 0) })),
      false,
      0
    );
    const board200 = convertBoardMarks(secured, max);
    return {
      total: Math.round((board200 + best.bestScore) * 100) / 100,
      board200,
      nata: best.bestScore,
      percent: Math.round((secured / max) * 1000) / 10,
      eligible: checkBoardEligibility(secured, max),
      attemptsUsed: parsed.filter((p) => (p.a ?? 0) + (p.b ?? 0) > 0).length,
    };
    // parsed is rebuilt each render from attempts; attempts is the real input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [max, secured, anyNata, attempts]);

  const bestAttempt = parsed.reduce((best, p) => ((p.a ?? 0) + (p.b ?? 0) > (best.a ?? 0) + (best.b ?? 0) ? p : best), parsed[0]);
  const query = cutoffPrefillQuery({
    board,
    maxMarks: max ?? undefined,
    marksSecured: secured ?? undefined,
    partA: bestAttempt?.a ?? undefined,
    partB: bestAttempt?.b ?? undefined,
  });
  const askHref = result
    ? `${ASK}?q=${encodeURIComponent(`Which B.Arch colleges can I get with a cutoff of ${result.total} out of 400?`)}&${query}`
    : ASK;

  const setAttempt = (i: number, key: 'a' | 'b', value: string) =>
    setAttempts((prev) => prev.map((t, j) => (j === i ? { ...t, [key]: value.replace(/[^\d.]/g, '') } : t)));

  return (
    <QuickCheck title="NATA cutoff calculator" headingId="cutoff-quick-check" meta="Free, no login">
      <TextField
        select
        label="12th board"
        value={board}
        onChange={(e) => {
          const b = e.target.value as BoardType;
          setBoard(b);
          setMaxMarks(String(BOARD_CONFIG[b].maxMarks));
        }}
        fullWidth
        sx={fieldSx}
      >
        {(Object.keys(BOARD_CONFIG) as BoardType[]).map((b) => (
          <MenuItem key={b} value={b} sx={{ minHeight: 44 }}>
            {BOARD_CONFIG[b].label}
          </MenuItem>
        ))}
      </TextField>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
        <TextField
          label="Marks scored"
          value={marks}
          onChange={(e) => setMarks(e.target.value.replace(/[^\d.]/g, ''))}
          inputProps={{ inputMode: 'decimal' }}
          error={marks !== '' && secured === null}
          helperText={marks !== '' && secured === null ? `0 to ${maxMarks || 'max'}` : ' '}
          sx={{ ...fieldSx, minWidth: 0 }}
        />
        <TextField
          label="Out of"
          value={maxMarks}
          onChange={(e) => setMaxMarks(e.target.value.replace(/[^\d]/g, ''))}
          inputProps={{ inputMode: 'numeric' }}
          helperText="Board total"
          sx={{ ...fieldSx, minWidth: 0 }}
        />
      </Box>

      {attempts.map((t, i) => (
        <Box key={i} sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
          <TextField
            label={attempts.length > 1 ? `Attempt ${i + 1}: Part A` : 'NATA Part A'}
            value={t.a}
            onChange={(e) => setAttempt(i, 'a', e.target.value)}
            inputProps={{ inputMode: 'decimal' }}
            error={t.a !== '' && parsed[i].a === null}
            helperText={t.a !== '' && parsed[i].a === null ? 'Enter 0 to 80' : 'Out of 80'}
            sx={{ ...fieldSx, minWidth: 0 }}
          />
          <TextField
            label={attempts.length > 1 ? `Attempt ${i + 1}: Part B` : 'NATA Part B'}
            value={t.b}
            onChange={(e) => setAttempt(i, 'b', e.target.value)}
            inputProps={{ inputMode: 'decimal' }}
            error={t.b !== '' && parsed[i].b === null}
            helperText={t.b !== '' && parsed[i].b === null ? 'Enter 0 to 120' : 'Out of 120'}
            sx={{ ...fieldSx, minWidth: 0 }}
          />
        </Box>
      ))}
      <Button
        variant="text"
        onClick={() => setAttempts((prev) => (prev.length === 1 ? [...prev, { a: '', b: '' }] : prev.slice(0, 1)))}
        sx={{ alignSelf: 'flex-start', minHeight: 44, textTransform: 'none', color: 'inherit', textDecoration: 'underline', textUnderlineOffset: '3px' }}
      >
        {attempts.length === 1 ? 'I took NATA twice' : 'Remove second attempt'}
      </Button>

      <Box aria-live="polite">
        {result ? (
          <QuickCheckResult
            value={result.total}
            label="Your cutoff out of 400"
            summary={
              <>
                Board {result.board200} of 200 plus NATA {result.nata} of 200
                {result.attemptsUsed > 1 ? ' (your better attempt)' : ''}.{' '}
                {result.eligible
                  ? `${result.percent}% in 12th meets the 45% B.Arch rule.`
                  : `${result.percent}% in 12th is below the 45% B.Arch rule.`}
              </>
            }
          />
        ) : (
          <QuickCheckResult label="Your cutoff out of 400" summary="Enter your 12th marks and a NATA score to see it" />
        )}
      </Box>

      <CtaButton href={askHref} external fullWidth>
        {result ? `See colleges for ${Math.round(result.total)} out of 400` : 'See matching colleges'}
      </CtaButton>
      <Typography component="p" sx={{ m: 0, fontSize: '0.8125rem', lineHeight: 1.5, opacity: 0.85 }}>
        Opens Aintra with your score: real TNEA, KEAM and JoSAA closing marks, not guesses.{' '}
        <Box
          component="a"
          href={query ? `${FULL_TOOL}?${query}` : FULL_TOOL}
          sx={{ color: 'inherit', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: '3px' }}
        >
          Open the full calculator
        </Box>
      </Typography>
    </QuickCheck>
  );
}
