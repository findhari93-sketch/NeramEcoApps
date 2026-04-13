'use client';

import { useState, useEffect } from 'react';
import { Container, Typography, Box, Grid, Button } from '@mui/material';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import Link from 'next/link';
import { getSavedColleges } from '@/components/college-hub/SaveCollegeButton';

export default function SavedCollegesPage() {
  const [savedSlugs, setSavedSlugs] = useState<string[]>([]);

  useEffect(() => {
    setSavedSlugs(getSavedColleges());
  }, []);

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <BookmarkIcon color="primary" />
        <Typography variant="h4" fontWeight={800}>Saved Colleges</Typography>
      </Box>
      {savedSlugs.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography color="text.secondary">No saved colleges yet.</Typography>
          <Button component={Link} href="/colleges" variant="contained" sx={{ mt: 2 }}>
            Browse Colleges
          </Button>
        </Box>
      ) : (
        <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
          You have {savedSlugs.length} saved college{savedSlugs.length !== 1 ? 's' : ''}. Visit each page to view details.
        </Typography>
      )}
      <Grid container spacing={2}>
        {savedSlugs.map((slug) => (
          <Grid item xs={12} sm={6} md={4} key={slug}>
            <Box
              component={Link}
              href={`/colleges/tamil-nadu/${slug}`}
              sx={{
                display: 'block',
                p: 2,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                textDecoration: 'none',
                color: 'inherit',
                '&:hover': { borderColor: 'primary.main', bgcolor: '#f0f9ff' },
              }}
            >
              <Typography variant="subtitle2" fontWeight={700}>
                {slug
                  .replace(/-/g, ' ')
                  .replace(/\b\w/g, (c) => c.toUpperCase())}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Click to view details
              </Typography>
            </Box>
          </Grid>
        ))}
      </Grid>
    </Container>
  );
}
