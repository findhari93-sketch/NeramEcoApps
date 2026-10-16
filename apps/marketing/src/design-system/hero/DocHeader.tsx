import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import Surface from '../surface/Surface';
import Breadcrumb, { type BreadcrumbItem } from '../Breadcrumb';
import { eyebrowSx, tokens as t } from '../tokens';

export interface DocHeaderProps {
  breadcrumb?: BreadcrumbItem[];
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  /** e.g. "Updated March 13, 2026 · Source: Official NATA 2026 Brochure". Shows a green VERIFIED tag. */
  verified?: ReactNode;
  /** Content max width: page (1200) or legal (700). */
  width?: 'page' | 'legal';
  children?: ReactNode;
}

/**
 * The light page opener for long-form pages (exam guides, college directory,
 * counselling, legal). White band with a 1px bottom line; the Site Header is
 * white on these pages too.
 */
export default function DocHeader({ breadcrumb, eyebrow, title, lede, verified, width = 'page', children }: DocHeaderProps) {
  return (
    <Surface tone="white" component="header" sx={{ borderBottom: `1px solid ${t.line}` }}>
      <Box
        sx={{
          maxWidth: t.container[width],
          mx: 'auto',
          px: { xs: 2, sm: 3 },
          pt: { xs: 4, md: 5 },
          pb: { xs: 3.5, md: 4.5 },
          display: 'flex',
          flexDirection: 'column',
          gap: 1.75,
          boxSizing: 'content-box',
        }}
      >
        {breadcrumb && <Breadcrumb items={breadcrumb} />}
        {eyebrow && (
          <Typography component="p" sx={eyebrowSx}>
            {eyebrow}
          </Typography>
        )}
        <Typography
          component="h1"
          sx={{
            m: 0,
            fontWeight: 800,
            fontSize: 'clamp(2rem, 4.5vw, 3rem)',
            lineHeight: 1.08,
            letterSpacing: '-0.01em',
            textWrap: 'balance',
          }}
        >
          {title}
        </Typography>
        {lede && (
          <Typography component="p" sx={{ m: 0, maxWidth: 760, fontSize: '1.125rem', lineHeight: 1.6, color: t.inkMuted, textWrap: 'pretty' }}>
            {lede}
          </Typography>
        )}
        {verified && (
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              flexWrap: 'wrap',
              width: 'fit-content',
              border: `1px solid ${t.line}`,
              borderRadius: `${t.radius}px`,
              px: 1.25,
              py: 0.75,
              fontSize: '0.8125rem',
              color: t.inkMuted,
            }}
          >
            <Box
              component="span"
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: t.success, fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}
            >
              <VerifiedOutlinedIcon aria-hidden sx={{ fontSize: 16 }} />
              VERIFIED
            </Box>
            {verified}
          </Box>
        )}
        {children}
      </Box>
    </Surface>
  );
}
