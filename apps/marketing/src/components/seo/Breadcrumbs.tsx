'use client';

import { Breadcrumbs as MuiBreadcrumbs, Typography } from '@neram/ui';
import Link from 'next/link';

interface BreadcrumbItem {
  name: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  /** Use 'light' on dark hero backgrounds */
  variant?: 'light' | 'dark';
}

/** Visual breadcrumb navigation that mirrors the JSON-LD BreadcrumbSchema data */
export default function Breadcrumbs({ items, variant = 'dark' }: BreadcrumbsProps) {
  const isLight = variant === 'light';
  const linkColor = isLight ? 'rgba(255,255,255,0.7)' : 'text.secondary';
  const activeColor = isLight ? 'rgba(255,255,255,0.95)' : 'text.primary';

  return (
    <MuiBreadcrumbs
      separator="›"
      sx={{
        mb: 1.5,
        '& .MuiBreadcrumbs-separator': {
          color: linkColor,
          mx: 0.5,
        },
      }}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        if (isLast || !item.href) {
          return (
            <Typography
              key={index}
              variant="caption"
              sx={{
                color: isLast ? activeColor : linkColor,
                fontWeight: isLast ? 600 : 400,
                fontSize: '0.8rem',
              }}
            >
              {item.name}
            </Typography>
          );
        }

        return (
          <Link
            key={index}
            href={item.href}
            style={{ textDecoration: 'none' }}
          >
            <Typography
              variant="caption"
              sx={{
                color: linkColor,
                fontSize: '0.8rem',
                '&:hover': { textDecoration: 'underline' },
              }}
            >
              {item.name}
            </Typography>
          </Link>
        );
      })}
    </MuiBreadcrumbs>
  );
}
