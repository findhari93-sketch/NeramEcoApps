'use client';

import { Box } from '@neram/ui';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { LANGUAGE_LABEL, languageKeyOf } from '@/lib/student-language';
import TamilMark from './TamilMark';

/**
 * The student's language, spelled out, on the profile header.
 *
 * The avatar only marks Tamil students, so this is where English only and "not
 * set" become visible for one student. When the viewer may change it, the chip
 * is the shortcut: it opens the Set stage sheet already scrolled to Language.
 *
 * 28px visual so it sits beside the 20px stage and exam-year chips without
 * towering over them; a vertical-only ::before stretches the hit area to 44px
 * without moving the layout.
 */
export default function LanguageChip({
  knowsTamil,
  onClick,
}: {
  knowsTamil: boolean | null | undefined;
  onClick?: () => void;
}) {
  const key = languageKeyOf(knowsTamil);
  const label = LANGUAGE_LABEL[key];
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
        borderStyle: key === 'unset' ? 'dashed' : 'solid',
        borderColor: key === 'unset' ? 'text.secondary' : 'divider',
        bgcolor: 'background.paper',
        color: key === 'unset' ? 'text.secondary' : 'text.primary',
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
      {key === 'tamil' && <TamilMark size={16} />}
      <span>{label}</span>
      {interactive && <EditOutlinedIcon aria-hidden sx={{ fontSize: 14, color: 'text.secondary' }} />}
    </Box>
  );
}
