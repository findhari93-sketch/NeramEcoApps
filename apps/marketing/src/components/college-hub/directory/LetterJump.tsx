'use client';

import { Box } from '@mui/material';
import { alpha } from '@mui/material/styles';

interface Props {
  available: Set<string>;
  current?: string;
  onPick: (letter: string | undefined) => void;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** "Jump to" A to Z filter (canvas: Desktop · List view). Desktop only. */
export default function LetterJump({ available, current, onPick }: Props) {
  if (available.size < 4) return null;
  return (
    <Box
      component="nav"
      aria-label="Filter by first letter"
      sx={{ display: { xs: 'none', md: 'flex' }, flexWrap: 'wrap', alignItems: 'center', gap: 0.25, mb: 2, px: 1.25, py: 0.75, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
    >
      <Box component="span" sx={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', color: 'text.secondary', mr: 1, textTransform: 'uppercase' }}>
        Jump to
      </Box>
      {current && (
        <Box
          component="button"
          type="button"
          onClick={() => onPick(undefined)}
          sx={{ height: 36, px: 1, mr: 0.5, border: 0, borderRadius: 1, bgcolor: 'transparent', color: 'primary.dark', font: 'inherit', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' } }}
        >
          All
        </Box>
      )}
      {LETTERS.map((ch) => {
        const has = available.has(ch);
        const on = current === ch;
        if (!has) {
          return (
            <Box key={ch} component="span" aria-hidden sx={{ width: 32, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.82rem', color: 'text.disabled' }}>
              {ch}
            </Box>
          );
        }
        return (
          <Box
            key={ch}
            component="button"
            type="button"
            aria-pressed={on}
            aria-label={`Colleges starting with ${ch}`}
            onClick={() => onPick(on ? undefined : ch)}
            sx={{ width: 32, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 1, bgcolor: (t) => (on ? t.palette.primary.main : 'transparent'), color: on ? 'primary.contrastText' : 'primary.dark', font: 'inherit', fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer', '&:hover': { bgcolor: (t) => (on ? t.palette.primary.dark : alpha(t.palette.primary.main, 0.08)) }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' } }}
          >
            {ch}
          </Box>
        );
      })}
    </Box>
  );
}
