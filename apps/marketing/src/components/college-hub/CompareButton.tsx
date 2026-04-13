'use client';

import { useState, useEffect } from 'react';
import { Button, Tooltip } from '@mui/material';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';

const STORAGE_KEY = 'neram_compare_colleges';
const MAX_COMPARE = 3;

export function getCompareList(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function addToCompare(slug: string): boolean {
  const list = getCompareList();
  if (list.includes(slug) || list.length >= MAX_COMPARE) return false;
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...list, slug]));
  return true;
}

export function removeFromCompare(slug: string) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(getCompareList().filter((s) => s !== slug))
  );
}

interface CompareButtonProps {
  slug: string;
  collegeName: string;
}

export default function CompareButton({ slug, collegeName }: CompareButtonProps) {
  const [inList, setInList] = useState(false);
  const [listFull, setListFull] = useState(false);

  const refresh = () => {
    const list = getCompareList();
    setInList(list.includes(slug));
    setListFull(list.length >= MAX_COMPARE && !list.includes(slug));
  };

  useEffect(() => {
    refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (inList) {
      removeFromCompare(slug);
    } else {
      addToCompare(slug);
    }
    refresh();
    window.dispatchEvent(new Event('compare-updated'));
  };

  if (listFull && !inList) return null;

  return (
    <Tooltip
      title={
        inList
          ? `Remove ${collegeName} from compare`
          : `Add ${collegeName} to compare (max 3)`
      }
    >
      <Button
        size="small"
        variant={inList ? 'contained' : 'outlined'}
        startIcon={<CompareArrowsIcon sx={{ fontSize: 14 }} />}
        onClick={handleClick}
        sx={{ fontSize: '0.7rem', py: 0.25, px: 1 }}
      >
        {inList ? 'Added' : 'Compare'}
      </Button>
    </Tooltip>
  );
}
