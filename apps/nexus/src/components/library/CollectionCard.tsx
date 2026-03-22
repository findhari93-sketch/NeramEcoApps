'use client';

import { Box, Typography, Skeleton, alpha, useTheme } from '@neram/ui';
import { useRouter } from 'next/navigation';
import type { LibraryCollection } from '@neram/database/types';

interface CollectionCardProps {
  collection: LibraryCollection;
}

export function CollectionCardSkeleton() {
  return (
    <Box
      sx={{
        width: { xs: 200, sm: 260 },
        minWidth: { xs: 200, sm: 260 },
        flexShrink: 0,
      }}
    >
      <Skeleton
        variant="rectangular"
        sx={{
          width: '100%',
          height: { xs: 120, sm: 150 },
          borderRadius: 2,
        }}
      />
      <Skeleton variant="text" sx={{ mt: 1, width: '80%' }} />
      <Skeleton variant="text" sx={{ width: '40%' }} />
    </Box>
  );
}

const GRADIENT_PALETTE = [
  ['#6366f1', '#8b5cf6'],
  ['#0ea5e9', '#06b6d4'],
  ['#f43f5e', '#ec4899'],
  ['#10b981', '#14b8a6'],
  ['#f59e0b', '#f97316'],
  ['#8b5cf6', '#a855f7'],
];

export default function CollectionCard({ collection }: CollectionCardProps) {
  const theme = useTheme();
  const router = useRouter();

  // Deterministic gradient based on collection id
  const gradientIdx =
    collection.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) %
    GRADIENT_PALETTE.length;
  const [c1, c2] = GRADIENT_PALETTE[gradientIdx];

  const examLabel: Record<string, string> = {
    nata: 'NATA',
    jee_barch: 'JEE B.Arch',
    both: 'NATA/JEE',
    general: 'General',
  };

  return (
    <Box
      onClick={() => router.push(`/student/library/collection/${collection.id}`)}
      sx={{
        width: { xs: 200, sm: 260 },
        minWidth: { xs: 200, sm: 260 },
        flexShrink: 0,
        cursor: 'pointer',
        '&:hover .collection-cover': {
          transform: 'scale(1.03)',
        },
        '&:active': {
          transform: 'scale(0.98)',
        },
        transition: 'transform 0.15s ease',
      }}
    >
      {/* Cover */}
      <Box
        className="collection-cover"
        sx={{
          width: '100%',
          height: { xs: 120, sm: 150 },
          borderRadius: 2,
          overflow: 'hidden',
          position: 'relative',
          transition: 'transform 0.2s ease',
          ...(collection.cover_image_url
            ? {
                backgroundImage: `url(${collection.cover_image_url})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : {
                background: `linear-gradient(135deg, ${c1}, ${c2})`,
              }),
        }}
      >
        {/* Overlay text on gradient */}
        <Box
          sx={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            p: 1.5,
            background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
          }}
        >
          <Typography
            sx={{
              color: '#fff',
              fontWeight: 700,
              fontSize: { xs: '0.9rem', sm: '1rem' },
              lineHeight: 1.3,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {collection.title}
          </Typography>
        </Box>
      </Box>

      {/* Subtitle */}
      <Box sx={{ mt: 0.75, display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {collection.exam && (
          <Typography
            variant="caption"
            sx={{
              color: theme.palette.primary.main,
              fontWeight: 600,
              fontSize: '0.7rem',
            }}
          >
            {examLabel[collection.exam] || collection.exam}
          </Typography>
        )}
        {collection.description && (
          <Typography
            variant="caption"
            sx={{
              color: theme.palette.text.secondary,
              fontSize: '0.7rem',
              display: '-webkit-box',
              WebkitLineClamp: 1,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {collection.exam ? ' - ' : ''}
            {collection.description}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
