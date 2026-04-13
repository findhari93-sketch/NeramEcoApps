'use client';

import { useState, useEffect } from 'react';
import { IconButton, Tooltip } from '@mui/material';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';

const STORAGE_KEY = 'neram_saved_colleges';

export function getSavedColleges(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function toggleSavedCollege(slug: string): boolean {
  const saved = getSavedColleges();
  const isSaved = saved.includes(slug);
  if (isSaved) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved.filter((s) => s !== slug)));
    return false;
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...saved, slug]));
    return true;
  }
}

interface SaveCollegeButtonProps {
  slug: string;
  collegeName: string;
  size?: 'small' | 'medium';
}

export default function SaveCollegeButton({
  slug,
  collegeName,
  size = 'medium',
}: SaveCollegeButtonProps) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(getSavedColleges().includes(slug));
  }, [slug]);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const isNowSaved = toggleSavedCollege(slug);
    setSaved(isNowSaved);
  };

  return (
    <Tooltip title={saved ? `Remove ${collegeName} from saved` : `Save ${collegeName}`}>
      <IconButton
        size={size}
        onClick={handleToggle}
        aria-label={saved ? 'Remove from saved' : 'Save college'}
        sx={{
          color: saved ? '#ef4444' : 'text.secondary',
          '&:hover': { color: '#ef4444' },
        }}
      >
        {saved ? (
          <FavoriteIcon fontSize={size} />
        ) : (
          <FavoriteBorderIcon fontSize={size} />
        )}
      </IconButton>
    </Tooltip>
  );
}
