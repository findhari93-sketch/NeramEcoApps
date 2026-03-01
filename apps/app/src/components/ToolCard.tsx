'use client';

import { Card, CardContent, Typography, Box, Chip } from '@neram/ui';
import Link from 'next/link';

interface ToolCardProps {
  title: string;
  description: string;
  href: string;
  icon: string;
  color: string;
  comingSoon?: boolean;
}

export default function ToolCard({
  title,
  description,
  href,
  icon,
  color,
  comingSoon,
}: ToolCardProps) {
  const cardSx = {
    height: '100%',
    textDecoration: 'none',
    transition: 'all 0.3s ease',
    cursor: comingSoon ? 'default' : 'pointer',
    opacity: comingSoon ? 0.65 : 1,
    position: 'relative' as const,
    ...(!comingSoon && {
      '&:hover': {
        transform: 'translateY(-4px)',
        boxShadow: 4,
      },
    }),
  };

  const content = (
    <CardContent>
      {comingSoon && (
        <Chip
          label="Coming Soon"
          size="small"
          color="default"
          sx={{ position: 'absolute', top: 12, right: 12, fontSize: '0.7rem', height: 22 }}
        />
      )}
      <Box
        sx={{
          width: 56,
          height: 56,
          borderRadius: 1,
          bgcolor: color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: 2,
          fontSize: '1.75rem',
        }}
      >
        {icon}
      </Box>
      <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {description}
      </Typography>
    </CardContent>
  );

  if (comingSoon) {
    return <Card sx={cardSx}>{content}</Card>;
  }

  return (
    <Card component={Link} href={href} sx={cardSx}>
      {content}
    </Card>
  );
}
