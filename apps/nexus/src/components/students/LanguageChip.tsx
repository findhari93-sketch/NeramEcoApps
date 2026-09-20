'use client';

import { Box } from '@neram/ui';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { languageKeyOf, languageLabel, showsLanguageMark } from '@/lib/student-language';
import LanguageMark from './LanguageMark';

/**
 * The student's language, spelled out, on the profile header.
 *
 * The avatar marks every language but English, so this is where a plain English
 * student's language becomes visible at all, and where "Tamil, limited English"
 * gets the words the corner mark can only hint at. When the viewer may change it,
 * the chip is the shortcut: it opens the Set stage sheet already scrolled to
 * Language.
 *
 * English is drawn quietly, because it is what most students are and a profile
 * should not shout the default back at you. A recorded language is not quiet.
 *
 * 28px visual so it sits beside the 20px stage and exam-year chips without
 * towering over them; a vertical-only ::before stretches the hit area to 44px
 * without moving the layout.
 */
export default function LanguageChip({
  language,
  limitedEnglish = false,
  onClick,
}: {
  language: string | null | undefined;
  limitedEnglish?: boolean | null;
  onClick?: () => void;
}) {
  const key = languageKeyOf(language);
  const limited = limitedEnglish === true;
  const label = languageLabel(language, limited);
  const quiet = !showsLanguageMark(key, limited);
  const interactive = !!onClick;

  return (
    <Box
      component={interactive ? 'button' : 'span'}
      {...(interactive
        ? { type: 'button' as const, onClick, 'aria-label': `${label}. Change language` }
        : {})}
      data-testid="language-chip"
      sx={{
        appearance: 'none',
        font: 'inherit',
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        height: 28,
        px: 1,
        borderRadius: 999,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        color: quiet ? 'text.secondary' : 'text.primary',
        fontSize: '0.75rem',
        fontWeight: 700,
        whiteSpace: 'nowrap',
        cursor: interactive ? 'pointer' : 'default',
        '&::before': interactive
          ? { content: '""', position: 'absolute', left: 0, right: 0, top: -8, bottom: -8 }
          : undefined,
        '&:hover': interactive ? { borderColor: 'text.secondary' } : undefined,
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
      }}
    >
      <LanguageMark language={key} limitedEnglish={limited} size={16} />
      <span>{label}</span>
      {interactive && <EditOutlinedIcon aria-hidden sx={{ fontSize: 14, color: 'text.secondary' }} />}
    </Box>
  );
}
