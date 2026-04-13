'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Grid, Paper, Chip, Button, IconButton,
  Skeleton, Stack,
} from '@neram/ui';
import FavoriteIcon from '@mui/icons-material/Favorite';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SchoolIcon from '@mui/icons-material/School';
import { useFirebaseAuth, getFirebaseAuth } from '@neram/auth';

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || 'http://localhost:3010';

const TIER_COLORS: Record<string, { bg: string; color: string }> = {
  platinum: { bg: '#ede9fe', color: '#6d28d9' },
  gold:     { bg: '#fef9c3', color: '#92400e' },
  silver:   { bg: '#f1f5f9', color: '#475569' },
  free:     { bg: '#f8fafc', color: '#94a3b8' },
};

interface SavedCollege {
  id: string;
  name: string;
  short_name: string | null;
  slug: string;
  state_slug: string | null;
  city: string;
  state: string;
  neram_tier: string;
  logo_url: string | null;
  nirf_rank_architecture: number | null;
  arch_index_score: number | null;
  total_barch_seats: number | null;
  annual_fee_approx: number | null;
  saved_at: string;
}

export default function SavedCollegesPage() {
  const { user } = useFirebaseAuth();
  const [colleges, setColleges] = useState<SavedCollege[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  const loadSaved = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/colleges/saved', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const { colleges: data } = await res.json();
        setColleges(data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadSaved(); }, [loadSaved]);

  const handleRemove = async (college: SavedCollege) => {
    setRemoving(college.id);
    try {
      const auth = getFirebaseAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/colleges/saved', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ college_id: college.id }),
      });
      if (res.ok) {
        setColleges((prev) => prev.filter((c) => c.id !== college.id));
      }
    } finally {
      setRemoving(null);
    }
  };

  const collegeUrl = (college: SavedCollege) => {
    const stateSlug = college.state_slug ?? college.state.toLowerCase().replace(/\s+/g, '-');
    return `${MARKETING_URL}/en/colleges/${stateSlug}/${college.slug}`;
  };

  return (
    <Box sx={{ pb: { xs: 10, sm: 4 } }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
        <FavoriteIcon sx={{ color: '#ef4444', fontSize: 24 }} />
        <Box>
          <Typography variant="h5" fontWeight={700}>Saved Colleges</Typography>
          <Typography variant="body2" color="text.secondary">
            Architecture colleges you bookmarked on Neram
          </Typography>
        </Box>
      </Stack>

      {/* Loading skeletons */}
      {loading && (
        <Grid container spacing={2}>
          {[1, 2, 3].map((i) => (
            <Grid item xs={12} sm={6} md={4} key={i}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Skeleton variant="rectangular" height={60} sx={{ borderRadius: 1, mb: 1.5 }} />
                <Skeleton variant="text" width="70%" height={24} />
                <Skeleton variant="text" width="50%" height={20} />
                <Skeleton variant="rectangular" height={36} sx={{ borderRadius: 1, mt: 1.5 }} />
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Empty state */}
      {!loading && colleges.length === 0 && (
        <Paper
          variant="outlined"
          sx={{
            p: { xs: 4, sm: 6 },
            textAlign: 'center',
            borderRadius: 2,
            borderStyle: 'dashed',
          }}
        >
          <SchoolIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" fontWeight={600} sx={{ mb: 0.5 }}>
            No saved colleges yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Browse architecture colleges and tap the heart icon to save them here.
          </Typography>
          <Button
            variant="contained"
            component="a"
            href={`${MARKETING_URL}/en/colleges`}
            target="_blank"
            rel="noopener"
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Browse Architecture Colleges
          </Button>
        </Paper>
      )}

      {/* College grid */}
      {!loading && colleges.length > 0 && (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {colleges.length} {colleges.length === 1 ? 'college' : 'colleges'} saved
          </Typography>
          <Grid container spacing={2}>
            {colleges.map((college) => {
              const tier = TIER_COLORS[college.neram_tier] ?? TIER_COLORS.free;
              return (
                <Grid item xs={12} sm={6} md={4} key={college.id}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2, borderRadius: 2, height: '100%',
                      display: 'flex', flexDirection: 'column',
                      '&:hover': { borderColor: 'primary.main', boxShadow: 1 },
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                    }}
                  >
                    {/* College header */}
                    <Stack direction="row" alignItems="flex-start" gap={1.5} sx={{ mb: 1.5 }}>
                      {college.logo_url ? (
                        <Box
                          component="img"
                          src={college.logo_url}
                          alt={college.name}
                          sx={{ width: 44, height: 44, borderRadius: 1, objectFit: 'contain', border: '1px solid', borderColor: 'divider', flexShrink: 0 }}
                        />
                      ) : (
                        <Box sx={{ width: 44, height: 44, borderRadius: 1, bgcolor: 'grey.100', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <SchoolIcon sx={{ fontSize: 22, color: 'text.disabled' }} />
                        </Box>
                      )}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.3, mb: 0.25 }} noWrap>
                          {college.short_name ?? college.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {college.city}, {college.state}
                        </Typography>
                      </Box>
                      <IconButton
                        size="small"
                        onClick={() => handleRemove(college)}
                        disabled={removing === college.id}
                        aria-label="Remove from saved"
                        sx={{ color: '#ef4444', flexShrink: 0, mt: -0.5, mr: -0.5 }}
                      >
                        <FavoriteIcon fontSize="small" />
                      </IconButton>
                    </Stack>

                    {/* Tier + stats */}
                    <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mb: 1.5 }}>
                      <Chip
                        label={college.neram_tier}
                        size="small"
                        sx={{ bgcolor: tier.bg, color: tier.color, fontWeight: 600, fontSize: 11 }}
                      />
                      {college.nirf_rank_architecture && (
                        <Chip label={`NIRF #${college.nirf_rank_architecture}`} size="small" variant="outlined" sx={{ fontSize: 11 }} />
                      )}
                      {college.total_barch_seats && (
                        <Chip label={`${college.total_barch_seats} seats`} size="small" variant="outlined" sx={{ fontSize: 11 }} />
                      )}
                    </Stack>

                    {college.annual_fee_approx && (
                      <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5 }}>
                        ~{(college.annual_fee_approx / 100000).toFixed(1)} L/yr
                      </Typography>
                    )}

                    <Box sx={{ mt: 'auto' }}>
                      <Button
                        fullWidth
                        variant="outlined"
                        size="small"
                        component="a"
                        href={collegeUrl(college)}
                        target="_blank"
                        rel="noopener"
                        endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                        sx={{ textTransform: 'none', fontWeight: 600, fontSize: 13 }}
                      >
                        View College
                      </Button>
                    </Box>
                  </Paper>
                </Grid>
              );
            })}
          </Grid>
        </>
      )}
    </Box>
  );
}
