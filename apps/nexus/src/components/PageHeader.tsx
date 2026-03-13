'use client';

import { Box, Typography, Breadcrumbs, Link as MuiLink } from '@neram/ui';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import Link from 'next/link';

interface Breadcrumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Breadcrumb[];
  action?: React.ReactNode;
}

/**
 * Consistent page header with optional subtitle, breadcrumbs, and action button.
 */
export default function PageHeader({ title, subtitle, breadcrumbs, action }: PageHeaderProps) {
  return (
    <Box sx={{ mb: 3 }}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumbs
          separator={<NavigateNextIcon sx={{ fontSize: '0.9rem' }} />}
          sx={{ mb: 0.5 }}
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
        <Box>
          <Typography
            variant="h5"
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
        {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
      </Box>
    </Box>
  );
}
