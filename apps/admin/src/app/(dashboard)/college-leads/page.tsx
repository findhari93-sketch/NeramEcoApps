'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Paper, Snackbar, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Tabs, Tab, TextField,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import ReportIcon from '@mui/icons-material/Report';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useMicrosoftAuth } from '@neram/auth';

type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'spam' | 'all';
type Decision = 'approve' | 'reject' | 'spam';

interface LeadRow {
  id: string;
  college_id: string;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  nata_score: number | null;
  message: string | null;
  source: string | null;
  status: string;
  admin_review_status: string | null;
  admin_reviewed_at: string | null;
  admin_reviewed_by: string | null;
  admin_notes: string | null;
  created_at: string;
  colleges: {
    name: string;
    slug: string;
    state_slug: string | null;
    neram_tier: string | null;
    email: string | null;
    admissions_email: string | null;
  } | null;
}

const STATUS_COLORS: Record<string, 'default' | 'warning' | 'success' | 'error'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'default',
  spam: 'error',
};

export default function CollegeLeadsReviewPage() {
  const { user } = useMicrosoftAuth();
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0, spam: 0 });
  const [statusFilter, setStatusFilter] = useState<ReviewStatus>('pending');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogLead, setDialogLead] = useState<LeadRow | null>(null);
  const [dialogDecision, setDialogDecision] = useState<Decision>('approve');
  const [dialogNotes, setDialogNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const staffName = user?.name || user?.email || 'Neram Staff';
  const staffEmail = user?.email || '';

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('status', statusFilter);
      const res = await fetch(`/api/college-leads?${params}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load');
        return;
      }
      setLeads(data.leads);
      setCounts(data.counts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  function openDecisionDialog(lead: LeadRow, decision: Decision) {
    setDialogLead(lead);
    setDialogDecision(decision);
    setDialogNotes('');
    setDialogOpen(true);
  }

  async function handleDecision() {
    if (!dialogLead) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/college-leads/${dialogLead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: dialogDecision,
          notes: dialogNotes || undefined,
          staff_name: staffName,
          staff_email: staffEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Decision failed');
        return;
      }
      if (dialogDecision === 'approve') {
        if (data.notification?.success) {
          setToast(`Approved, college notified (msg ${data.notification.messageId?.slice(0, 8)}...)`);
        } else if (data.notification?.skipped === 'no_recipient') {
          setToast('Approved, but college has no email on record. Notification not sent.');
        } else {
          setToast(`Approved, but notification failed: ${data.notification?.error}`);
        }
      } else {
        setToast(`Lead marked as ${dialogDecision}. Hidden from college.`);
      }
      setDialogOpen(false);
      fetchLeads();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Decision failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        College Leads Review
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Review student interest submissions before they reach colleges. Approve to release the lead and send the notification email.
      </Typography>

      <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mb: 2 }}>
        <Chip size="small" color="warning" label={`Pending: ${counts.pending}`} />
        <Chip size="small" color="success" label={`Approved: ${counts.approved}`} />
        <Chip size="small" label={`Rejected: ${counts.rejected}`} />
        <Chip size="small" color="error" label={`Spam: ${counts.spam}`} />
      </Stack>

      <Paper variant="outlined" sx={{ mb: 2 }}>
        <Tabs
          value={statusFilter}
          onChange={(_, v) => setStatusFilter(v)}
          variant="scrollable"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab value="pending" label={`Pending (${counts.pending})`} />
          <Tab value="approved" label={`Approved (${counts.approved})`} />
          <Tab value="rejected" label="Rejected" />
          <Tab value="spam" label="Spam" />
          <Tab value="all" label="All" />
        </Tabs>
      </Paper>

      <Stack direction="row" alignItems="center" gap={2} sx={{ mb: 2 }}>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchLeads} disabled={loading} size="small">
          {loading ? 'Loading...' : 'Refresh'}
        </Button>
        <Typography variant="caption" color="text.secondary">
          Showing {leads.length} {statusFilter !== 'all' && statusFilter} leads
        </Typography>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      <TableContainer component={Paper} variant="outlined">
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Submitted</TableCell>
              <TableCell>College</TableCell>
              <TableCell>Student name</TableCell>
              <TableCell>Phone</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>City</TableCell>
              <TableCell align="right">NATA</TableCell>
              <TableCell>Message</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right" sx={{ minWidth: 260 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {leads.map((lead) => (
              <TableRow key={lead.id} hover>
                <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
                  {new Date(lead.created_at).toLocaleString()}
                </TableCell>
                <TableCell sx={{ fontWeight: 600, maxWidth: 220 }}>
                  {lead.colleges?.name ?? '-'}
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{lead.name}</TableCell>
                <TableCell>{lead.phone}</TableCell>
                <TableCell sx={{ fontSize: '0.8rem' }}>{lead.email ?? '-'}</TableCell>
                <TableCell sx={{ fontSize: '0.8rem' }}>{lead.city ?? '-'}</TableCell>
                <TableCell align="right">{lead.nata_score ?? '-'}</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', maxWidth: 240, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {lead.message ?? '-'}
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={lead.admin_review_status ?? 'pending'}
                    color={STATUS_COLORS[lead.admin_review_status ?? 'pending']}
                    sx={{ textTransform: 'capitalize' }}
                  />
                </TableCell>
                <TableCell align="right">
                  {lead.admin_review_status === 'pending' ? (
                    <Stack direction="row" gap={0.5} justifyContent="flex-end" flexWrap="wrap">
                      <Button size="small" variant="contained" color="success" startIcon={<CheckCircleIcon />}
                        onClick={() => openDecisionDialog(lead, 'approve')} sx={{ minWidth: 100 }}>
                        Approve
                      </Button>
                      <Button size="small" variant="outlined" startIcon={<CancelIcon />}
                        onClick={() => openDecisionDialog(lead, 'reject')}>
                        Reject
                      </Button>
                      <Button size="small" variant="outlined" color="error" startIcon={<ReportIcon />}
                        onClick={() => openDecisionDialog(lead, 'spam')}>
                        Spam
                      </Button>
                    </Stack>
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      {lead.admin_reviewed_by ?? '-'}
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!loading && leads.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  No {statusFilter !== 'all' ? statusFilter : ''} leads.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={() => !submitting && setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {dialogDecision === 'approve' && 'Approve lead and notify college'}
          {dialogDecision === 'reject' && 'Reject lead'}
          {dialogDecision === 'spam' && 'Mark lead as spam'}
        </DialogTitle>
        <DialogContent>
          {dialogLead && (
            <Stack gap={2} sx={{ mt: 1 }}>
              <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'grey.50' }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>LEAD</Typography>
                <Typography variant="body2">{dialogLead.name}, {dialogLead.phone}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {dialogLead.colleges?.name ?? '-'}
                </Typography>
              </Paper>
              {dialogDecision === 'approve' && (
                <Alert severity="info" sx={{ py: 0.5 }}>
                  Approving will email {dialogLead.colleges?.admissions_email || dialogLead.colleges?.email || 'the college admissions inbox'} and make this lead visible on their dashboard.
                </Alert>
              )}
              {dialogDecision !== 'approve' && (
                <Alert severity="warning" sx={{ py: 0.5 }}>
                  This lead will be hidden from the college forever. No email is sent.
                </Alert>
              )}
              <TextField
                label="Notes (optional)"
                value={dialogNotes}
                onChange={(e) => setDialogNotes(e.target.value)}
                fullWidth
                size="small"
                multiline
                minRows={2}
                maxRows={5}
                placeholder="Internal note on why you made this decision"
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={submitting}>Cancel</Button>
          <Button
            onClick={handleDecision}
            variant="contained"
            color={dialogDecision === 'approve' ? 'success' : dialogDecision === 'spam' ? 'error' : 'primary'}
            disabled={submitting}
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {submitting ? 'Saving...' : `Confirm ${dialogDecision}`}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={5500} onClose={() => setToast(null)}
        message={toast ?? ''} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Box>
  );
}
