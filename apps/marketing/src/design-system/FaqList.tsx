'use client';

import { useId, useState, type ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { tokens as t, v } from './tokens';

export interface FaqItem {
  question: string;
  answer: ReactNode;
}

export interface FaqListProps {
  /** Pass the same array the page's FAQPage JSON-LD is built from. */
  items: FaqItem[];
  /** Index open on first render (default 0); -1 for all closed. */
  defaultOpen?: number;
}

/**
 * Rules, not boxes: a 1px ink top border, a 1px line under each row, 60px
 * rows, one answer open at a time, chevron rotates 180deg. Closed answers stay
 * in the HTML (hidden), so crawlers and in-page search still find them.
 */
export default function FaqList({ items, defaultOpen = 0 }: FaqListProps) {
  const [open, setOpen] = useState(defaultOpen);
  const baseId = useId();

  return (
    <Box sx={{ borderTop: `1px solid ${v.fg}` }}>
      {items.map((item, i) => {
        const isOpen = open === i;
        const buttonId = `${baseId}-q${i}`;
        const panelId = `${baseId}-a${i}`;
        return (
          <Box key={item.question} sx={{ borderBottom: `1px solid ${v.line}` }}>
            <Typography component="h3" sx={{ m: 0 }}>
              <Box
                component="button"
                type="button"
                id={buttonId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? -1 : i)}
                sx={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 2,
                  minHeight: 60,
                  py: 1.5,
                  px: 0,
                  border: 0,
                  bgcolor: 'transparent',
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: v.fg,
                  font: 'inherit',
                  fontSize: '1.0625rem',
                  fontWeight: 700,
                  lineHeight: 1.4,
                  '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
                }}
              >
                {item.question}
                <ExpandMoreIcon
                  aria-hidden
                  sx={{
                    flexShrink: 0,
                    transition: 'transform 200ms ease',
                    transform: isOpen ? 'rotate(180deg)' : 'none',
                    '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                  }}
                />
              </Box>
            </Typography>
            <Box
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              hidden={!isOpen}
              sx={{ pr: { xs: 0, sm: 5 }, pb: 2.25, fontSize: '1rem', lineHeight: 1.6, color: v.muted }}
            >
              {item.answer}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
