'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Alert, Box, Button, Chip, CircularProgress, Container, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControl, IconButton, InputLabel, MenuItem,
  Paper, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Typography,
} from '@mui/material';
import UpgradeIcon from '@mui/icons-material/Upgrade';
import LaunchIcon from '@mui/icons-material/Launch';
import LogoutIcon from '@mui/icons-material/Logout';
import RefreshIcon from '@mui/icons-material/Refresh';

type Tier = 'free' | 'silver' | 'gold' | 'platinum';
type ContactStatus = 'never_contacted' | 'emailed_v1' | 'replied' | 'engaged' | 'claimed' | 'bounced' | 'opted_out';

interface CollegeRow {
  id: string;
  name: string;
  slug: string;
  state: string;
  state_slug: string | null;
  city: string;
  type: string | null;
  neram_tier: Tier | null;
  coa_approved: boolean;
  naac_grade: string | null;
  admissions_email: string | null;
  email: string | null;
  contact_status: ContactStatus | null;
  last_outreach_at: string | null;
  outreach_count: number | null;
  claimed: boolean | null;
  verified: boolean | null;
  data_completeness: number | null;
}

const TIER_COLORS: Record<Tier, 'default' | 'info' | 'warning' | 'success'> = {
  free: 'default',
  silver: 'info',
  gold: 'warning',
  platinum: 'success',
};

const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  never_contacted: 'Never contacted',
  emailed_v1: 'Emailed',
  replied: 'Replied',
  engaged: 'Engaged',
  claimed: 'Claimed',
  bounced: 'Bounced',
  opted_out: 'Opted out',
};

export default function AdminCollegesPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [staff, setStaff] = useState<{ name: string; email: string } | null>(null);
  const [colleges, setColleges] = useState<CollegeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filterState, setFilterState] = useState('Tamil Nadu');
  const [filterTier, setFilterTier] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCollege, setSelectedCollege] = useState<CollegeRow | null>(null);
  const [newTier, setNewTier] = useState<Tier>('gold');
  const [tierAmount, setTierAmount] = useState('');
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch('/api/admin/colleges/outreach/me', { cache: 'no-store' });
        if (cancelled) return;
        if (!res.ok) {
          router.push('/admin/staff-login?next=/admin/colleges');
          return;
        }
        const data = await res.json();
        setStaff({ name: data.name, email: data.email });
        fetchColleges();
      } catch {
        router.push('/admin/staff-login?next=/admin/colleges');
      } finally {
        if (!cancelled) setIsChecking(false);
      }
    }
    check();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchColleges() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterState) params.set('state', filterState);
      if (filterTier) params.set('tier', filterTier);
      if (filterStatus) params.set('status', filterStatus);
      if (searchQuery) params.set('q', searchQuery);
      const res = await fetch(`/api/admin/colleges/list?${params}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load');
        return;
      }
      setColleges(data.colleges);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  function openUpgradeDialog(college: CollegeRow) {
    setSelectedCollege(college);
    setNewTier((college.neram_tier as Tier) ?? 'gold');
    setTierAmount('');
    setDialogOpen(true);
  }

  async function handleUpgrade() {
    if (!selectedCollege) return;
    setUpgrading(true);
    try {
      const res = await fetch('/api/admin/colleges/tier', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          college_id: selectedCollege.id,
          tier: newTier,
          tier_amount: tierAmount ? Number(tierAmount) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Upgrade failed');
        return;
      }
      setDialogOpen(false);
      fetchColleges();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upgrade failed');
    } finally {
      setUpgrading(false);
    }
  }

  async function handleLogout() {
    await fetch('/api/admin/staff-logout', { method: 'POST' });
    router.push('/admin/staff-login');
  }

  const stats = useMemo(() => {
    const totals = colleges.reduce(
      (acc, c) => {
        acc.total++;
        if (c.contact_status === 'never_contacted') acc.neverContacted++;
        if (c.contact_status === 'emailed_v1') acc.emailed++;
        if (c.contact_status === 'replied' || c.contact_status === 'engaged' || c.contact_status === 'claimed') acc.engaged++;
        if ((c.neram_tier ?? 'free') === 'free') acc.free++;
        if (c.neram_tier && c.neram_tier !== 'free') acc.paid++;
        return acc;
      },
      { total: 0, neverContacted: 0, emailed: 0, engaged: 0, free: 0, paid: 0 },
    );
    return totals;
  }, [colleges]);

  if (isChecking) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'grey.50' }}>
      <Box sx={{ bgcolor: '#0f172a', color: 'white', py: 2, px: { xs: 2, sm: 3 } }}>
        <Container maxWidth="xl" disableGutters sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Stack direction="row" alignItems="center" gap={2}>
            <Typography variant="h6" fontWeight={700}>Neram Staff: Colleges</Typography>
            {staff && (
              <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                Signed in as {staff.name} ({staff.email})
              </Typography>
            )}
          </Stack>
          <Button onClick={handleLogout} startIcon={<LogoutIcon />} color="inherit" size="small">
            Sign out
          </Button>
        </Container>
      </Box>

      <Container maxWidth="xl" sx={{ py: { xs: 2, sm: 3 } }}>
        {/* Stats */}
        <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mb: 2 }}>
          <Chip size="small" label={`Total: ${stats.total}`} />
          <Chip size="small" color="default" label={`Never contacted: ${stats.neverContacted}`} />
          <Chip size="small" color="info" label={`Emailed: ${stats.emailed}`} />
          <Chip size="small" color="success" label={`Engaged/Replied: ${stats.engaged}`} />
          <Chip size="small" variant="outlined" label={`Free tier: ${stats.free}`} />
          <Chip size="small" variant="outlined" color="warning" label={`Paid tier: ${stats.paid}`} />
        </Stack>

        {/* Filters */}
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5} alignItems={{ md: 'center' }} flexWrap="wrap">
            <TextField
              label="Search by name"
              size="small"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchColleges()}
              sx={{ minWidth: 220, flex: 1 }}
            />
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>State</InputLabel>
              <Select value={filterState} label="State" onChange={(e) => setFilterState(e.target.value)}>
                <MenuItem value="">All states</MenuItem>
                <MenuItem value="Tamil Nadu">Tamil Nadu</MenuItem>
                <MenuItem value="Karnataka">Karnataka</MenuItem>
                <MenuItem value="Kerala">Kerala</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Tier</InputLabel>
              <Select value={filterTier} label="Tier" onChange={(e) => setFilterTier(e.target.value)}>
                <MenuItem value="">All tiers</MenuItem>
                <MenuItem value="free">Free</MenuItem>
                <MenuItem value="silver">Silver</MenuItem>
                <MenuItem value="gold">Gold</MenuItem>
                <MenuItem value="platinum">Platinum</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Contact status</InputLabel>
              <Select value={filterStatus} label="Contact status" onChange={(e) => setFilterStatus(e.target.value)}>
                <MenuItem value="">All</MenuItem>
                <MenuItem value="never_contacted">Never contacted</MenuItem>
                <MenuItem value="emailed_v1">Emailed</MenuItem>
                <MenuItem value="replied">Replied</MenuItem>
                <MenuItem value="engaged">Engaged</MenuItem>
                <MenuItem value="claimed">Claimed</MenuItem>
                <MenuItem value="bounced">Bounced</MenuItem>
              </Select>
            </FormControl>
            <Button variant="contained" onClick={fetchColleges} startIcon={<RefreshIcon />} disabled={loading} sx={{ minHeight: 40 }}>
              {loading ? 'Loading...' : 'Apply'}
            </Button>
          </Stack>
        </Paper>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <TableContainer component={Paper} variant="outlined">
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>City</TableCell>
                <TableCell>Tier</TableCell>
                <TableCell>Contact status</TableCell>
                <TableCell align="right">Outreach #</TableCell>
                <TableCell>Last outreach</TableCell>
                <TableCell>Admissions email</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {colleges.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell sx={{ fontWeight: 600, maxWidth: 300 }}>
                    {c.name}
                    {c.verified && <Chip size="small" label="verified" sx={{ ml: 1, height: 18, fontSize: '0.65rem' }} color="success" />}
                  </TableCell>
                  <TableCell>{c.city}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={c.neram_tier ?? 'free'}
                      color={TIER_COLORS[(c.neram_tier as Tier) ?? 'free']}
                      sx={{ textTransform: 'capitalize' }}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      variant="outlined"
                      label={CONTACT_STATUS_LABELS[(c.contact_status as ContactStatus) ?? 'never_contacted']}
                    />
                  </TableCell>
                  <TableCell align="right">{c.outreach_count ?? 0}</TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                    {c.last_outreach_at ? new Date(c.last_outreach_at).toLocaleDateString() : '-'}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>
                    {c.admissions_email ?? c.email ?? <em style={{ color: '#ef4444' }}>none</em>}
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" gap={0.5} justifyContent="flex-end">
                      <IconButton
                        size="small"
                        component={Link}
                        href={`/en/colleges/${c.state_slug ?? 'india'}/${c.slug}`}
                        target="_blank"
                        aria-label="Open college page"
                        title="Open college page (opens outreach FAB if you're staff)"
                      >
                        <LaunchIcon fontSize="small" />
                      </IconButton>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<UpgradeIcon />}
                        onClick={() => openUpgradeDialog(c)}
                      >
                        Tier
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && colleges.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No colleges match these filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Container>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Change partnership tier</DialogTitle>
        <DialogContent>
          {selectedCollege && (
            <Stack gap={2} sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {selectedCollege.name}
              </Typography>
              <FormControl fullWidth size="small">
                <InputLabel>New tier</InputLabel>
                <Select value={newTier} label="New tier" onChange={(e) => setNewTier(e.target.value as Tier)}>
                  <MenuItem value="free">Free</MenuItem>
                  <MenuItem value="silver">Silver</MenuItem>
                  <MenuItem value="gold">Gold (lead phone unmasked)</MenuItem>
                  <MenuItem value="platinum">Platinum (lead alerts + analytics)</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Annual amount (optional, INR)"
                type="number"
                size="small"
                value={tierAmount}
                onChange={(e) => setTierAmount(e.target.value)}
              />
              <Typography variant="caption" color="text.secondary">
                Sets tier_start_date to today and tier_end_date to one year from today.
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={upgrading}>Cancel</Button>
          <Button onClick={handleUpgrade} variant="contained" disabled={upgrading}>
            {upgrading ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
