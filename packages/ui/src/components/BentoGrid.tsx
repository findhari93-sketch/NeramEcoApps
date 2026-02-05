'use client';

import React from 'react';
import { Box, BoxProps, styled } from '@mui/material';
import { m3Elevation, m3LightScheme, m3Motion } from '../theme/brand-2025';

// ============================================
// BENTO GRID - Material 3 Style
// ============================================

interface BentoGridProps extends Omit<BoxProps, 'children'> {
  /** Number of columns (default: 4) */
  columns?: 1 | 2 | 3 | 4 | 6;
  /** Gap between items in spacing units (default: 3 = 24px) */
  gap?: number;
  /** Children must be BentoItem components */
  children: React.ReactNode;
}

interface BentoItemProps extends BoxProps {
  /** Column span (default: 1) */
  span?: 1 | 2 | 3 | 4;
  /** Row span (default: 1) */
  rowSpan?: 1 | 2;
  /** Featured item styling */
  featured?: boolean;
  /** Clickable item */
  clickable?: boolean;
}

// Styled grid container
const StyledBentoGrid = styled(Box)<{ columns: number; gap: number }>(
  ({ theme, columns, gap }) => ({
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap: theme.spacing(gap),
    width: '100%',

    // Responsive columns
    [theme.breakpoints.down('lg')]: {
      gridTemplateColumns: columns > 3 ? 'repeat(3, 1fr)' : `repeat(${columns}, 1fr)`,
    },
    [theme.breakpoints.down('md')]: {
      gridTemplateColumns: columns > 2 ? 'repeat(2, 1fr)' : `repeat(${columns}, 1fr)`,
    },
    [theme.breakpoints.down('sm')]: {
      gridTemplateColumns: '1fr',
    },
  })
);

// Styled grid item
const StyledBentoItem = styled(Box)<{
  span: number;
  rowSpan: number;
  featured: boolean;
  clickable: boolean;
}>(({ theme, span, rowSpan, featured, clickable }) => ({
  gridColumn: `span ${span}`,
  gridRow: `span ${rowSpan}`,
  borderRadius: theme.shape.borderRadius * 2,
  backgroundColor: m3LightScheme.surfaceContainerLow,
  border: `1px solid ${m3LightScheme.outlineVariant}`,
  padding: theme.spacing(3),
  position: 'relative',
  overflow: 'hidden',

  // Material 3 elevation
  '&::before': {
    content: '""',
    position: 'absolute',
    inset: 0,
    backgroundColor: m3Elevation.level1,
    pointerEvents: 'none',
  },

  // Featured styling
  ...(featured && {
    backgroundColor: m3LightScheme.primaryContainer,
    borderColor: m3LightScheme.primary,
    '&::before': {
      backgroundColor: m3Elevation.level2,
    },
  }),

  // Clickable/hover state
  ...(clickable && {
    cursor: 'pointer',
    transition: `all ${m3Motion.duration.medium2}ms ${m3Motion.easing.standard}`,
    '&:hover': {
      transform: 'translateY(-4px)',
      boxShadow: `0 8px 24px rgba(0, 0, 0, 0.12)`,
      '&::before': {
        backgroundColor: m3Elevation.level3,
      },
    },
    '&:active': {
      transform: 'translateY(-2px)',
    },
  }),

  // Dark mode support
  [theme.getColorSchemeSelector('dark')]: {
    backgroundColor: theme.palette.grey[900],
    borderColor: theme.palette.grey[800],
    ...(featured && {
      backgroundColor: theme.palette.primary.dark,
      borderColor: theme.palette.primary.main,
    }),
  },

  // Responsive span adjustments
  [theme.breakpoints.down('md')]: {
    gridColumn: span > 2 ? 'span 2' : `span ${span}`,
  },
  [theme.breakpoints.down('sm')]: {
    gridColumn: 'span 1',
    gridRow: 'span 1',
  },
}));

/**
 * BentoGrid - Material 3 Bento Grid Layout
 *
 * A flexible grid layout with variable-sized items for dashboards and landing pages.
 *
 * @example
 * ```tsx
 * <BentoGrid columns={4} gap={3}>
 *   <BentoItem span={2} featured>Featured Content</BentoItem>
 *   <BentoItem>Regular Item</BentoItem>
 *   <BentoItem clickable>Clickable Item</BentoItem>
 * </BentoGrid>
 * ```
 */
export function BentoGrid({
  columns = 4,
  gap = 3,
  children,
  ...props
}: BentoGridProps) {
  return (
    <StyledBentoGrid columns={columns} gap={gap} {...props}>
      {children}
    </StyledBentoGrid>
  );
}

/**
 * BentoItem - Individual item in a BentoGrid
 */
export function BentoItem({
  span = 1,
  rowSpan = 1,
  featured = false,
  clickable = false,
  children,
  ...props
}: BentoItemProps) {
  return (
    <StyledBentoItem
      span={span}
      rowSpan={rowSpan}
      featured={featured}
      clickable={clickable}
      {...props}
    >
      {children}
    </StyledBentoItem>
  );
}

// Export as named exports
export default BentoGrid;
