'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Chip, Button, TextField, Stack,
  CircularProgress, Alert, Dialog, DialogTitle, DialogContent,
  DialogActions, Link, Tooltip,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';

type PartnershipStatus = 'none' | 'pending' | 'approved' | 'rejected';

interface CollegePartnership {
  id: string;
  name: string;
  short_name: string | null;
  slug: string;
  neram_tier: string;
  partnership_page_url: string;
  partnership_page_status: PartnershipStatus;
  partnership_page_notes: string | null;
  partnership_page_submitted_at: string | null;
}

const STATUS_CONFIG: Record<PartnershipStatus, { label: string; color: 'default' | 'warning' | 'success' | 'error' }> = {
  none:     { label: 'None',          color: 'default'  },
  pending:  { label: 'Pending Review', color: 'warning' },
  approved: { label: 'Approved',       color: 'success' },
  rejected: { label: 'Rejected',       color: 'error'   },
};

const TIER_COLORS: Record<string, string> = {
  platinum: '#7c3aed',
  gold:     '#d97706',
  silver:   '#64748b',
  free:     '#94a3b8',
};

export default function PartnershipReviewPage() {
  const [colleges, setColleges] = useState<CollegePartnership[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | PartnershipStatus>('pending');

  const [reviewDialog, setReviewDialog] = useState<{ open: boolean; college: CollegePartnership | null; action: 'approve' | 'reject' | null }>({
    open: false, college: null, action: null,
  });
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/college-hub/partnership');
      const json = await res.json();
      setColleges(json.colleges ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'all' ? colleges : colleges.filter((c) => c.partnership_page_status === filter);

  const openReview = (college: CollegePartnership, action: 'approve' | 'reject') => {
    setNotes('');
    setReviewDialog({ open: true, college, action });
  };

  const handleReview = async () => {
    if (!reviewDialog.college || !reviewDialog.action) return;
    if (reviewDialog.action === 'reject' && !notes.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/college-hub/partnership', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          college_id: reviewDialog.college.id,
          status: reviewDialog.action === 'approve' ? 'approved' : 'rejected',
          notes: reviewDialog.action === 'reject' ? notes.trim() : null,
        }),
      });
      if (res.ok) {
        setToast({ msg: `Partnership ${reviewDialog.action === 'approve' ? 'approved' : 'rejected'} for ${reviewDialog.college.name}`, severity: 'success' });
        setReviewDialog({ open: false, college: null, action: null });
        load();
      } else {
        const json = await res.json();
        setToast({ msg: json.error ?? 'Action failed', severity: 'error' });
      }
    } finally {
      setSaving(false);
    }
  };

  const counts = {
    all:      colleges.length,
    pending:  colleges.filter((c) => c.partnership_page_status === 'pending').length,
    approved: colleges.filter((c) => c.partnership_page_status === 'approved').length,
    rejected: colleges.filter((c) => c.partnership_page_status === 'rejected').length,
  };

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Partnership Pages</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            Review college-submitted backlink pages recommending Neram Classes
          </Typography>
        </Box>
        <Button startIcon={<RefreshIcon />} onClick={load} size="small" variant="outlined">
          Refresh
        </Button>
      </Stack>

      {toast && (
        <Alert severity={toast.severity} onClose={() => setToast(null)} sx={{ mb: 2, borderRadius: 1.5 }}>
          {toast.msg}
        </Alert>
      )}

      {/* Filter tabs */}
      <Stack direction="row" gap={1} sx={{ mb: 2.5, flexWrap: 'wrap' }}>
        {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
          <Chip
            key={f}
            label={`${f.charAt(0).toUpperCase() + f.slice(1)} (${counts[f] ?? 0})`}
            onClick={() => setFilter(f)}
            color={filter === f ? (f === 'pending' ? 'warning' : f === 'approved' ? 'success' : f === 'rejected' ? 'error' : 'primary') : 'default'}
            variant={filter === f ? 'filled' : 'outlined'}
            sx={{ fontWeight: filter === f ? 700 : 500, cursor: 'pointer' }}
          />
        ))}
      </Stack>

      {/* Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : filtered.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <Typography color="text.secondary">
            {filter === 'pending' ? 'No submissions awaiting review.' : 'No partnership pages in this category.'}
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={1.5}>
          {filtered.map((college) => {
            const statusCfg = STATUS_CONFIG[college.partnership_page_status];
            const tierColor = TIER_COLORS[college.neram_tier] ?? '#94a3b8';
            return (
              <Paper key={college.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" gap={1.5}>
                  <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
                      <Typography variant="subtitle2" fontWeight={700}>{college.name}</Typography>
                      <Chip label={college.neram_tier} size="small" sx={{ bgcolor: tierColor, color: '#fff', fontWeight: 600, fontSize: 11 }} />
                      <Chip label={statusCfg.label} size="small" color={statusCfg.color} sx={{ fontWeight: 600, fontSize: 11 }} />
                    </Stack>

                    <Stack direction="row" alignItems="center" gap={0.5} sx={{ mt: 0.75 }}>
                      <Link
                        href={college.partnership_page_url}
                        target="_blank"
                        rel="noopener"
                        variant="body2"
                        sx={{ wordBreak: 'break-all', maxWidth: 480, display: 'block' }}
                      >
                        {college.partnership_page_url}
                      </Link>
                      <OpenInNewIcon sx={{ fontSize: 13, color: 'text.secondary', flexShrink: 0 }} />
                    </Stack>

                    {college.partnership_page_submitted_at && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                        Submitted: {new Date(college.partnership_page_submitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Typography>
                    )}

                    {college.partnership_page_notes && college.partnership_page_status === 'rejected' && (
                      <Typography variant="caption" color="error.main" sx={{ mt: 0.5, display: 'block' }}>
                        Note: {college.partnership_page_notes}
                      </Typography>
                    )}
                  </Box>

                  <Stack direction="row" gap={1} flexShrink={0}>
                    <Tooltip title="Approve — backlink verified, badge will appear on college profile">
                      <span>
                        <Button
                          size="small"
                          variant={college.partnership_page_status === 'approved' ? 'contained' : 'outlined'}
                          color="success"
                          startIcon={<CheckCircleIcon />}
                          onClick={() => openReview(college, 'approve')}
                          disabled={college.partnership_page_status === 'approved'}
                          sx={{ textTransform: 'none', fontWeight: 600 }}
                        >
                          Approve
                        </Button>
                      </span>
                    </Tooltip>
                    <Tooltip title="Reject — provide feedback so college can fix the page">
                      <span>
                        <Button
                          size="small"
                          variant={college.partnership_page_status === 'rejected' ? 'contained' : 'outlined'}
                          color="error"
                          startIcon={<CancelIcon />}
                          onClick={() => openReview(college, 'reject')}
                          disabled={college.partnership_page_status === 'rejected'}
                          sx={{ textTransform: 'none', fontWeight: 600 }}
                        >
                          Reject
                        </Button>
                      </span>
                    </Tooltip>
                  </Stack>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}

      {/* Review dialog */}
      <Dialog open={reviewDialog.open} onClose={() => setReviewDialog({ open: false, college: null, action: null })} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {reviewDialog.action === 'approve' ? 'Approve Partnership Page' : 'Reject Partnership Page'}
        </DialogTitle>
        <DialogContent>
          {reviewDialog.college && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              College: <strong>{reviewDialog.college.name}</strong>
            </Typography>
          )}
          {reviewDialog.action === 'approve' ? (
            <Alert severity="success" sx={{ borderRadius: 1.5 }}>
              Confirm that the page contains a visible link to neramclasses.com before approving.
              Approval will show a partner badge on the college profile.
            </Alert>
          ) : (
            <TextField
              fullWidth
              multiline
              rows={3}
              label="Feedback for college (required)"
              placeholder="The link to neramclasses.com was not found on the page. Please add a visible hyperlink in the coaching recommendations section."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              helperText="This message will be shown to the college in their dashboard."
            />
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setReviewDialog({ open: false, college: null, action: null })} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color={reviewDialog.action === 'approve' ? 'success' : 'error'}
            onClick={handleReview}
            disabled={saving || (reviewDialog.action === 'reject' && !notes.trim())}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : reviewDialog.action === 'approve' ? <CheckCircleIcon /> : <CancelIcon />}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {saving ? 'Saving...' : reviewDialog.action === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
