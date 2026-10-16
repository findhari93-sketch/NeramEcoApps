'use client';

import { Fragment } from 'react';
import { Box } from '@neram/ui';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Link } from '@/i18n/routing';
import { tokens as t, v } from './tokens';

export interface BreadcrumbItem {
  name: string;
  href?: string;
}

/**
 * Visual breadcrumb. 13px, muted, chevron separators, current page in the
 * foreground colour. Reads the Surface's colours, so it works on dark heroes
 * and light DocHeaders alike. Keep the page's BreadcrumbList JSON-LD as is.
 */
export default function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <Box component="nav" aria-label="Breadcrumb">
      <Box
        component="ol"
        sx={{
          m: 0,
          p: 0,
          listStyle: 'none',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 0.75,
          fontSize: '0.8125rem',
          color: v.muted,
        }}
      >
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <Fragment key={`${item.name}-${i}`}>
              <Box component="li" sx={{ display: 'inline-flex', alignItems: 'center', minHeight: 24 }}>
                {item.href && !last ? (
                  <Box
                    component={Link}
                    href={item.href}
                    sx={{
                      color: 'inherit',
                      textDecoration: 'none',
                      '&:hover': { textDecoration: 'underline' },
                      '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
                    }}
                  >
                    {item.name}
                  </Box>
                ) : (
                  <Box component="span" aria-current={last ? 'page' : undefined} sx={{ color: v.fg }}>
                    {item.name}
                  </Box>
                )}
              </Box>
              {!last && (
                <Box component="li" aria-hidden sx={{ display: 'inline-flex' }}>
                  <ChevronRightIcon sx={{ fontSize: 16 }} />
                </Box>
              )}
            </Fragment>
          );
        })}
      </Box>
    </Box>
  );
}
