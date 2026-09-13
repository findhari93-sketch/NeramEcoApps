'use client';

/**
 * The things a teacher needs occasionally, folded to one line each.
 *
 * Tags and the comment thread used to sit fully open under the grading controls,
 * so the rail was a long scroll of panels of equal weight and the verdict had to
 * compete with them. Each is now a single tappable row that opens in place.
 * Nothing is removed and nothing moves to another screen.
 */

import { useId, useState, type ReactNode } from 'react';
import { Box, Collapse, Typography } from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

export interface QuietLink {
  key: string;
  label: string;
  /** A short fact shown beside the label, such as a count. */
  meta?: string;
  content: ReactNode;
  defaultOpen?: boolean;
}

function QuietRow({ item }: { item: QuietLink }) {
  const [open, setOpen] = useState(!!item.defaultOpen);
  const panelId = useId();

  return (
    <Box sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
      <Box
        component="button"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        sx={{
          width: '100%',
          minHeight: 44,
          px: 0.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          justifyContent: 'flex-start',
          textAlign: 'left',
          border: 0,
          bgcolor: 'transparent',
          color: 'inherit',
          font: 'inherit',
          cursor: 'pointer',
          borderRadius: 1,
          '&:hover': { bgcolor: 'action.hover' },
          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
          {item.label}
        </Typography>
        {item.meta && (
          <Typography variant="caption" color="text.secondary">
            {item.meta}
          </Typography>
        )}
        <ExpandMoreIcon
          aria-hidden
          sx={{
            fontSize: 20,
            color: 'text.secondary',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          }}
        />
      </Box>
      <Collapse in={open} id={panelId} unmountOnExit={false}>
        <Box sx={{ pb: 1.5 }}>{item.content}</Box>
      </Collapse>
    </Box>
  );
}

export default function QuietLinksRow({ items }: { items: QuietLink[] }) {
  if (items.length === 0) return null;
  return (
    <Box sx={{ mt: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
      {items.map((item) => (
        <QuietRow key={item.key} item={item} />
      ))}
    </Box>
  );
}
