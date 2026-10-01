'use client';

import { useState, useEffect } from 'react';
import { Box, IconButton, Typography } from '@neram/ui';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
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

  // Follow fresh data from the parent (for example after the signed-in reload)
  useEffect(() => {
    if (loading) return;
    setScore(initialScore);
    setUserVote(initialVote);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialScore, initialVote]);

  const handleVote = async (vote: VoteType, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;

    setLoading(true);

    // Optimistic update
    const prevScore = score;
    const prevVote = userVote;

    if (userVote === vote) {
      setUserVote(null);
      setScore(score + (vote === 'up' ? -1 : 1));
    } else if (userVote === null) {
      setUserVote(vote);
      setScore(score + (vote === 'up' ? 1 : -1));
    } else {
      setUserVote(vote);
      setScore(score + (vote === 'up' ? 2 : -2));
    }

    try {
      const result = await onVote(vote);
      if (!result || typeof result.voteScore !== 'number') throw new Error('Vote failed');
      setUserVote(result.vote ?? null);
      setScore(result.voteScore);
    } catch {
      setUserVote(prevVote);
      setScore(prevScore);
    } finally {
      setLoading(false);
    }
  };

  const iconSize = size === 'small' ? '1.125rem' : '1.375rem';
  const btnSx = {
    width: 44,
    height: 44,
    transition: 'color 0.2s',
  } as const;

  return (
    <Box
      role="group"
      aria-label={`Votes: ${score}`}
      sx={{
        display: 'flex',
        flexDirection: direction === 'vertical' ? 'column' : 'row',
        alignItems: 'center',
        gap: 0,
      }}
    >
      <IconButton
        onClick={(e) => handleVote('up', e)}
        disabled={loading}
        aria-label={userVote === 'up' ? 'Remove upvote' : 'Upvote'}
        aria-pressed={userVote === 'up'}
        sx={{ ...btnSx, color: userVote === 'up' ? 'warning.main' : 'text.secondary' }}
      >
        <ArrowUpwardRoundedIcon sx={{ fontSize: iconSize }} />
      </IconButton>

      <Typography
        variant="body2"
        fontWeight={700}
        aria-hidden="true"
        sx={{
          fontSize: size === 'small' ? '0.875rem' : '1rem',
          // Plain text colour keeps 4.5:1 contrast; the arrow carries the vote colour
          color: 'text.primary',
          minWidth: 20,
          textAlign: 'center',
          userSelect: 'none',
        }}
      >
        {score}
      </Typography>

      <IconButton
        onClick={(e) => handleVote('down', e)}
        disabled={loading}
        aria-label={userVote === 'down' ? 'Remove downvote' : 'Downvote'}
        aria-pressed={userVote === 'down'}
        sx={{ ...btnSx, color: userVote === 'down' ? 'info.main' : 'text.secondary' }}
      >
        <ArrowDownwardRoundedIcon sx={{ fontSize: iconSize }} />
      </IconButton>
    </Box>
  );
}
