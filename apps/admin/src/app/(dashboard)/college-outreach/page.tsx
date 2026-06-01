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
import EditIcon from '@mui/icons-material/Edit';
import BlockIcon from '@mui/icons-material/Block';
import CallMergeIcon from '@mui/icons-material/CallMerge';
import RestoreIcon from '@mui/icons-material/Restore';
import { useMicrosoftAuth } from '@neram/auth';
import type { CollegeOutreachRow, CollegeTier, ContactStatus, CollegeStatus } from '@/lib/college-outreach/types';
import type { OutreachTemplateVariant } from '@/lib/college-outreach/templates';

const TIER_COLORS: Record<CollegeTier, 'default' | 'info' | 'warning' | 'success'> = {
  free: 'default',
  silver: 'info',
  gold: 'warning',
  platinum: 'success',
};

const LIFECYCLE_COLORS: Record<CollegeStatus, 'success' | 'default' | 'error' | 'warning'> = {
  active: 'success',
  duplicate: 'default',
  defunct: 'error',
  unverified: 'warning',
};

const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  never_contacted: 'Never contacted',
  emailed_v1: 'Emailed',
  replied: 'Replied',
  engaged: 'Engaged',
  claimed: 'Claimed',
  partner: 'Partner',
  bounced: 'Bounced',
  opted_out: 'Opted out',
};

const MAILTO_BODY_MAX = 1800;

// Templates the outreach dialog can pick, ordered by funnel stage. The send API
// enforces which contact_status each stage may go to (with a Send-anyway override).
const TEMPLATE_OPTIONS: Array<{ value: OutreachTemplateVariant; label: string }> = [
  { value: 'first_touch_v2', label: '1. First touch (v2, recommended)' },
  { value: 'content_request_v1', label: '2. Content request (after they reply)' },
  { value: 'partnership_pitch_v1', label: '3. Partnership pitch (warm)' },
  { value: 'payment_details_v1', label: '4. Payment details (after a yes)' },
  { value: 'onboarding_v1', label: '5. Onboarding (partner live)' },
  { value: 'first_touch_v1', label: 'First touch (v1, legacy)' },
];

// Short hints for the 3 subject lines, per template. The real subject is shown
// (and editable) in the Subject field once the preview loads.
const SUBJECT_HINTS: Record<string, [string, string, string]> = {
  first_touch_v2: ['Is the info correct?', 'Students are researching', 'We built a free profile'],
  content_request_v1: ['How we make it shine', 'Make it stand out', 'Content checklist'],
  partnership_pitch_v1: ['Reach and how to grow it', '2026 admission window', 'Priority reach'],
  payment_details_v1: ['Details and next step', 'Confirming partnership', 'Invoice and account'],
  onboarding_v1: ['Your page is live', 'Welcome aboard', 'Login is ready'],
  first_touch_v1: ['Quick review request', 'NATA 2026 aspirants', 'Help us keep it accurate'],
};

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

  const [filterState, setFilterState] = useState('');
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
  const [templateVariant, setTemplateVariant] = useState<OutreachTemplateVariant>('first_touch_v2');
  const [subjectVariant, setSubjectVariant] = useState<1 | 2 | 3>(1);
  const [subjectOverride, setSubjectOverride] = useState('');
  const [includeBcc, setIncludeBcc] = useState(true);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [duplicateHint, setDuplicateHint] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CollegeOutreachRow | null>(null);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [filterLifecycle, setFilterLifecycle] = useState(''); // '' => active (default)
  const [filterNeedsEmail, setFilterNeedsEmail] = useState(false);

  const [lifecycleTarget, setLifecycleTarget] = useState<CollegeOutreachRow | null>(null);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<CollegeOutreachRow | null>(null);
  const [mergeSurvivorId, setMergeSurvivorId] = useState('');
  const [actioning, setActioning] = useState(false);

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
      if (filterLifecycle) params.set('lifecycle', filterLifecycle);
      if (filterNeedsEmail) params.set('needs_email', 'true');
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
  }, [filterState, filterTier, filterStatus, filterLifecycle, filterNeedsEmail, searchQuery]);

  function openDeactivateDialog(college: CollegeOutreachRow) {
    setLifecycleTarget(college);
    setDeactivateReason('');
    setDeactivateDialogOpen(true);
  }

  async function handleSetLifecycle(college: CollegeOutreachRow, status: string, reason?: string) {
    setActioning(true);
    setError(null);
    try {
      const res = await fetch('/api/college-outreach/lifecycle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ college_id: college.id, status, reason }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Update failed'); return; }
      setToast(`${college.name} set to ${status}`);
      setDeactivateDialogOpen(false);
      fetchColleges();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setActioning(false);
    }
  }

  function openMergeDialog(college: CollegeOutreachRow) {
    setMergeTarget(college);
    setMergeSurvivorId('');
    setMergeDialogOpen(true);
  }

  async function handleMerge() {
    if (!mergeTarget || !mergeSurvivorId) { setError('Pick a college to merge into'); return; }
    setActioning(true);
    setError(null);
    try {
      const res = await fetch('/api/college-outreach/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duplicate_id: mergeTarget.id, survivor_id: mergeSurvivorId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Merge failed'); return; }
      setToast(`${mergeTarget.name} merged as duplicate`);
      setMergeDialogOpen(false);
      fetchColleges();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Merge failed');
    } finally {
      setActioning(false);
    }
  }

  // Refetch immediately when the lifecycle / needs-email quick filters change (and on mount).
  // The search / state / tier / contact-status filters apply via the Apply button instead.
  useEffect(() => { fetchColleges(); }, [filterLifecycle, filterNeedsEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  function openEditDialog(college: CollegeOutreachRow) {
    setEditTarget(college);
    setEditFields({
      name: college.name ?? '',
      admissions_email: college.admissions_email ?? '',
      email: college.email ?? '',
      email_source: college.email_source ?? '',
      phone: college.phone ?? '',
      website: college.website ?? '',
      city: college.city ?? '',
      naac_grade: college.naac_grade ?? '',
      total_barch_seats: college.total_barch_seats?.toString() ?? '',
      annual_fee_approx: college.annual_fee_approx?.toString() ?? '',
      affiliated_university: college.affiliated_university ?? '',
      type: college.type ?? '',
    });
    setEditDialogOpen(true);
  }

  async function handleSaveEdit() {
    if (!editTarget) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/college-outreach/college', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          college_id: editTarget.id,
          ...editFields,
          total_barch_seats: editFields.total_barch_seats ? Number(editFields.total_barch_seats) : null,
          annual_fee_approx: editFields.annual_fee_approx ? Number(editFields.annual_fee_approx) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Save failed'); return; }
      setToast(`Saved: ${editTarget.name}`);
      setEditDialogOpen(false);
      fetchColleges();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

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
    setTemplateVariant('first_touch_v2');
    setSubjectVariant(1);
    setSubjectOverride('');
    setIncludeBcc(true);
    setPreview(null);
    setDuplicateHint(null);
    setError(null);
    setOutreachDialogOpen(true);
    await fetchPreview(college, 1, '', 'first_touch_v2');
  }

  async function fetchPreview(
    college: CollegeOutreachRow,
    variant: 1 | 2 | 3,
    recipOverride: string,
    tmpl: OutreachTemplateVariant = templateVariant,
  ) {
    setLoadingPreview(true);
    try {
      const res = await fetch('/api/college-outreach/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          college_id: college.id,
          template_variant: tmpl,
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
          template_variant: templateVariant,
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
        if (c.contact_status === 'partner') acc.partner++;
        if (!c.admissions_email && !c.email) acc.needsEmail++;
        if (!c.neram_tier || c.neram_tier === 'free') acc.free++;
        else acc.paid++;
        return acc;
      },
      { total: 0, neverContacted: 0, emailed: 0, engaged: 0, partner: 0, needsEmail: 0, free: 0, paid: 0 },
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
        <Chip size="small" color="success" variant="filled" label={`Partner: ${stats.partner}`} />
        <Chip
          size="small"
          color={stats.needsEmail > 0 ? 'error' : 'default'}
          variant={filterNeedsEmail ? 'filled' : 'outlined'}
          onClick={() => { setFilterNeedsEmail((v) => !v); }}
          label={`Needs email: ${stats.needsEmail}`}
          sx={{ cursor: 'pointer' }}
        />
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
              <MenuItem value="Andhra Pradesh">Andhra Pradesh</MenuItem>
              <MenuItem value="Assam">Assam</MenuItem>
              <MenuItem value="Bihar">Bihar</MenuItem>
              <MenuItem value="Chandigarh">Chandigarh</MenuItem>
              <MenuItem value="Chhattisgarh">Chhattisgarh</MenuItem>
              <MenuItem value="Delhi">Delhi</MenuItem>
              <MenuItem value="Goa">Goa</MenuItem>
              <MenuItem value="Gujarat">Gujarat</MenuItem>
              <MenuItem value="Haryana">Haryana</MenuItem>
              <MenuItem value="Himachal Pradesh">Himachal Pradesh</MenuItem>
              <MenuItem value="Jammu and Kashmir">Jammu and Kashmir</MenuItem>
              <MenuItem value="Jharkhand">Jharkhand</MenuItem>
              <MenuItem value="Karnataka">Karnataka</MenuItem>
              <MenuItem value="Kerala">Kerala</MenuItem>
              <MenuItem value="Madhya Pradesh">Madhya Pradesh</MenuItem>
              <MenuItem value="Maharashtra">Maharashtra</MenuItem>
              <MenuItem value="Meghalaya">Meghalaya</MenuItem>
              <MenuItem value="Mizoram">Mizoram</MenuItem>
              <MenuItem value="Odisha">Odisha</MenuItem>
              <MenuItem value="Puducherry">Puducherry</MenuItem>
              <MenuItem value="Punjab">Punjab</MenuItem>
              <MenuItem value="Rajasthan">Rajasthan</MenuItem>
              <MenuItem value="Tamil Nadu">Tamil Nadu</MenuItem>
              <MenuItem value="Telangana">Telangana</MenuItem>
              <MenuItem value="Uttar Pradesh">Uttar Pradesh</MenuItem>
              <MenuItem value="Uttarakhand">Uttarakhand</MenuItem>
              <MenuItem value="West Bengal">West Bengal</MenuItem>
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
              <MenuItem value="partner">Partner</MenuItem>
              <MenuItem value="bounced">Bounced</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Lifecycle</InputLabel>
            <Select value={filterLifecycle} label="Lifecycle" onChange={(e) => setFilterLifecycle(e.target.value)}>
              <MenuItem value="">Active (default)</MenuItem>
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="duplicate">Duplicate</MenuItem>
              <MenuItem value="defunct">Defunct</MenuItem>
              <MenuItem value="unverified">Unverified</MenuItem>
            </Select>
          </FormControl>
          <FormControlLabel
            control={<Checkbox checked={filterNeedsEmail} onChange={(e) => setFilterNeedsEmail(e.target.checked)} />}
            label="Needs email"
          />
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
              <TableCell>Lifecycle</TableCell>
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
                  <Chip size="small" variant="outlined" label={c.status ?? 'active'}
                    color={LIFECYCLE_COLORS[(c.status as CollegeStatus) ?? 'active']}
                    sx={{ textTransform: 'capitalize' }} />
                </TableCell>
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
                    <Button size="small" variant="outlined" color="secondary" startIcon={<EditIcon />} onClick={() => openEditDialog(c)}>
                      Edit
                    </Button>
                    {(c.status ?? 'active') === 'active' ? (
                      <>
                        <IconButton size="small" color="error" aria-label="Deactivate" title="Mark defunct"
                          onClick={() => openDeactivateDialog(c)} disabled={actioning}>
                          <BlockIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="default" aria-label="Merge into another college" title="Merge duplicate"
                          onClick={() => openMergeDialog(c)} disabled={actioning}>
                          <CallMergeIcon fontSize="small" />
                        </IconButton>
                      </>
                    ) : (
                      <IconButton size="small" color="success" aria-label="Reactivate" title="Reactivate"
                        onClick={() => handleSetLifecycle(c, 'active')} disabled={actioning}>
                        <RestoreIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {!loading && colleges.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.secondary' }}>
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
              <Box sx={{ minWidth: 240 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Template</Typography>
                <Select value={templateVariant}
                  onChange={(e) => {
                    const t = e.target.value as OutreachTemplateVariant;
                    setTemplateVariant(t);
                    setSubjectOverride('');
                    if (outreachTarget) fetchPreview(outreachTarget, subjectVariant, recipient, t);
                  }}
                  fullWidth size="small" sx={{ mt: 0.5 }}>
                  {TEMPLATE_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </Box>
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
                  {(SUBJECT_HINTS[templateVariant] ?? SUBJECT_HINTS.first_touch_v2).map((hint, i) => (
                    <MenuItem key={i} value={i + 1}>{i + 1}. {hint}</MenuItem>
                  ))}
                </Select>
              </Box>
            </Stack>
            <TextField label="Subject" value={subjectOverride}
              onChange={(e) => setSubjectOverride(e.target.value)}
              fullWidth size="small" />
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

      {/* Deactivate dialog */}
      <Dialog open={deactivateDialogOpen} onClose={() => !actioning && setDeactivateDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Mark as defunct</DialogTitle>
        <DialogContent>
          {lifecycleTarget && (
            <Stack gap={2} sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {lifecycleTarget.name} will be hidden from the public site and excluded from outreach. The record is kept, not deleted, so you can reactivate it later.
              </Typography>
              <TextField label="Reason (optional)" value={deactivateReason}
                onChange={(e) => setDeactivateReason(e.target.value)} fullWidth size="small" multiline minRows={2} />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeactivateDialogOpen(false)} disabled={actioning}>Cancel</Button>
          <Button color="error" variant="contained" disabled={actioning}
            onClick={() => lifecycleTarget && handleSetLifecycle(lifecycleTarget, 'defunct', deactivateReason)}>
            {actioning ? 'Saving...' : 'Mark defunct'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Merge dialog */}
      <Dialog open={mergeDialogOpen} onClose={() => !actioning && setMergeDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Merge duplicate into another college</DialogTitle>
        <DialogContent>
          {mergeTarget && (
            <Stack gap={2} sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {mergeTarget.name} will be marked as a duplicate and hidden. Its outreach history moves to the surviving college you choose.
              </Typography>
              <FormControl fullWidth size="small">
                <InputLabel>Merge into (survivor)</InputLabel>
                <Select value={mergeSurvivorId} label="Merge into (survivor)"
                  onChange={(e) => setMergeSurvivorId(e.target.value)}>
                  {colleges.filter((o) => o.id !== mergeTarget.id).map((o) => (
                    <MenuItem key={o.id} value={o.id}>{o.name} ({o.city})</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMergeDialogOpen(false)} disabled={actioning}>Cancel</Button>
          <Button color="primary" variant="contained" disabled={actioning || !mergeSurvivorId} onClick={handleMerge}>
            {actioning ? 'Merging...' : 'Merge'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit college dialog */}
      <Dialog open={editDialogOpen} onClose={() => !saving && setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1.5 }}>
          <Typography variant="h6" fontWeight={700}>Edit: {editTarget?.name}</Typography>
          <IconButton onClick={() => setEditDialogOpen(false)} size="small" disabled={saving}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack gap={2} sx={{ mt: 1 }}>
            <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1 }}>Contact details</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
              <TextField
                label="Admissions email"
                size="small"
                fullWidth
                value={editFields.admissions_email ?? ''}
                onChange={(e) => setEditFields((f) => ({ ...f, admissions_email: e.target.value }))}
                helperText="Primary email for outreach"
              />
              <TextField
                label="General email"
                size="small"
                fullWidth
                value={editFields.email ?? ''}
                onChange={(e) => setEditFields((f) => ({ ...f, email: e.target.value }))}
                helperText="Fallback if no admissions email"
              />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
              <FormControl size="small" fullWidth>
                <InputLabel>Email source</InputLabel>
                <Select
                  label="Email source"
                  value={editFields.email_source ?? ''}
                  onChange={(e) => setEditFields((f) => ({ ...f, email_source: e.target.value }))}
                >
                  <MenuItem value=""><em>Not set</em></MenuItem>
                  <MenuItem value="official_site">Official site</MenuItem>
                  <MenuItem value="manual">Manual research</MenuItem>
                  <MenuItem value="directory">Directory (COA / JoSAA)</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Phone"
                size="small"
                fullWidth
                value={editFields.phone ?? ''}
                onChange={(e) => setEditFields((f) => ({ ...f, phone: e.target.value }))}
              />
              <TextField
                label="Website"
                size="small"
                fullWidth
                value={editFields.website ?? ''}
                onChange={(e) => setEditFields((f) => ({ ...f, website: e.target.value }))}
                placeholder="https://..."
              />
            </Stack>
            <Divider />
            <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1 }}>College info</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
              <TextField
                label="Name"
                size="small"
                fullWidth
                value={editFields.name ?? ''}
                onChange={(e) => setEditFields((f) => ({ ...f, name: e.target.value }))}
              />
              <TextField
                label="City"
                size="small"
                fullWidth
                value={editFields.city ?? ''}
                onChange={(e) => setEditFields((f) => ({ ...f, city: e.target.value }))}
              />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
              <TextField
                label="Affiliated university"
                size="small"
                fullWidth
                value={editFields.affiliated_university ?? ''}
                onChange={(e) => setEditFields((f) => ({ ...f, affiliated_university: e.target.value }))}
              />
              <TextField
                label="Type"
                size="small"
                fullWidth
                value={editFields.type ?? ''}
                onChange={(e) => setEditFields((f) => ({ ...f, type: e.target.value }))}
                placeholder="Government / Private / Deemed"
              />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
              <TextField
                label="NAAC grade"
                size="small"
                sx={{ flex: 1 }}
                value={editFields.naac_grade ?? ''}
                onChange={(e) => setEditFields((f) => ({ ...f, naac_grade: e.target.value }))}
                placeholder="A, A+, B+..."
              />
              <TextField
                label="B.Arch seats"
                size="small"
                type="number"
                sx={{ flex: 1 }}
                value={editFields.total_barch_seats ?? ''}
                onChange={(e) => setEditFields((f) => ({ ...f, total_barch_seats: e.target.value }))}
              />
              <TextField
                label="Annual fee (INR)"
                size="small"
                type="number"
                sx={{ flex: 1 }}
                value={editFields.annual_fee_approx ?? ''}
                onChange={(e) => setEditFields((f) => ({ ...f, annual_fee_approx: e.target.value }))}
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setEditDialogOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSaveEdit} variant="contained" disabled={saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={4500} onClose={() => setToast(null)}
        message={toast ?? ''} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Box>
  );
}
