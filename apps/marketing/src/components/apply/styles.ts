import type { SxProps, Theme } from '@mui/material/styles';

/**
 * A choice card in the Neram Apply design: square, 2 px warm border, no
 * shadow; selected adds an ink border, a gold bar along the top and a warm
 * tint. Used by the course, programme, learning-mode, centre and category
 * cards so all of them select the same way. `extra` carries a card's own
 * layout (height, position, cursor).
 */
export function selectedCardSx(selected: boolean, extra: Record<string, string | number> = {}): SxProps<Theme> {
  return {
    borderRadius: 0,
    boxShadow: selected ? 'inset 0 4px 0 #e8a020' : 'none',
    border: '2px solid',
    borderColor: selected ? 'text.primary' : '#d9d6cf',
    bgcolor: selected ? '#fff8e8' : 'background.paper',
    transition: 'border-color 150ms, background-color 150ms',
    '&:hover': selected ? {} : { borderColor: '#a9a49a' },
    '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
    ...extra,
  } as SxProps<Theme>;
}
