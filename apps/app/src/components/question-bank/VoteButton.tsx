'use client';

import { useState } from 'react';
import { Box, IconButton, Typography } from '@neram/ui';
import type { VoteType } from '@neram/database';

interface VoteButtonProps {
  score: number;
  userVote: VoteType | null;
  onVote: (vote: VoteType) => Promise<{ vote: VoteType | null; voteScore: number }>;
  size?: 'small' | 'medium';
  direction?: 'vertical' | 'horizontal';
}

export default function VoteButton({
  score: initialScore,
  userVote: initialVote,
  onVote,
  size = 'medium',
  direction = 'vertical',
}: VoteButtonProps) {
  const [score, setScore] = useState(initialScore);
  const [userVote, setUserVote] = useState<VoteType | null>(initialVote);
  const [loading, setLoading] = useState(false);

  const handleVote = async (vote: VoteType, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;

    setLoading(true);

    // Optimistic update
    const prevScore = score;
    const prevVote = userVote;

    if (userVote === vote) {
      // Removing vote
      setUserVote(null);
      setScore(score + (vote === 'up' ? -1 : 1));
    } else if (userVote === null) {
      // New vote
      setUserVote(vote);
      setScore(score + (vote === 'up' ? 1 : -1));
    } else {
      // Switching vote direction
      setUserVote(vote);
      setScore(score + (vote === 'up' ? 2 : -2));
    }

    try {
      const result = await onVote(vote);
      setUserVote(result.vote);
      setScore(result.voteScore);
    } catch {
      setUserVote(prevVote);
      setScore(prevScore);
    } finally {
      setLoading(false);
    }
  };

  const iconSize = size === 'small' ? '1rem' : '1.25rem';
  const btnSize = size === 'small' ? 32 : 40;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: direction === 'vertical' ? 'column' : 'row',
        alignItems: 'center',
        gap: 0,
      }}
    >
      {/* Upvote */}
      <IconButton
        onClick={(e) => handleVote('up', e)}
        disabled={loading}
        size="small"
        sx={{
          width: btnSize,
          height: btnSize,
          color: userVote === 'up' ? 'warning.main' : 'text.secondary',
          transition: 'color 0.2s, transform 0.15s',
          '&:active': { transform: 'scale(1.15)' },
        }}
        aria-label="Upvote"
      >
        <span style={{ fontSize: iconSize, lineHeight: 1 }}>&#9650;</span>
      </IconButton>

      {/* Score */}
      <Typography
        variant="body2"
        fontWeight={700}
        sx={{
          fontSize: size === 'small' ? '0.8rem' : '0.95rem',
          color: userVote === 'up' ? 'warning.main' : userVote === 'down' ? 'info.main' : 'text.primary',
          minWidth: 20,
          textAlign: 'center',
          userSelect: 'none',
        }}
      >
        {score}
      </Typography>

      {/* Downvote */}
      <IconButton
        onClick={(e) => handleVote('down', e)}
        disabled={loading}
        size="small"
        sx={{
          width: btnSize,
          height: btnSize,
          color: userVote === 'down' ? 'info.main' : 'text.secondary',
          transition: 'color 0.2s, transform 0.15s',
          '&:active': { transform: 'scale(1.15)' },
        }}
        aria-label="Downvote"
      >
        <span style={{ fontSize: iconSize, lineHeight: 1 }}>&#9660;</span>
      </IconButton>
    </Box>
  );
}
