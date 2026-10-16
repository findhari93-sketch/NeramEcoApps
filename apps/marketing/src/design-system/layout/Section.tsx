import type { ReactNode } from 'react';
import { Box, type SxProps, type Theme } from '@neram/ui';
import Surface, { type SurfaceTone } from '../surface/Surface';
import SectionHeader, { type SectionHeaderProps } from '../SectionHeader';
import { tokens as t, sectionPaddingY } from '../tokens';

export type ContainerWidth = keyof typeof t.container;

export interface SectionProps {
  tone?: SurfaceTone;
  /** page 1200, narrow 900 (FAQ, comparison), article 780, legal 700. */
  width?: ContainerWidth;
  /** 1px top rule; on by default so stacked bands read as separate. */
  rule?: boolean;
  blueprint?: boolean;
  /** Optional SectionHeader above the content. */
  header?: SectionHeaderProps;
  id?: string;
  /** Vertical gap between the header and the content, in theme spacing units. */
  gap?: number;
  /** Override the 56/80px vertical padding. */
  py?: number | { xs?: number; sm?: number; md?: number; lg?: number };
  sx?: SxProps<Theme>;
  children?: ReactNode;
}

/**
 * A Surface band with the standard container: 56px (phone) / 80px (desktop)
 * vertical padding, 16/24px side gutters, centred max-width.
 */
export default function Section({
  tone = 'light',
  width = 'page',
  rule = true,
  blueprint,
  header,
  id,
  gap = 5,
  py = sectionPaddingY,
  sx,
  children,
}: SectionProps) {
  const headingId = header ? header.id ?? (id ? `${id}-title` : undefined) : undefined;
  return (
    <Surface tone={tone} rule={rule} blueprint={blueprint} id={id} aria-labelledby={headingId} sx={sx}>
      <Box
        sx={{
          maxWidth: t.container[width],
          mx: 'auto',
          px: { xs: 2, sm: 3 },
          py,
          display: 'flex',
          flexDirection: 'column',
          gap,
          boxSizing: 'content-box',
        }}
      >
        {header && <SectionHeader {...header} id={headingId} />}
        {children}
      </Box>
    </Surface>
  );
}
