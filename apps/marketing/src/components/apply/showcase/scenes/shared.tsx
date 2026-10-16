'use client';

import { Box } from '@neram/ui';
import { tokens } from '@/design-system';
import { img } from '../palette';

/** A full-bleed cover image inside a scene column. */
export function CoverImage({ name, small, sizes, eager }: { name: string; small?: string; sizes?: string; eager?: boolean }) {
  return (
    <Box
      component="img"
      src={img(name)}
      srcSet={small ? `${img(small)} 680w, ${img(name)} ${name.split('-').pop()}w` : undefined}
      sizes={small ? sizes : undefined}
      alt=""
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  );
}

/** Navy tag in the top-left corner of an image ("Your plate · Perspective"). */
export const tagSx = {
  position: 'absolute',
  left: 10,
  top: 10,
  bgcolor: tokens.navy900,
  color: tokens.paper,
  fontSize: 11,
  fontWeight: 700,
  lineHeight: 1.3,
  px: 1,
  py: 0.5,
  borderRadius: '4px',
  whiteSpace: 'nowrap',
} as const;

/** 1px line rule between the two halves of a split scene. */
export const splitRule = `1px solid ${tokens.line}`;
