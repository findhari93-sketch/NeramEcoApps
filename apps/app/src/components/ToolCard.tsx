'use client';

import { Card, CardContent, Typography, Box } from '@neram/ui';
import Link from 'next/link';

interface ToolCardProps {
  title: string;
  description: string;
  href: string;
  icon: string;
  color: string;
}

export default function ToolCard({
  title,
  description,
  href,
  icon,
  color,
}: ToolCardProps) {
  return (
    <Card
      component={Link}
      href={href}
      sx={{
        height: '100%',
        textDecoration: 'none',
        transition: 'all 0.3s ease',
        cursor: 'pointer',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: 4,
        },
      }}
    >
      <CardContent>
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: 2,
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
    </Card>
  );
}
