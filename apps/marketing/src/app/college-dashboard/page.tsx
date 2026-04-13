'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Paper, Grid, TextField, Button,
  CircularProgress, Alert, Chip, LinearProgress,
} from '@mui/material';
import SchoolIcon from '@mui/icons-material/School';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PeopleIcon from '@mui/icons-material/People';
import StarIcon from '@mui/icons-material/Star';
import SaveIcon from '@mui/icons-material/Save';
import { useCollegeDashboard } from './context';

interface CollegeProfile {
  id: string;
  name: string;
  slug: string;
  neram_tier: string;
  verified: boolean;
  about: string | null;
  phone: string | null;
  email: string | null;
  admissions_phone: string | null;
  admissions_email: string | null;
  website: string | null;
  youtube_channel_url: string | null;
  instagram_handle: string | null;
}

interface QuickStats {
  page_views_30d: number;
  lead_count: number;
  review_count: number;
}

function getCompletionPercent(profile: CollegeProfile): number {
  const fields: (keyof CollegeProfile)[] = [
    'about', 'phone', 'email', 'admissions_phone', 'admissions_email',
    'website', 'youtube_channel_url', 'instagram_handle',
  ];
  const filled = fields.filter((f) => !!profile[f]).length;
  return Math.round((filled / fields.length) * 100);
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, flex: 1, minWidth: { xs: '100%', sm: 140 } }}>
      <Stack direction="row" alignItems="center" gap={1.5}>
        <Box sx={{ color: '#16a34a' }}>{icon}</Box>
        <Box>
          <Typography variant="h5" fontWeight={700}>{value.toLocaleString('en-IN')}</Typography>
          <Typography variant="caption" color="text.secondary">{label}</Typography>
        </Box>
      </Stack>
    </Paper>
  );
}

export default function CollegeDashboardHome() {
  const { session, collegeAdmin } = useCollegeDashboard();
  const [profile, setProfile] = useState<CollegeProfile | null>(null);
  const [stats, setStats] = useState<QuickStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [saveError, setSaveError] = useState('');

  const [form, setForm] = useState({
    about: '',
    phone: '',
    email: '',
    admissions_phone: '',
    admissions_email: '',
    website: '',
    youtube_channel_url: '',
    instagram_handle: '',
  });

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const [profileRes, statsRes] = await Promise.all([
        fetch('/api/college-dashboard/profile', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
        fetch('/api/college-dashboard/analytics', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
      ]);
      if (profileRes.ok) {
        const json = await profileRes.json();
        setProfile(json.college);
        setForm({
          about: json.college.about ?? '',
          phone: json.college.phone ?? '',
          email: json.college.email ?? '',
          admissions_phone: json.college.admissions_phone ?? '',
          admissions_email: json.college.admissions_email ?? '',
          website: json.college.website ?? '',
          youtube_channel_url: json.college.youtube_channel_url ?? '',
          instagram_handle: json.college.instagram_handle ?? '',
        });
      }
      if (statsRes.ok) {
        const json = await statsRes.json();
        setStats(json);
      }
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!session?.access_token) return;
    setSaving(true);
    setSaveMsg('');
    setSaveError('');
    try {
      const res = await fetch('/api/college-dashboard/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSaveMsg('Profile saved successfully.');
      load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const completion = profile ? getCompletionPercent(profile) : 0;

  return (
    <Stack gap={3}>
      {/* Welcome header */}
      <Box>
        <Typography variant="h5" fontWeight={700}>
          Welcome, {collegeAdmin?.name ?? 'College Admin'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {profile?.name} College Dashboard
        </Typography>
      </Box>

      {/* Tier badge */}
      {profile && (
        <Stack direction="row" gap={1} alignItems="center">
          <Chip
            label={`${(profile.neram_tier ?? 'free').toUpperCase()} Tier`}
            size="small"
            sx={{
              bgcolor: profile.neram_tier === 'platinum' ? '#7c3aed'
                : profile.neram_tier === 'gold' ? '#d97706'
                : profile.neram_tier === 'silver' ? '#6b7280'
                : '#e5e7eb',
              color: profile.neram_tier && profile.neram_tier !== 'free' ? 'white' : 'text.secondary',
              fontWeight: 600,
              fontSize: 11,
            }}
          />
          {profile.verified && <Chip label="Verified" size="small" color="success" />}
        </Stack>
      )}

      {/* Quick stats */}
      {stats && (
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
          <StatCard label="Page Views (30 days)" value={stats.page_views_30d} icon={<VisibilityIcon />} />
          <StatCard label="Total Leads" value={stats.lead_count} icon={<PeopleIcon />} />
          <StatCard label="Approved Reviews" value={stats.review_count} icon={<StarIcon />} />
        </Stack>
      )}

      {/* Profile completion */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="subtitle2" fontWeight={600}>Profile Completion</Typography>
          <Typography variant="subtitle2" fontWeight={700} color={completion === 100 ? 'success.main' : 'warning.main'}>
            {completion}%
          </Typography>
        </Stack>
        <LinearProgress
          variant="determinate"
          value={completion}
          sx={{
            height: 6, borderRadius: 3,
            bgcolor: 'grey.200',
            '& .MuiLinearProgress-bar': {
              bgcolor: completion === 100 ? '#16a34a' : '#d97706',
            },
          }}
        />
        {completion < 100 && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            A complete profile attracts more students. Fill in all fields below.
          </Typography>
        )}
      </Paper>

      {/* Profile Editor */}
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2 }}>
        <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
          <SchoolIcon sx={{ color: '#16a34a' }} />
          <Typography variant="h6" fontWeight={700}>Edit Profile</Typography>
        </Stack>

        {saveMsg && <Alert severity="success" onClose={() => setSaveMsg('')} sx={{ mb: 2 }}>{saveMsg}</Alert>}
        {saveError && <Alert severity="error" onClose={() => setSaveError('')} sx={{ mb: 2 }}>{saveError}</Alert>}

        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField
              label="About Your College"
              value={form.about}
              onChange={(e) => setForm((f) => ({ ...f, about: e.target.value }))}
              fullWidth
              size="small"
              multiline
              rows={4}
              placeholder="Describe your college, programs, campus, and what makes you unique."
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="General Phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              fullWidth
              size="small"
              inputProps={{ inputMode: 'tel' }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="General Email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              fullWidth
              size="small"
              type="email"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Admissions Phone"
              value={form.admissions_phone}
              onChange={(e) => setForm((f) => ({ ...f, admissions_phone: e.target.value }))}
              fullWidth
              size="small"
              inputProps={{ inputMode: 'tel' }}
              helperText="Shown to prospective students"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Admissions Email"
              value={form.admissions_email}
              onChange={(e) => setForm((f) => ({ ...f, admissions_email: e.target.value }))}
              fullWidth
              size="small"
              type="email"
              helperText="Shown to prospective students"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Website URL"
              value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
              fullWidth
              size="small"
              type="url"
              placeholder="https://www.yourcollege.edu.in"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="YouTube Channel URL"
              value={form.youtube_channel_url}
              onChange={(e) => setForm((f) => ({ ...f, youtube_channel_url: e.target.value }))}
              fullWidth
              size="small"
              type="url"
              placeholder="https://youtube.com/@yourcollege"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Instagram Handle"
              value={form.instagram_handle}
              onChange={(e) => setForm((f) => ({ ...f, instagram_handle: e.target.value }))}
              fullWidth
              size="small"
              placeholder="@yourcollege"
              helperText="Include the @ symbol"
            />
          </Grid>
        </Grid>

        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
            onClick={handleSave}
            disabled={saving}
            sx={{ bgcolor: '#16a34a', '&:hover': { bgcolor: '#15803d' }, minWidth: 130 }}
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </Button>
        </Box>
      </Paper>
    </Stack>
  );
}
