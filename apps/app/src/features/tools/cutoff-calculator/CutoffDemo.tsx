'use client';

import { useMemo, useState } from 'react';
import { Box, MenuItem, TextField, Typography } from '@neram/ui';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import DemoGate from '@/components/tools/DemoGate';
import { BOARD_CONFIG, cutoffTotal, type BoardType } from '@/lib/tools/cutoff-formula';

const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Public demo: one board, one NATA attempt, the real total out of 400. The full
 * calculator (signed in) adds attempts, last year's score, saving and colleges.
 */
export default function CutoffDemo() {
  const [board, setBoard] = useState<BoardType>('CBSE');
  const [maxMarks, setMaxMarks] = useState(String(BOARD_CONFIG.CBSE.maxMarks));
  const [marks, setMarks] = useState('');
  const [partA, setPartA] = useState('');
  const [partB, setPartB] = useState('');

  const errors = {
    marks: marks !== '' && (num(marks) < 0 || num(marks) > num(maxMarks)) ? `Enter a number from 0 to ${maxMarks}` : '',
    partA: partA !== '' && (num(partA) < 0 || num(partA) > 200) ? 'Enter 0 to 200' : '',
    partB: partB !== '' && (num(partB) < 0 || num(partB) > 200) ? 'Enter 0 to 200' : '',
    sum: num(partA) + num(partB) > 200 ? 'Part A and Part B together cannot be more than 200' : '',
  };
  const ready =
    num(maxMarks) > 0 && num(marks) >= 0 && marks !== '' && (partA !== '' || partB !== '') && !Object.values(errors).some(Boolean);

  const result = useMemo(
    () =>
      ready
        ? cutoffTotal({
            marksSecured: num(marks),
            maxMarks: num(maxMarks),
            partA: num(partA) || 0,
            partB: num(partB) || 0,
          })
        : null,
    [ready, marks, maxMarks, partA, partB]
  );

  const fieldSx = { '& .MuiInputBase-root': { minHeight: 48 } };

  return (
    <Box>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        <TextField
          select
          label="12th board"
          value={board}
          onChange={(e) => {
            const b = e.target.value as BoardType;
            setBoard(b);
            setMaxMarks(String(BOARD_CONFIG[b].maxMarks));
          }}
          sx={fieldSx}
        >
          {(Object.keys(BOARD_CONFIG) as BoardType[]).map((b) => (
            <MenuItem key={b} value={b} sx={{ minHeight: 44 }}>
              {BOARD_CONFIG[b].label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Maximum marks"
          value={maxMarks}
          onChange={(e) => setMaxMarks(e.target.value.replace(/[^\d]/g, ''))}
          inputProps={{ inputMode: 'numeric', 'aria-describedby': 'cutoff-max-help' }}
          helperText={<span id="cutoff-max-help">Total of the subjects your board counts</span>}
          sx={fieldSx}
        />
        <TextField
          label="Marks you scored"
          value={marks}
          onChange={(e) => setMarks(e.target.value.replace(/[^\d.]/g, ''))}
          inputProps={{ inputMode: 'decimal' }}
          error={!!errors.marks}
          helperText={errors.marks || ' '}
          sx={fieldSx}
        />
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr 1fr' }}>
          <TextField
            label="NATA Part A"
            value={partA}
            onChange={(e) => setPartA(e.target.value.replace(/[^\d.]/g, ''))}
            inputProps={{ inputMode: 'decimal' }}
            error={!!errors.partA}
            helperText={errors.partA || ' '}
            sx={fieldSx}
          />
          <TextField
            label="NATA Part B"
            value={partB}
            onChange={(e) => setPartB(e.target.value.replace(/[^\d.]/g, ''))}
            inputProps={{ inputMode: 'decimal' }}
            error={!!errors.partB}
            helperText={errors.partB || ' '}
            sx={fieldSx}
          />
        </Box>
      </Box>
      {errors.sum && (
        <Typography role="alert" variant="body2" sx={{ color: 'error.main', mt: 0.5 }}>
          {errors.sum}
        </Typography>
      )}

      {/* Space is reserved so the page does not jump when the result appears. */}
      <Box aria-live="polite" sx={{ mt: 2, minHeight: 120 }}>
        {result ? (
          <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: 'action.hover' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Your B.Arch cutoff
            </Typography>
            <Typography component="p" sx={{ fontSize: { xs: '2rem', md: '2.25rem' }, fontWeight: 800, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>
              {result.total}
              <Typography component="span" sx={{ fontSize: '1rem', fontWeight: 600, color: 'text.secondary', ml: 0.75 }}>
                out of 400
              </Typography>
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Board {result.boardOutOf200} of 200 plus NATA {result.nataOutOf200} of 200
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', mt: 1 }}>
              {result.boardEligible ? (
                <CheckCircleRoundedIcon aria-hidden="true" sx={{ fontSize: 20, color: 'success.main' }} />
              ) : (
                <ErrorOutlineRoundedIcon aria-hidden="true" sx={{ fontSize: 20, color: 'error.main' }} />
              )}
              <Typography variant="body2">
                {result.boardEligible
                  ? `${result.boardPercent}% in 12th meets the 45% B.Arch rule`
                  : `${result.boardPercent}% in 12th is below the 45% B.Arch rule`}
              </Typography>
            </Box>
          </Box>
        ) : (
          <Typography variant="body2" sx={{ color: 'text.secondary', p: 2, borderRadius: 2.5, border: '1px dashed', borderColor: 'divider' }}>
            Enter your 12th marks and a NATA score to see your cutoff out of 400.
          </Typography>
        )}
      </Box>

      {result && (
        <DemoGate
          toolId="nata-cutoff-calculator"
          headline={`See which colleges accept ${Math.round(result.total)} out of 400`}
          benefits={['Best of all your NATA attempts and last year\'s score', 'Colleges that match your cutoff', 'Saved on every device']}
          cta="Sign in free to continue"
          input={{ board, maxMarks: num(maxMarks), marksSecured: num(marks), partA: num(partA) || 0, partB: num(partB) || 0 }}
        />
      )}
    </Box>
  );
}
