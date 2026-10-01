'use client';

import { useState } from 'react';
import { IconButton, Typography, Box } from '@neram/ui';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';

interface LikeButtonProps {
  liked: boolean;
  count: number;
  onToggle: () => Promise<{ liked: boolean; likeCount: number }>;
  size?: 'small' | 'medium';
}

export default function LikeButton({ liked: initialLiked, count: initialCount, onToggle, size = 'medium' }: LikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;

    setLoading(true);
    // Optimistic update
    setLiked(!liked);
    setCount(prev => liked ? prev - 1 : prev + 1);

    try {
      const result = await onToggle();
      setLiked(result.liked);
      setCount(result.likeCount);
    } catch {
      // Revert optimistic update
      setLiked(liked);
      setCount(count);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <IconButton
        onClick={handleClick}
        disabled={loading}
        aria-label={liked ? 'Unlike' : 'Like'}
        aria-pressed={liked}
        sx={{
          width: 44,
          height: 44,
          color: liked ? 'error.main' : 'text.secondary',
          transition: 'color 0.2s',
        }}
      >
        {liked ? (
          <FavoriteIcon sx={{ fontSize: size === 'small' ? '1.125rem' : '1.375rem' }} />
        ) : (
          <FavoriteBorderIcon sx={{ fontSize: size === 'small' ? '1.125rem' : '1.375rem' }} />
        )}
      </IconButton>
      <Typography variant="body2" color="text.secondary" sx={{ fontSize: size === 'small' ? '0.75rem' : '0.875rem' }}>
        {count}
      </Typography>
    </Box>
  );
}
