'use client';

import { Box } from '@neram/ui';
import { alpha } from '@mui/material/styles';
import SubdirectoryArrowRightRoundedIcon from '@mui/icons-material/SubdirectoryArrowRightRounded';

/** Follow-up questions under the latest answer. One tap asks it. */
export default function SuggestionChips({
  suggestions,
  onPick,
  disabled,
  center,
  label = 'Suggested follow-up questions',
}: {
  suggestions: string[];
  onPick: (question: string) => void;
  disabled?: boolean;
  center?: boolean;
  label?: string;
}) {
  if (!suggestions.length) return null;
  return (
    <Box
      role="group"
      aria-label={label}
      data-testid="aintra-suggestions"
      sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: center ? 'center' : 'flex-start' }}
    >
      {suggestions.map((q) => (
        <Box
          key={q}
          component="button"
          type="button"
          disabled={disabled}
          onClick={() => onPick(q)}
          sx={(theme) => ({
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            minHeight: 44,
            px: 1.75,
            py: 0.75,
            border: '1px solid',
            borderColor: alpha(theme.palette.primary.main, 0.35),
            borderRadius: 999,
            bgcolor: alpha(theme.palette.primary.main, 0.04),
            color: 'primary.main',
            font: 'inherit',
            fontSize: '0.875rem',
            fontWeight: 600,
            lineHeight: 1.3,
            textAlign: 'left',
            cursor: 'pointer',
            transition: 'background-color 150ms ease, border-color 150ms ease',
            '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.1), borderColor: 'primary.main' },
            '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
            '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
            '& svg': { fontSize: 16, flexShrink: 0 },
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          })}
        >
          <SubdirectoryArrowRightRoundedIcon aria-hidden />
          {q}
        </Box>
      ))}
    </Box>
  );
}
