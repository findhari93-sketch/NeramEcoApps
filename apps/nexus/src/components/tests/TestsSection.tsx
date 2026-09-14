'use client';

/**
 * One labelled block of test cards.
 *
 * The subtitle is optional and should usually stay unset. Most of the ones this
 * screen carried were teacher-voice documentation reprinted on every load
 * ("Model tests with a fixed start and end time. Rank appears once results are
 * out."), which a student reads once and then scrolls past forever. On a 375px
 * phone that prose was costing more vertical space than the cards it introduced.
 * Say it in the card, or do not say it.
 *
 * The count is the thing worth showing: a student wants to know how many, and a
 * zero count is a complete empty state on its own.
 */

import { Box, Typography } from '@neram/ui';

export default function TestsSection({
  icon,
  title,
  subtitle,
  count,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  /** Shown beside the title. Pass 0 deliberately: an empty section still counts. */
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Box component="section" sx={{ mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Box sx={{ color: 'primary.main', display: 'flex' }} aria-hidden>
          {icon}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
            {title}
            {count != null && (
              <Typography component="span" variant="subtitle1" color="text.secondary" sx={{ fontWeight: 700, ml: 0.75 }}>
                {count}
              </Typography>
            )}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        {action}
      </Box>
      {children}
    </Box>
  );
}
