'use client';

import { Chip, Stack } from '@mui/material';
import VerifiedIcon from '@mui/icons-material/Verified';
import SchoolIcon from '@mui/icons-material/School';
import StarIcon from '@mui/icons-material/Star';

interface BadgePillsProps {
  coa_approved?: boolean;
  naac_grade?: string | null;
  nba_accredited?: boolean;
  nirf_rank_architecture?: number | null;
  accepted_exams?: string[] | null;
  counseling_systems?: string[] | null;
  size?: 'small' | 'medium';
  maxVisible?: number;
}

export default function BadgePills({
  coa_approved,
  naac_grade,
  nba_accredited,
  nirf_rank_architecture,
  accepted_exams,
  counseling_systems,
  size = 'small',
  maxVisible = 6,
}: BadgePillsProps) {
  const badges: React.ReactNode[] = [];

  if (coa_approved) {
    badges.push(
      <Chip
        key="coa"
        label="COA Approved"
        size={size}
        color="success"
        variant="outlined"
        icon={<VerifiedIcon />}
        sx={{ fontWeight: 600 }}
      />
    );
  }

  if (naac_grade) {
    const isTopGrade = ['A++', 'A+', 'A'].includes(naac_grade);
    badges.push(
      <Chip
        key="naac"
        label={`NAAC ${naac_grade}`}
        size={size}
        color={isTopGrade ? 'primary' : 'default'}
        variant={isTopGrade ? 'filled' : 'outlined'}
        icon={<StarIcon />}
      />
    );
  }

  if (nba_accredited) {
    badges.push(
      <Chip
        key="nba"
        label="NBA"
        size={size}
        color="info"
        variant="outlined"
      />
    );
  }

  if (nirf_rank_architecture) {
    badges.push(
      <Chip
        key="nirf"
        label={`NIRF #${nirf_rank_architecture} Arch`}
        size={size}
        sx={{ bgcolor: '#fef9c3', color: '#854d0e', fontWeight: 600, border: 'none' }}
      />
    );
  }

  (accepted_exams ?? []).forEach((exam) => {
    badges.push(
      <Chip
        key={`exam-${exam}`}
        label={exam}
        size={size}
        variant="outlined"
        icon={<SchoolIcon />}
        sx={{ color: '#1d4ed8', borderColor: '#93c5fd' }}
      />
    );
  });

  (counseling_systems ?? []).forEach((sys) => {
    badges.push(
      <Chip
        key={`sys-${sys}`}
        label={sys}
        size={size}
        variant="outlined"
        sx={{ color: '#6b21a8', borderColor: '#c4b5fd' }}
      />
    );
  });

  const visible = badges.slice(0, maxVisible);
  const hidden = badges.length - visible.length;

  return (
    <Stack direction="row" flexWrap="wrap" gap={0.75} alignItems="center">
      {visible}
      {hidden > 0 && (
        <Chip
          label={`+${hidden} more`}
          size={size}
          variant="outlined"
          sx={{ color: '#64748b', borderColor: '#cbd5e1' }}
        />
      )}
    </Stack>
  );
}
