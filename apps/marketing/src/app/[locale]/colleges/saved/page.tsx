'use client';

import { useState, useEffect } from 'react';
import { Container, Typography, Box, Grid, Button } from '@mui/material';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import Link from 'next/link';
import { getSavedColleges } from '@/components/college-hub/SaveCollegeButton';
import Breadcrumbs from '@/components/seo/Breadcrumbs';
import { tokens } from '@/design-system';

export default function SavedCollegesPage() {
  const [savedSlugs, setSavedSlugs] = useState<string[]>([]);

  useEffect(() => {
    setSavedSlugs(getSavedColleges());
  }, []);

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
      <Breadcrumbs items={[
        { name: 'Colleges', href: '/colleges' },
        { name: 'Saved Colleges' },
      ]} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <BookmarkIcon color="primary" />
        <Typography variant="h4" fontWeight={800}>Saved Colleges</Typography>
      </Box>
      {savedSlugs.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography color={tokens.inkMuted}>No saved colleges yet.</Typography>
          <Button component={Link} href="/colleges" variant="contained" sx={{ mt: 2 }}>
            Browse Colleges
          </Button>
        </Box>
      ) : (
        <Typography color={tokens.inkMuted} variant="body2" sx={{ mb: 2 }}>
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
                borderColor: tokens.line,
                borderRadius: 1,
                textDecoration: 'none',
                color: 'inherit',
                '&:hover': { borderColor: tokens.gold500, bgcolor: tokens.surface },
              }}
            >
              <Typography variant="subtitle2" fontWeight={700}>
                {slug
                  .replace(/-/g, ' ')
                  .replace(/\b\w/g, (c) => c.toUpperCase())}
              </Typography>
              <Typography variant="caption" color={tokens.inkMuted}>
                Click to view details
              </Typography>
            </Box>
          </Grid>
        ))}
      </Grid>
    </Container>
  );
}
