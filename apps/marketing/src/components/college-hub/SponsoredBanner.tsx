import { Box, Typography } from '@mui/material';
import Link from 'next/link';

interface SponsoredBannerProps {
  variant?: 'featured' | 'compact';
}

const BANNERS = [
  { text: 'Apply for B.Arch 2025 Admissions. Limited seats available.', cta: 'Learn More', href: '/colleges' },
  { text: 'Free NATA preparation guide. Download now!', cta: 'Get Free Guide', href: '/colleges' },
  { text: 'Compare top architecture colleges side by side.', cta: 'Compare Now', href: '/colleges/compare' },
];

export default function SponsoredBanner({ variant = 'compact' }: SponsoredBannerProps) {
  const banner = BANNERS[Math.floor(Math.random() * BANNERS.length)];

  return (
    <Box
      sx={{
        background: 'linear-gradient(135deg, #fef3c7, #fef9c3)',
        border: '1px dashed #f59e0b',
        borderRadius: 3,
        p: variant === 'featured' ? { xs: 2, sm: 2.5 } : { xs: 1.5, sm: 2 },
        my: variant === 'featured' ? 2.5 : 1.5,
        textAlign: 'center',
      }}
    >
      <Typography sx={{ fontSize: '0.6rem', color: '#92400e', textTransform: 'uppercase', letterSpacing: 1, mb: 0.5 }}>
        Sponsored
      </Typography>
      <Typography sx={{ fontSize: { xs: '0.8rem', sm: '0.875rem' }, color: '#78350f' }}>
        {banner.text}{' '}
        <Link href={banner.href} style={{ color: '#1565C0', fontWeight: 600, textDecoration: 'none' }}>
          {banner.cta} →
        </Link>
      </Typography>
    </Box>
  );
}
