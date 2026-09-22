'use client';

import { ToggleButton, ToggleButtonGroup } from '@neram/ui';

interface LangToggleProps {
  lang: 'en' | 'hi';
  onChange: (lang: 'en' | 'hi') => void;
}

/**
 * The one language switch on the practice screen.
 *
 * There used to be two: one on the page (EN / HI) and one inside the question
 * (EN / हि), each with its own state, so the list could be in Hindi while the
 * question beside it was in English. Both entry points now drive one value.
 */
export default function LangToggle({ lang, onChange }: LangToggleProps) {
  return (
    <ToggleButtonGroup
      value={lang}
      exclusive
      size="small"
      aria-label="Question language"
      onChange={(_e, val) => {
        if (val) onChange(val as 'en' | 'hi');
      }}
      sx={{
        flexShrink: 0,
        '& .MuiToggleButton-root': {
          minWidth: 44,
          minHeight: 44,
          px: 1.25,
          fontSize: '0.8125rem',
          fontWeight: 700,
          textTransform: 'none',
          '&.Mui-selected': {
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            '&:hover': { bgcolor: 'primary.dark' },
          },
        },
      }}
    >
      <ToggleButton value="en" aria-label="English">
        EN
      </ToggleButton>
      <ToggleButton value="hi" aria-label="Hindi">
        हि
      </ToggleButton>
    </ToggleButtonGroup>
  );
}
