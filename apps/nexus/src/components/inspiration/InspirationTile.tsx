'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Box, IconButton, Menu, MenuItem, Skeleton, Typography } from '@neram/ui';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import StudentAvatar from '@/components/students/StudentAvatar';
import type { InspirationCard } from '@/lib/inspiration-present';

const BADGE_LABEL: Record<NonNullable<InspirationCard['badge']>, string> = {
  reference: 'Reference',
  featured: "Teacher's pick",
  alumni: 'Alumni',
};

export interface InspirationTileProps {
  card: InspirationCard;
  href: string;
  onOpen?: () => void;
  onToggleSave?: (card: InspirationCard) => void;
  /**
   * Staff only. Takes the drawing off the shelf from the grid itself, which is
   * where a teacher notices it does not belong there. Never touches the Teams
   * message that announced it: a student is not un-praised in front of a class.
   */
  onHide?: (card: InspirationCard) => void;
}

/**
 * One drawing in the grid. The box takes the image's real shape before the
 * image arrives (aspect-ratio), so the grid never jumps while it loads. The
 * heart is a 44px target sitting on a light disc so it reads on any drawing.
 */
export default function InspirationTile({ card, href, onOpen, onToggleSave, onHide }: InspirationTileProps) {
  const [menuAt, setMenuAt] = useState<HTMLElement | null>(null);
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
          {BADGE_LABEL[card.badge]}
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

      {onHide && (
        <>
          <IconButton
            aria-label={`More actions for ${card.title}`}
            onClick={(e) => setMenuAt(e.currentTarget)}
            sx={{
              position: 'absolute',
              top: 4,
              right: onToggleSave ? 52 : 4,
              width: 44,
              height: 44,
              bgcolor: 'rgba(255, 255, 255, 0.92)',
              '&:hover': { bgcolor: 'common.white' },
              '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main' },
            }}
          >
            <MoreVertIcon />
          </IconButton>
          <Menu anchorEl={menuAt} open={!!menuAt} onClose={() => setMenuAt(null)}>
            <MenuItem
              sx={{ minHeight: 48 }}
              onClick={() => { setMenuAt(null); onHide(card); }}
            >
              Hide from students
            </MenuItem>
          </Menu>
        </>
      )}

      <Typography variant="body2" noWrap title={card.title} sx={{ mt: 0.75, fontWeight: 600 }}>
        {card.title}
      </Typography>
      {/* Whose drawing it is. The grid was anonymous, which is a strange way to
          celebrate somebody. formatInspirationCredit has already collapsed this
          to "Neram student" when the author asked not to be named. */}
      {card.author ? (
        // Featured: the face goes with the name. 28px is the smallest size that keeps the ring's glyphs.
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25, minWidth: 0 }}>
          <StudentAvatar userId={card.author.id} name={card.author.name} src={card.author.avatarUrl} size={28} />
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', minWidth: 0 }}>
            {card.credit}
          </Typography>
        </Box>
      ) : (
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
          {card.credit}
        </Typography>
      )}
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
