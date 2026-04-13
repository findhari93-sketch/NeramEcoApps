import { Box, Grid, Typography } from '@mui/material';
import CollegeListingCard from './CollegeListingCard';
import type { CollegeListItem } from '@/lib/college-hub/types';

interface SimilarCollegesProps {
  colleges: CollegeListItem[];
  stateSlug?: string | null;
}

export default function SimilarColleges({ colleges, stateSlug }: SimilarCollegesProps) {
  if (colleges.length === 0) return null;

  return (
    <Box>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
        Similar B.Arch Colleges{stateSlug ? ` in ${stateSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}` : ''}
      </Typography>
      <Grid container spacing={2}>
        {colleges.map((college) => (
          <Grid key={college.id} item xs={12} sm={6} md={3}>
            <CollegeListingCard college={college} compact />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
