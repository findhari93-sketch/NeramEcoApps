'use client';

import { Button, Tooltip } from '@mui/material';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import { useCompareList } from '@/lib/college-hub/compare-store';
import { COMPARE_MAX } from '@/lib/college-hub/constants';

interface CompareButtonProps {
  slug: string;
  collegeName: string;
  shortName?: string | null;
  stateSlug?: string | null;
}

/** Compare toggle for the category-page cards. The directory uses its own controls. */
export default function CompareButton({ slug, collegeName, shortName, stateSlug }: CompareButtonProps) {
  const { has, toggle } = useCompareList();
  const inList = has(slug);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggle({ slug, name: collegeName, shortName: shortName || collegeName, stateSlug });
  };

  return (
    <Tooltip title={inList ? `Remove ${collegeName} from compare` : `Add ${collegeName} to compare (up to ${COMPARE_MAX})`}>
      <Button
        size="small"
        variant={inList ? 'contained' : 'outlined'}
        aria-pressed={inList}
        startIcon={<CompareArrowsIcon sx={{ fontSize: 14 }} />}
        onClick={handleClick}
        sx={{ fontSize: '0.75rem', py: 0.25, px: 1 }}
      >
        {inList ? 'Added' : 'Compare'}
      </Button>
    </Tooltip>
  );
}
