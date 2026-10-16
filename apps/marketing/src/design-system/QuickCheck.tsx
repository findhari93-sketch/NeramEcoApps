import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import LightScope from './surface/LightScope';
import { tokens as t } from './tokens';

export interface QuickCheckProps {
  /** Card heading, e.g. "Quick check". Rendered as an h2. */
  title: ReactNode;
  /** Small note at the right of the heading row. */
  meta?: ReactNode;
  /** Id for the heading, so the card can be `aria-labelledby` it. */
  headingId?: string;
  children: ReactNode;
}

/**
 * The white card in a dark hero's aside (T7 tool pages): heading row, the
 * inputs, a navy result block and one gold action. Light MUI theme inside,
 * so TextField, Select and Slider render for a white ground.
 */
export default function QuickCheck({ title, meta = 'No login needed', headingId, children }: QuickCheckProps) {
  return (
    <LightScope variant="card">
      <Box component="section" aria-labelledby={headingId} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography id={headingId} component="h2" sx={{ m: 0, fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.3 }}>
            {title}
          </Typography>
          {meta && (
            <Typography component="span" sx={{ fontSize: '0.8125rem', color: t.inkMuted }}>
              {meta}
            </Typography>
          )}
        </Box>
        {children}
      </Box>
    </LightScope>
  );
}

export interface QuickCheckResultProps {
  /** The big mono number (score, rank, count). Omit for a text-only result. */
  value?: ReactNode;
  /** What the number is, e.g. "Cutoff score out of 400". */
  label?: ReactNode;
  /** The verdict line under the label. */
  summary?: ReactNode;
  children?: ReactNode;
}

/** Navy result block: a gold mono number beside its label and verdict. */
export function QuickCheckResult({ value, label, summary, children }: QuickCheckResultProps) {
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        bgcolor: t.navy900,
        color: t.paper,
        borderRadius: `${t.radius}px`,
        p: 2.25,
        display: 'grid',
        gridTemplateColumns: value != null ? 'auto 1fr' : '1fr',
        columnGap: 2,
        rowGap: 0.5,
        alignItems: 'center',
      }}
    >
      {value != null && (
        <Box
          component="span"
          sx={{
            gridRow: 'span 2',
            fontFamily: t.fontMono,
            fontSize: { xs: '1.875rem', sm: '2.25rem' },
            fontWeight: 700,
            lineHeight: 1,
            color: t.gold500,
          }}
        >
          {value}
        </Box>
      )}
      {label && (
        <Typography component="span" sx={{ fontSize: '0.8125rem', color: t.paperMuted }}>
          {label}
        </Typography>
      )}
      {summary && (
        <Typography component="strong" sx={{ fontSize: '0.9375rem', fontWeight: 700, lineHeight: 1.4 }}>
          {summary}
        </Typography>
      )}
      {children && <Box sx={{ gridColumn: '1 / -1', fontSize: '0.875rem', lineHeight: 1.5, color: t.paperMuted }}>{children}</Box>}
    </Box>
  );
}
