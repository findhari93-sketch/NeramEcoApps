'use client';

import { Box, Typography, Breadcrumbs, IconButton, Link as MuiLink } from '@neram/ui';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import Link from 'next/link';

interface Breadcrumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Breadcrumb[];
  /**
   * Where the back arrow goes. Prefer an explicit href over router.back(): a page
   * reached from a notification or a pasted link has no history to go back to.
   */
  backHref?: string;
  action?: React.ReactNode;
}

/**
 * Consistent page header with optional subtitle, breadcrumbs, and action button.
 *
 * Breadcrumbs and the back arrow are complements, not alternatives. The trail
 * answers "where am I" and is the only way up more than one level; the arrow is
 * the thumb-reachable single step back that mobile users expect. Pass both on
 * any page nested under a hub.
 */
export default function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  backHref,
  action,
}: PageHeaderProps) {
  return (
    <Box sx={{ mb: 3 }}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumbs
          separator={<NavigateNextIcon sx={{ fontSize: '0.9rem' }} />}
          sx={{ mb: 0.5, ...(backHref ? { ml: { xs: 6, sm: 6 } } : null) }}
        >
          {breadcrumbs.map((crumb, i) =>
            crumb.href ? (
              <MuiLink
                key={i}
                component={Link}
                href={crumb.href}
                underline="hover"
                color="text.secondary"
                variant="caption"
                sx={{ fontWeight: 500 }}
              >
                {crumb.label}
              </MuiLink>
            ) : (
              <Typography key={i} variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                {crumb.label}
              </Typography>
            )
          )}
        </Breadcrumbs>
      )}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
          {backHref && (
            <IconButton
              component={Link}
              href={backHref}
              aria-label={`Back to ${breadcrumbs?.[breadcrumbs.length - 1]?.label || 'the previous page'}`}
              sx={{ ml: -1, mt: -0.5, width: 48, height: 48, flexShrink: 0 }}
            >
              <ArrowBackOutlinedIcon />
            </IconButton>
          )}
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="h5"
              component="h1"
              sx={{
                fontWeight: 700,
                letterSpacing: '-0.3px',
                lineHeight: 1.2,
                fontSize: { xs: '1.25rem', sm: '1.5rem' },
              }}
            >
              {title}
            </Typography>
            {subtitle && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.5, lineHeight: 1.4 }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
        </Box>
        {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
      </Box>
    </Box>
  );
}
