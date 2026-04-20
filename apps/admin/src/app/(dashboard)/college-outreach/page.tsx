'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary,
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControl, FormControlLabel, IconButton,
  InputLabel, MenuItem, Paper, Select, Snackbar, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import UpgradeIcon from '@mui/icons-material/Upgrade';
import EmailIcon from '@mui/icons-material/Email';
import LaunchIcon from '@mui/icons-material/Launch';
import SendIcon from '@mui/icons-material/Send';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import { useMicrosoftAuth } from '@neram/auth';
import type { CollegeOutreachRow, CollegeTier, ContactStatus } from '@/lib/college-outreach/types';

const TIER_COLORS: Record<CollegeTier, 'default' | 'info' | 'warning' | 'success'> = {
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

const MAILTO_BODY_MAX = 1800;

function truncateForMailto(text: string, pageUrl: string): string {
  if (text.length <= MAILTO_BODY_MAX) return text;
  const trailer = `\n\n... full text at ${pageUrl}`;
  return text.slice(0, MAILTO_BODY_MAX - trailer.length) + trailer;
}

interface PreviewData {
  subject: string;
  html: string;
  text: string;
  recipient: string;
  bcc: string | null;
  contact_status: string;
  outreach_count: number;
  last_outreach_at: string | null;
}

export default function CollegeOutreachPage() {
  const { user } = useMicrosoftAuth();

  const [colleges, setColleges] = useState<CollegeOutreachRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filterState, setFilterState] = useState('Tamil Nadu');
  const [filterTier, setFilterTier] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [tierDialogOpen, setTierDialogOpen] = useState(false);
  const [tierTarget, setTierTarget] = useState<CollegeOutreachRow | null>(null);
  const [newTier, setNewTier] = useState<CollegeTier>('gold');
  const [tierAmount, setTierAmount] = useState('');
  const [upgrading, setUpgrading] = useState(false);

  const [outreachDialogOpen, setOutreachDialogOpen] = useState(false);
  const [outreachTarget, setOutreachTarget] = useState<CollegeOutreachRow | null>(null);
  const [recipient, setRecipient] = useState('');
  const [subjectVariant, setSubjectVariant] = useState<1 | 2 | 3>(1);
  const [subjectOverride, setSubjectOverride] = useState('');
  const [includeBcc, setIncludeBcc] = useState(true);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [duplicateHint, setDuplicateHint] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const staffName = user?.name || user?.email || 'Neram Staff';
  const staffEmail = user?.email || '';

  const fetchColleges = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterState) params.set('state', filterState);
      if (filterTier) params.set('tier', filterTier);
      if (filterStatus) params.set('status', filterStatus);
      if (searchQuery) params.set('q', searchQuery);
      const res = await fetch(`/api/college-outreach/list?${params}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to load'); return; }
      setColleges(data.colleges);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [filterState, filterTier, filterStatus, searchQuery]);

  useEffect(() => { fetchColleges(); }, []); // initial load
  // eslint-disable-next-line react-hooks/exhaustive-deps

  function openTierDialog(college: CollegeOutreachRow) {
    setTierTarget(college);
    setNewTier((college.neram_tier as CollegeTier) ?? 'gold');
    setTierAmount('');
    setTierDialogOpen(true);
  }

  async function handleUpgrade() {
    if (!tierTarget) return;
    setUpgrading(true);
    try {
      const res = await fetch('/api/college-outreach/tier', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          college_id: tierTarget.id,
          tier: newTier,
          tier_amount: tierAmount ? Number(tierAmount) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Upgrade failed'); return; }
      setTierDialogOpen(false);
      fetchColleges();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upgrade failed');
    } finally {
      setUpgrading(false);
    }
  }

  async function openOutreachDialog(college: CollegeOutreachRow) {
    setOutreachTarget(college);
    setRecipient('');
    setSubjectVariant(1);
    setSubjectOverride('');
    setIncludeBcc(true);
    setPreview(null);
    setDuplicateHint(null);
    setError(null);
    setOutreachDialogOpen(true);
    await fetchPreview(college, 1, '');
  }

  async function fetchPreview(
    college: CollegeOutreachRow,
    variant: 1 | 2 | 3,
    recipOverride: string,
  ) {
    setLoadingPreview(true);
    try {
      const res = await fetch('/api/college-outreach/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          college_id: college.id,
          subject_variant: variant,
          preview_only: true,
          override_to_email: recipOverride || undefined,
          include_bcc: true,
          staff_name: staffName,
          staff_email: staffEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Preview failed'); return; }
      setPreview(data);
      if (!recipOverride && !recipient) setRecipient(data.recipient);
      setSubjectOverride(data.subject);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleSend(force = false) {
    if (!outreachTarget || !recipient) { setError('Recipient required'); return; }
    setSending(true);
    setDuplicateHint(null);
    setError(null);
    try {
      const res = await fetch('/api/college-outreach/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          college_id: outreachTarget.id,
          subject_variant: subjectVariant,
          override_to_email: recipient,
          override_subject: subjectOverride || undefined,
          include_bcc: includeBcc,
          force,
          staff_name: staffName,
          staff_email: staffEmail,
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setDuplicateHint(data.hint || 'Duplicate send. Click Send anyway to override.');
        return;
      }
      if (!res.ok) { setError(data.error || 'Send failed'); return; }
      setToast(`Sent. Message id: ${data.message_id}`);
      setOutreachDialogOpen(false);
      fetchColleges();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  function handleOutlookMailto() {
    if (!preview || !recipient || !outreachTarget) return;
    const pageUrl = `https://neramclasses.com/en/colleges/${outreachTarget.state_slug ?? 'india'}/${outreachTarget.slug}`;
    const body = truncateForMailto(preview.text, pageUrl);
    const params = new URLSearchParams({
      subject: subjectOverride || preview.subject,
      body,
    });
    if (includeBcc && preview.bcc) params.set('bcc', preview.bcc);
    window.location.href = `mailto:${encodeURIComponent(recipient)}?${params.toString()}`;
  }

  const stats = useMemo(() => {
    return colleges.reduce(
      (acc, c) => {
        acc.total++;
        if (c.contact_status === 'never_contacted' || !c.contact_status) acc.neverContacted++;
        if (c.contact_status === 'emailed_v1') acc.emailed++;
        if (c.contact_status === 'replied' || c.contact_status === 'engaged' || c.contact_status === 'claimed') acc.engaged++;
        if (!c.neram_tier || c.neram_tier === 'free') acc.free++;
        else acc.paid++;
        return acc;
      },
      { total: 0, neverContacted: 0, emailed: 0, engaged: 0, free: 0, paid: 0 },
    );
  }, [colleges]);

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        College Outreach
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Send first-touch emails to colleges and manage partnership tiers. Signed in as <strong>{staffName}</strong>.
      </Typography>

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
          <Button variant="contained" onClick={fetchColleges} startIcon={<RefreshIcon />} disabled={loading}>
            {loading ? 'Loading...' : 'Apply'}
          </Button>
        </Stack>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

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
              <TableCell align="right" sx={{ minWidth: 200 }}>Actions</TableCell>
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
                  <Chip size="small" label={c.neram_tier ?? 'free'}
                    color={TIER_COLORS[(c.neram_tier as CollegeTier) ?? 'free']}
                    sx={{ textTransform: 'capitalize' }} />
                </TableCell>
                <TableCell>
                  <Chip size="small" variant="outlined"
                    label={CONTACT_STATUS_LABELS[(c.contact_status as ContactStatus) ?? 'never_contacted']} />
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
                    <Button size="small" variant="contained" startIcon={<EmailIcon />} onClick={() => openOutreachDialog(c)} sx={{ minWidth: 100 }}>
                      Outreach
                    </Button>
                    <Button size="small" variant="outlined" startIcon={<UpgradeIcon />} onClick={() => openTierDialog(c)}>
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

      {/* Tier dialog */}
      <Dialog open={tierDialogOpen} onClose={() => setTierDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Change partnership tier</DialogTitle>
        <DialogContent>
          {tierTarget && (
            <Stack gap={2} sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">{tierTarget.name}</Typography>
              <FormControl fullWidth size="small">
                <InputLabel>New tier</InputLabel>
                <Select value={newTier} label="New tier" onChange={(e) => setNewTier(e.target.value as CollegeTier)}>
                  <MenuItem value="free">Free</MenuItem>
                  <MenuItem value="silver">Silver</MenuItem>
                  <MenuItem value="gold">Gold (lead phone unmasked)</MenuItem>
                  <MenuItem value="platinum">Platinum (lead alerts + analytics)</MenuItem>
                </Select>
              </FormControl>
              <TextField label="Annual amount (optional, INR)" type="number" size="small"
                value={tierAmount} onChange={(e) => setTierAmount(e.target.value)} />
              <Typography variant="caption" color="text.secondary">
                Sets tier_start_date to today and tier_end_date to one year from today.
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTierDialogOpen(false)} disabled={upgrading}>Cancel</Button>
          <Button onClick={handleUpgrade} variant="contained" disabled={upgrading}>
            {upgrading ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Outreach dialog */}
      <Dialog open={outreachDialogOpen} onClose={() => !sending && setOutreachDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1.5 }}>
          <Box>
            <Typography variant="h6" fontWeight={700}>Outreach: {outreachTarget?.name}</Typography>
            <Typography variant="caption" color="text.secondary">Signed in as {staffName}</Typography>
          </Box>
          <IconButton onClick={() => setOutreachDialogOpen(false)} size="small" aria-label="Close" disabled={sending}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack gap={2}>
            <TextField label="Recipient email" value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              fullWidth size="medium" required />
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
              <Box sx={{ minWidth: 220 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Subject variant</Typography>
                <Select value={subjectVariant}
                  onChange={(e) => {
                    const v = Number(e.target.value) as 1 | 2 | 3;
                    setSubjectVariant(v);
                    setSubjectOverride('');
                    if (outreachTarget) fetchPreview(outreachTarget, v, recipient);
                  }}
                  fullWidth size="small" sx={{ mt: 0.5 }}>
                  <MenuItem value={1}>1. Quick review request</MenuItem>
                  <MenuItem value={2}>2. NATA 2026 aspirants</MenuItem>
                  <MenuItem value={3}>3. Help us keep it accurate</MenuItem>
                </Select>
              </Box>
              <TextField label="Subject" value={subjectOverride}
                onChange={(e) => setSubjectOverride(e.target.value)}
                fullWidth size="small" sx={{ flex: 1 }} />
            </Stack>
            <FormControlLabel
              control={<Checkbox checked={includeBcc} onChange={(e) => setIncludeBcc(e.target.checked)} />}
              label="BCC info@neramclasses.com (archive in our inbox)"
            />
            <Divider />
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 1 }}>
                HTML preview
              </Typography>
              {loadingPreview ? (
                <Stack alignItems="center" py={4}><CircularProgress size={22} /></Stack>
              ) : preview ? (
                <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                  <Box component="iframe" title="Email HTML preview" srcDoc={preview.html}
                    sx={{ width: '100%', height: 440, border: 0, display: 'block', bgcolor: '#fff' }} />
                </Box>
              ) : null}
            </Box>
            {preview && (
              <Accordion variant="outlined" disableGutters>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="body2" fontWeight={600}>Plain text version</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Box component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace', fontSize: '0.8rem', m: 0 }}>
                    {preview.text}
                  </Box>
                </AccordionDetails>
              </Accordion>
            )}
            {duplicateHint && (
              <Alert severity="warning"
                action={<Button color="inherit" size="small" onClick={() => handleSend(true)} disabled={sending}>Send anyway</Button>}>
                {duplicateHint}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1, flexWrap: 'wrap' }}>
          <Button onClick={() => setOutreachDialogOpen(false)} disabled={sending}>Cancel</Button>
          <Button onClick={handleOutlookMailto} variant="outlined" startIcon={<LaunchIcon />} disabled={!preview || !recipient}>
            Open in Outlook
          </Button>
          <Button onClick={() => handleSend(false)} variant="contained"
            startIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
            disabled={!preview || !recipient || sending} sx={{ minWidth: 180 }}>
            {sending ? 'Sending...' : 'Send via Neram'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={4500} onClose={() => setToast(null)}
        message={toast ?? ''} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Box>
  );
}
