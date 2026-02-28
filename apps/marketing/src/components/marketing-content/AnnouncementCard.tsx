'use client';

import { Box, Typography, Chip, Card, CardContent, CardMedia, Button } from '@neram/ui';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

interface AnnouncementCardProps {
  title: string;
  description: string;
  imageUrl: string | null;
  metadata: {
    link_url?: string | null;
    link_text?: string | null;
    badge_text?: string | null;
    badge_color?: string | null;
    category?: string | null;
  };
}

export default function AnnouncementCard({ title, description, imageUrl, metadata }: AnnouncementCardProps) {
  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 0.2s',
        '&:hover': { transform: 'translateY(-4px)', boxShadow: 4 },
      }}
    >
      {/* Optional image */}
      {imageUrl && (
        <CardMedia
          component="img"
          height={180}
          image={imageUrl}
          alt={title}
          sx={{ objectFit: 'cover' }}
        />
      )}

      <CardContent sx={{ flexGrow: 1, p: { xs: 2.5, sm: 3 } }}>
        {/* Badge */}
        {metadata.badge_text && (
          <Chip
            label={metadata.badge_text}
            size="small"
            color={(metadata.badge_color as any) || 'info'}
            sx={{ mb: 1.5, fontWeight: 700 }}
          />
        )}

        {/* Category chip */}
        {metadata.category && !metadata.badge_text && (
          <Chip
            label={metadata.category}
            size="small"
            variant="outlined"
            sx={{ mb: 1.5 }}
          />
        )}

        {/* Title */}
        <Typography variant="h6" component="div" fontWeight={700} gutterBottom>
          {title}
        </Typography>

        {/* Description */}
        {description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {description}
          </Typography>
        )}

        {/* CTA Link */}
        {metadata.link_url && (
          <Box sx={{ mt: 'auto' }}>
            <Button
              variant="outlined"
              size="small"
              endIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
              href={metadata.link_url}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ textTransform: 'none' }}
            >
              {metadata.link_text || 'Learn More'}
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
