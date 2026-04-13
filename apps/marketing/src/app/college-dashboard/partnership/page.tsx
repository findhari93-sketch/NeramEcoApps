'use client';

import { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, TextField, Button, Chip, Alert,
  CircularProgress, Stack, Divider, Link,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import CancelIcon from '@mui/icons-material/Cancel';
import LinkIcon from '@mui/icons-material/Link';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useCollegeDashboard } from '../context';

type PartnershipStatus = 'none' | 'pending' | 'approved' | 'rejected';

interface PartnershipData {
  partnership_page_url: string | null;
  partnership_page_status: PartnershipStatus;
  partnership_page_notes: string | null;
  partnership_page_submitted_at: string | null;
}

const STATUS_CONFIG: Record<PartnershipStatus, { label: string; color: 'default' | 'warning' | 'success' | 'error'; icon: React.ReactNode }> = {
  none:     { label: 'Not submitted', color: 'default',  icon: <LinkIcon sx={{ fontSize: 14 }} /> },
  pending:  { label: 'Under review',  color: 'warning',  icon: <HourglassTopIcon sx={{ fontSize: 14 }} /> },
  approved: { label: 'Approved',      color: 'success',  icon: <CheckCircleIcon sx={{ fontSize: 14 }} /> },
  rejected: { label: 'Needs changes', color: 'error',    icon: <CancelIcon sx={{ fontSize: 14 }} /> },
};

const SAMPLE_CONTENT = `<h2>Recommended NATA Coaching</h2>
<p>
  For students aspiring to join our B.Arch program, we recommend
  <a href="https://neramclasses.com" target="_blank" rel="noopener">Neram Classes</a>
  as a trusted NATA coaching platform. Neram provides structured preparation for
  NATA, JEE B.Arch, and CEED with experienced faculty and a proven track record.
</p>`;

export default function PartnershipPage() {
  const { session } = useCollegeDashboard();
  const [data, setData] = useState<PartnershipData | null>(null);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!session?.access_token) return;
    fetch('/api/college-dashboard/partnership', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setUrl(d.partnership_page_url ?? '');
      })
      .finally(() => setLoading(false));
  }, [session]);

  const handleSubmit = async () => {
    setError('');
    setSuccess(false);
    if (!url.trim()) {
      setError('Please enter the URL of your partnership page.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/college-dashboard/partnership', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ url: url.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to submit. Please try again.');
      } else {
        setSuccess(true);
        setData((prev) => prev ? { ...prev, partnership_page_url: url.trim(), partnership_page_status: 'pending', partnership_page_notes: null } : prev);
      }
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

  const status = data?.partnership_page_status ?? 'none';
  const statusCfg = STATUS_CONFIG[status];

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>
          Partnership Page
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Add a page on your college website recommending Neram Classes as a NATA coaching platform.
          This helps students find quality coaching and strengthens our mutual SEO.
        </Typography>
      </Box>

      {/* Status card */}
      <Paper variant="outlined" sx={{ p: 2.5, mb: 3, borderRadius: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
          <Typography variant="subtitle2" fontWeight={600}>
            Submission Status
          </Typography>
          <Chip
            icon={statusCfg.icon as React.ReactElement}
            label={statusCfg.label}
            color={statusCfg.color}
            size="small"
            sx={{ fontWeight: 600 }}
          />
        </Stack>

        {data?.partnership_page_url && (
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="caption" color="text.secondary">
              Submitted URL
            </Typography>
            <Stack direction="row" alignItems="center" gap={0.5} sx={{ mt: 0.25 }}>
              <Typography variant="body2" sx={{ wordBreak: 'break-all', color: 'primary.main' }}>
                {data.partnership_page_url}
              </Typography>
              <Link href={data.partnership_page_url} target="_blank" rel="noopener" sx={{ display: 'flex', alignItems: 'center' }}>
                <OpenInNewIcon sx={{ fontSize: 14 }} />
              </Link>
            </Stack>
          </Box>
        )}

        {status === 'approved' && (
          <Alert severity="success" sx={{ mt: 2, borderRadius: 1.5 }}>
            Your partnership page is verified. A partner badge is now shown on your college profile.
          </Alert>
        )}

        {status === 'rejected' && data?.partnership_page_notes && (
          <Alert severity="error" sx={{ mt: 2, borderRadius: 1.5 }}>
            <Typography variant="body2" fontWeight={600} sx={{ mb: 0.25 }}>
              Feedback from Neram team:
            </Typography>
            <Typography variant="body2">{data.partnership_page_notes}</Typography>
          </Alert>
        )}

        {status === 'pending' && (
          <Alert severity="info" sx={{ mt: 2, borderRadius: 1.5 }}>
            Our team will review your page within 2-3 business days and verify the backlink.
          </Alert>
        )}
      </Paper>

      {/* Submit / Update URL form */}
      <Paper variant="outlined" sx={{ p: 2.5, mb: 3, borderRadius: 2 }}>
        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
          {status === 'none' ? 'Submit Your Partnership Page' : 'Update URL'}
        </Typography>
        <TextField
          fullWidth
          size="small"
          label="Partnership page URL"
          placeholder="https://www.yourcollege.edu/recommended-nata-coaching"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={saving}
          helperText="Must be a public page on your college's official website containing a link to neramclasses.com"
          InputProps={{
            startAdornment: <LinkIcon sx={{ mr: 1, color: 'text.secondary', fontSize: 18 }} />,
          }}
        />
        {error && (
          <Alert severity="error" sx={{ mt: 1.5, borderRadius: 1.5 }}>{error}</Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mt: 1.5, borderRadius: 1.5 }}>
            Submitted for review. You will be notified once approved.
          </Alert>
        )}
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={saving}
          sx={{ mt: 2, textTransform: 'none', fontWeight: 600 }}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {saving ? 'Submitting...' : status === 'none' ? 'Submit for Review' : 'Update and Resubmit'}
        </Button>
      </Paper>

      {/* Instructions */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
          How to create your partnership page
        </Typography>
        <Stack spacing={1.5}>
          {[
            'Create a dedicated page (or section) on your official college website about recommended NATA coaching.',
            'Include a visible link to neramclasses.com with anchor text like "Neram Classes" or "Recommended NATA Coaching".',
            'The link must be accessible publicly (not behind a login or paywall).',
            'Submit the exact URL of that page below.',
          ].map((step, i) => (
            <Stack key={i} direction="row" gap={1.5} alignItems="flex-start">
              <Box sx={{
                minWidth: 24, height: 24, borderRadius: '50%',
                bgcolor: 'primary.main', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, mt: 0.1,
              }}>
                {i + 1}
              </Box>
              <Typography variant="body2" color="text.secondary">{step}</Typography>
            </Stack>
          ))}
        </Stack>

        <Divider sx={{ my: 2 }} />

        <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 1 }}>
          Sample content you can use:
        </Typography>
        <Box
          component="pre"
          sx={{
            bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider',
            borderRadius: 1.5, p: 1.5, fontSize: 12, overflowX: 'auto',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace',
          }}
        >
          {SAMPLE_CONTENT}
        </Box>
      </Paper>
    </Box>
  );
}
