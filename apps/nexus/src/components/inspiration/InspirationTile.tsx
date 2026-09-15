'use client';

import Link from 'next/link';
import { Box, IconButton, Skeleton, Typography } from '@neram/ui';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import type { InspirationCard } from '@/lib/inspiration-present';

export interface InspirationTileProps {
  card: InspirationCard;
  href: string;
  onOpen?: () => void;
  onToggleSave?: (card: InspirationCard) => void;
}

/**
 * One drawing in the grid. The box takes the image's real shape before the
 * image arrives (aspect-ratio), so the grid never jumps while it loads. The
 * heart is a 44px target sitting on a light disc so it reads on any drawing.
 */
export default function InspirationTile({ card, href, onOpen, onToggleSave }: InspirationTileProps) {
  return (
    <Box component="article" data-testid="inspiration-tile" sx={{ position: 'relative', minWidth: 0 }}>
      <Box
        component={Link}
        href={href}
        onClick={onOpen}
        sx={{
          display: 'block',
          borderRadius: 2,
          overflow: 'hidden',
          bgcolor: 'grey.100',
          '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
          '@media (prefers-reduced-motion: no-preference)': {
            transition: 'transform 150ms ease-out',
            '&:hover': { transform: 'translateY(-2px)' },
          },
        }}
      >
        <Box
          component="img"
          src={card.thumbnailUrl ?? card.imageUrl}
          alt={card.alt}
          loading="lazy"
          decoding="async"
          sx={{
            display: 'block',
            width: '100%',
            aspectRatio: String(card.aspect ?? 0.75),
            objectFit: card.aspect ? 'cover' : 'contain',
          }}
        />
      </Box>

      {card.badge && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            top: 8,
            left: 8,
            px: 1,
            py: 0.25,
            borderRadius: 1,
            bgcolor: 'rgba(0, 0, 0, 0.72)',
            color: 'common.white',
            fontSize: 12,
            fontWeight: 600,
            lineHeight: 1.6,
            pointerEvents: 'none',
          }}
        >
          {card.badge === 'reference' ? 'Reference' : 'Alumni'}
        </Box>
      )}

      {onToggleSave && (
        <IconButton
          aria-label={card.saved ? `Remove ${card.title} from saved` : `Save ${card.title}`}
          aria-pressed={card.saved}
          onClick={() => onToggleSave(card)}
          sx={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 44,
            height: 44,
            bgcolor: 'rgba(255, 255, 255, 0.92)',
            '&:hover': { bgcolor: 'common.white' },
            '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main' },
          }}
        >
          {card.saved ? <FavoriteIcon sx={{ color: 'error.main' }} /> : <FavoriteBorderIcon />}
        </IconButton>
      )}

      <Typography variant="body2" noWrap title={card.title} sx={{ mt: 0.75, fontWeight: 600 }}>
        {card.title}
      </Typography>
      {card.staff && !card.staff.visible && card.staff.hiddenReason && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {card.staff.hiddenReason}
        </Typography>
      )}
    </Box>
  );
}

export function InspirationTileSkeleton({ aspect = 0.75 }: { aspect?: number }) {
  return (
    <Box aria-hidden>
      <Skeleton variant="rounded" sx={{ width: '100%', height: 'auto', aspectRatio: String(aspect), borderRadius: 2 }} />
      <Skeleton variant="text" sx={{ width: '60%', mt: 0.75 }} />
    </Box>
  );
}
