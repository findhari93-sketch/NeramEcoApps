'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { Box, Button, Typography } from '@neram/ui';
import OpenInFullRoundedIcon from '@mui/icons-material/OpenInFullRounded';
import type { TableAlign } from '@/lib/aintra/rich/parse';
import { plainInline } from '@/lib/aintra/rich/parse';
import InlineText from './InlineText';
import CopyButton from './CopyButton';

/** Below this width a table cannot be read on a phone, so it becomes cards. */
const TABLE_MIN_WIDTH = 480;
const MAX_TABLE_COLUMNS = 5;
const NUMERIC = /^[₹$]?\s?[\d,.]+\s?(%|L|lakhs?|cr|k|months?|years?|marks?)?$/i;

interface Props {
  header: string[];
  align: TableAlign[];
  rows: string[][];
  variant: 'chat' | 'canvas';
  onOpenCanvas?: () => void;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * A comparison table that stays readable at any width.
 *
 * Wide enough: a real table with a tinted header, numbers right-aligned in
 * tabular figures, and its own horizontal scroll so the chat never scrolls
 * sideways. On a phone: one card per row, the first column as the card title
 * and the rest as label/value pairs.
 */
export default function AintraTable({ header, align, rows, variant, onOpenCanvas }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const asTable = variant === 'canvas' || (width >= TABLE_MIN_WIDTH && header.length <= MAX_TABLE_COLUMNS);
  const offerCanvas = variant === 'chat' && !!onOpenCanvas && (rows.length > 3 || header.length > 3);
  const numericCol = header.map((_, c) => rows.length > 0 && rows.every((r) => !r[c] || NUMERIC.test(plainInline(r[c]))));

  const copy = () => [header, ...rows].map((r) => r.map(plainInline).join('\t')).join('\n');

  return (
    <Box ref={ref} sx={{ width: '100%', minWidth: 0 }}>
      {asTable ? (
        <Box
          role="region"
          aria-label="Table"
          tabIndex={0}
          sx={{
            overflowX: 'auto',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            bgcolor: 'background.paper',
            '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
          }}
        >
          <Box
            component="table"
            sx={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: variant === 'canvas' ? '1rem' : '0.9375rem',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <thead>
              <tr>
                {header.map((h, c) => (
                  <Box
                    component="th"
                    scope="col"
                    key={c}
                    sx={{
                      textAlign: numericCol[c] ? 'right' : align[c] ?? 'left',
                      px: 1.75,
                      py: 1.25,
                      bgcolor: 'grey.50',
                      color: 'text.secondary',
                      fontWeight: 600,
                      fontSize: '0.8125rem',
                      letterSpacing: '0.01em',
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      whiteSpace: 'nowrap',
                      ...(c === 0 && { position: 'sticky', left: 0, zIndex: 1 }),
                    }}
                  >
                    <InlineText text={h} />
                  </Box>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <Box component="tr" key={r} sx={{ '&:not(:last-of-type) td, &:not(:last-of-type) th': { borderBottom: '1px solid', borderColor: 'divider' } }}>
                  {row.map((cell, c) => {
                    const isMoney = /₹/.test(cell);
                    return (
                      <Box
                        component={c === 0 ? 'th' : 'td'}
                        {...(c === 0 ? { scope: 'row' } : {})}
                        key={c}
                        sx={{
                          textAlign: numericCol[c] ? 'right' : align[c] ?? 'left',
                          px: 1.75,
                          py: 1.25,
                          height: 44,
                          fontWeight: c === 0 ? 600 : isMoney ? 600 : 400,
                          color: 'text.primary',
                          whiteSpace: numericCol[c] ? 'nowrap' : 'normal',
                          minWidth: c === 0 ? 120 : 88,
                          ...(c === 0 && { position: 'sticky', left: 0, bgcolor: 'background.paper', zIndex: 1 }),
                        }}
                      >
                        <InlineText text={cell} />
                      </Box>
                    );
                  })}
                </Box>
              ))}
            </tbody>
          </Box>
        </Box>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 1 }}>
          {rows.map((row, r) => (
            <Box
              component="li"
              key={r}
              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', px: 1.75, py: 1.5 }}
            >
              <Typography component="p" sx={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1.4, mb: row.length > 1 ? 0.75 : 0 }}>
                <InlineText text={row[0] || '(untitled)'} />
              </Typography>
              <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: 2, rowGap: 0.5 }}>
                {row.slice(1).map((cell, c) => (
                  <Box key={c} sx={{ display: 'contents' }}>
                    <Box component="dt" sx={{ color: 'text.secondary', fontSize: '0.875rem', lineHeight: 1.5 }}>
                      <InlineText text={header[c + 1] ?? ''} />
                    </Box>
                    <Box
                      component="dd"
                      sx={{
                        m: 0,
                        textAlign: 'right',
                        fontSize: '0.9375rem',
                        lineHeight: 1.5,
                        fontWeight: /₹/.test(cell) ? 700 : 500,
                        fontVariantNumeric: 'tabular-nums',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      <InlineText text={cell || 'Not available'} />
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {variant === 'chat' && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5, mt: 0.5 }}>
          {offerCanvas && (
            <Button
              size="small"
              onClick={onOpenCanvas}
              startIcon={<OpenInFullRoundedIcon sx={{ fontSize: 16 }} />}
              sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600, px: 1.5 }}
            >
              Open in canvas
            </Button>
          )}
          <CopyButton getText={copy} label="Copy table" />
        </Box>
      )}
    </Box>
  );
}
