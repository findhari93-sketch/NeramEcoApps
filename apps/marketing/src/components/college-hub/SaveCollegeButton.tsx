'use client';

import { useState, useEffect, useCallback } from 'react';
import { IconButton, Tooltip } from '@mui/material';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import { useFirebaseAuth, getFirebaseAuth } from '@neram/auth';

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

async function getIdToken(): Promise<string | null> {
  try {
    const auth = getFirebaseAuth();
    return (await auth.currentUser?.getIdToken()) ?? null;
  } catch {
    return null;
  }
}

interface SaveCollegeButtonProps {
  slug: string;
  collegeId: string;
  collegeName: string;
  size?: 'small' | 'medium';
}

export default function SaveCollegeButton({
  slug,
  collegeId,
  collegeName,
  size = 'medium',
}: SaveCollegeButtonProps) {
  const { user } = useFirebaseAuth();
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load saved state — DB if logged in, localStorage if not
  const loadSaved = useCallback(async () => {
    if (user) {
      const token = await getIdToken();
      if (!token) { setSaved(getSavedColleges().includes(slug)); return; }
      try {
        const res = await fetch('/api/colleges/saved', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const { saved: ids } = await res.json();
          setSaved((ids as string[]).includes(collegeId));
          return;
        }
      } catch { /* fall through to localStorage */ }
    }
    setSaved(getSavedColleges().includes(slug));
  }, [user, slug, collegeId]);

  useEffect(() => { loadSaved(); }, [loadSaved]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (loading) return;

    if (user) {
      setLoading(true);
      const token = await getIdToken();
      if (token) {
        const action = saved ? 'unsave' : 'save';
        try {
          const res = await fetch('/api/colleges/saved', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ college_id: collegeId, action }),
          });
          if (res.ok) {
            setSaved(!saved);
            setLoading(false);
            return;
          }
        } catch { /* fall through to localStorage */ }
      }
      setLoading(false);
    }

    // Fallback: localStorage
    const isNowSaved = toggleSavedCollege(slug);
    setSaved(isNowSaved);
  };

  const tooltip = user
    ? saved ? `Remove ${collegeName} from saved` : `Save ${collegeName}`
    : `Save ${collegeName} (sign in to sync across devices)`;

  return (
    <Tooltip title={tooltip}>
      <IconButton
        size={size}
        onClick={handleToggle}
        disabled={loading}
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
