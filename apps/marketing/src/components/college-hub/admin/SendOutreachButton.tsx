'use client';

import { useEffect, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary,
  Alert, Box, Button, Checkbox, Chip,
  CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControlLabel, IconButton, MenuItem, Select, Snackbar,
  Stack, TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import EmailIcon from '@mui/icons-material/Email';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import LaunchIcon from '@mui/icons-material/Launch';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { CollegeDetail } from '@/lib/college-hub/types';

interface SendOutreachButtonProps {
  college: Pick<
    CollegeDetail,
    | 'id' | 'name' | 'slug' | 'state_slug' | 'email' | 'admissions_email'
    | 'contact_status' | 'outreach_count' | 'last_outreach_at'
  >;
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

const MAILTO_BODY_MAX = 1800;

function truncateForMailto(text: string, pageUrl: string): string {
  if (text.length <= MAILTO_BODY_MAX) return text;
  const trailer = `\n\n... full text at ${pageUrl}`;
  return text.slice(0, MAILTO_BODY_MAX - trailer.length) + trailer;
}

function formatStatusChip(status: string): { label: string; color: 'default' | 'info' | 'success' | 'warning' } {
  switch (status) {
    case 'never_contacted': return { label: 'Never contacted', color: 'default' };
    case 'emailed_v1': return { label: 'Emailed', color: 'info' };
    case 'replied': return { label: 'Replied', color: 'success' };
    case 'engaged': return { label: 'Engaged', color: 'success' };
    case 'claimed': return { label: 'Claimed', color: 'success' };
    case 'bounced': return { label: 'Bounced', color: 'warning' };
    case 'opted_out': return { label: 'Opted out', color: 'warning' };
    default: return { label: status, color: 'default' };
  }
}

export default function SendOutreachButton({ college }: SendOutreachButtonProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [isStaff, setIsStaff] = useState<boolean>(false);
  const [staffName, setStaffName] = useState<string>('');
  const [checking, setChecking] = useState(true);

  const [open, setOpen] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [recipient, setRecipient] = useState('');
  const [subjectVariant, setSubjectVariant] = useState<1 | 2 | 3>(1);
  const [subjectOverride, setSubjectOverride] = useState('');
  const [includeBcc, setIncludeBcc] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [duplicateHint, setDuplicateHint] = useState<string | null>(null);

  const [currentStatus, setCurrentStatus] = useState(college.contact_status ?? 'never_contacted');
  const [currentCount, setCurrentCount] = useState(college.outreach_count ?? 0);
  const [currentLastAt, setCurrentLastAt] = useState<string | null>(college.last_outreach_at ?? null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch('/api/admin/colleges/outreach/me', { cache: 'no-store' });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setIsStaff(true);
          setStaffName(data.name ?? '');
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    check();
    return () => { cancelled = true; };
  }, []);

  async function fetchPreview(variant: 1 | 2 | 3 = subjectVariant) {
    setLoadingPreview(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/colleges/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          college_id: college.id,
          subject_variant: variant,
          preview_only: true,
          override_to_email: recipient || undefined,
          include_bcc: includeBcc,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to render preview');
        return;
      }
      setPreview(data);
      if (!recipient) setRecipient(data.recipient);
      setSubjectOverride(data.subject);
      setCurrentStatus(data.contact_status);
      setCurrentCount(data.outreach_count);
      setCurrentLastAt(data.last_outreach_at);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setLoadingPreview(false);
    }
  }

  function handleOpen() {
    setOpen(true);
    setError(null);
    setDuplicateHint(null);
    fetchPreview(subjectVariant);
  }

  function handleClose() {
    if (sending) return;
    setOpen(false);
  }

  async function handleSend(force = false) {
    if (!recipient) {
      setError('Recipient email is required');
      return;
    }
    setSending(true);
    setError(null);
    setDuplicateHint(null);
    try {
      const res = await fetch('/api/admin/colleges/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          college_id: college.id,
          subject_variant: subjectVariant,
          override_to_email: recipient,
          override_subject: subjectOverride || undefined,
          include_bcc: includeBcc,
          force,
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setDuplicateHint(data.hint || 'Duplicate send detected. Click Send anyway to override.');
        return;
      }
      if (!res.ok) {
        setError(data.error || 'Send failed');
        return;
      }
      setToast(`Sent. Message id: ${data.message_id}`);
      setCurrentStatus(data.new_contact_status);
      setCurrentCount(data.new_outreach_count);
      setCurrentLastAt(new Date().toISOString());
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  function handleOutlookMailto() {
    if (!preview || !recipient) return;
    const pageUrl = `https://neramclasses.com/en/colleges/${college.state_slug ?? 'india'}/${college.slug}`;
    const body = truncateForMailto(preview.text, pageUrl);
    const params = new URLSearchParams({
      subject: subjectOverride || preview.subject,
      body,
    });
    if (includeBcc && preview.bcc) params.set('bcc', preview.bcc);
    const mailto = `mailto:${encodeURIComponent(recipient)}?${params.toString()}`;
    window.location.href = mailto;
  }

  // Staff check is done; if not staff, render nothing
  if (checking) return null;
  if (!isStaff) return null;

  const statusChip = formatStatusChip(currentStatus);

  return (
    <>
      <Button
        onClick={handleOpen}
        variant="contained"
        size="large"
        startIcon={<EmailIcon />}
        sx={{
          position: 'fixed',
          bottom: { xs: 16, sm: 24 },
          right: { xs: 16, sm: 24 },
          zIndex: 1200,
          boxShadow: '0 8px 24px rgba(15,23,42,0.25)',
          bgcolor: '#0f172a',
          '&:hover': { bgcolor: '#1e293b' },
          minHeight: 48,
          textTransform: 'none',
          fontWeight: 700,
          borderRadius: 999,
          px: 2.5,
        }}
        aria-label="Send outreach to this college"
      >
        Send outreach
      </Button>

      <Dialog
        open={open}
        onClose={handleClose}
        fullScreen={isMobile}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1.5 }}>
          <Box>
            <Typography variant="h6" fontWeight={700}>Outreach: {college.name}</Typography>
            <Typography variant="caption" color="text.secondary">Signed in as {staffName || 'Neram staff'}</Typography>
          </Box>
          <IconButton onClick={handleClose} aria-label="Close" size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          <Stack gap={2}>
            {/* Status */}
            <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
              <Chip size="small" color={statusChip.color} label={statusChip.label} />
              <Chip size="small" variant="outlined" label={`Sent ${currentCount} time${currentCount === 1 ? '' : 's'}`} />
              {currentLastAt && (
                <Chip size="small" variant="outlined" label={`Last: ${new Date(currentLastAt).toLocaleString()}`} />
              )}
            </Stack>

            <TextField
              label="Recipient email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              fullWidth
              required
              size="medium"
              helperText={
                !college.admissions_email && !college.email
                  ? 'No admissions or general email on record. Enter manually.'
                  : 'Defaults to admissions email, falling back to general email.'
              }
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} alignItems="stretch">
              <Box sx={{ minWidth: 220 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Subject variant
                </Typography>
                <Select
                  value={subjectVariant}
                  onChange={(e) => {
                    const v = Number(e.target.value) as 1 | 2 | 3;
                    setSubjectVariant(v);
                    setSubjectOverride('');
                    fetchPreview(v);
                  }}
                  fullWidth
                  size="small"
                  sx={{ mt: 0.5 }}
                >
                  <MenuItem value={1}>1. Quick review request</MenuItem>
                  <MenuItem value={2}>2. NATA 2026 aspirants</MenuItem>
                  <MenuItem value={3}>3. Help us keep it accurate</MenuItem>
                </Select>
              </Box>

              <TextField
                label="Subject"
                value={subjectOverride}
                onChange={(e) => setSubjectOverride(e.target.value)}
                fullWidth
                size="small"
                sx={{ flex: 1 }}
              />
            </Stack>

            <FormControlLabel
              control={
                <Checkbox
                  checked={includeBcc}
                  onChange={(e) => setIncludeBcc(e.target.checked)}
                />
              }
              label="BCC info@neramclasses.com (archive in our inbox)"
            />

            <Divider />

            {/* Preview */}
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 1 }}>
                HTML preview
              </Typography>
              {loadingPreview ? (
                <Stack alignItems="center" py={4}>
                  <CircularProgress size={22} />
                </Stack>
              ) : preview ? (
                <Box
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    overflow: 'hidden',
                    bgcolor: 'grey.50',
                  }}
                >
                  <Box
                    component="iframe"
                    title="Email HTML preview"
                    srcDoc={preview.html}
                    sx={{
                      width: '100%',
                      height: { xs: 320, sm: 440 },
                      border: 0,
                      display: 'block',
                      bgcolor: '#fff',
                    }}
                  />
                </Box>
              ) : null}
            </Box>

            {preview && (
              <Accordion variant="outlined" disableGutters>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="body2" fontWeight={600}>Plain text version</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Box
                    component="pre"
                    sx={{
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                      fontSize: '0.8rem',
                      m: 0,
                    }}
                  >
                    {preview.text}
                  </Box>
                </AccordionDetails>
              </Accordion>
            )}

            {error && <Alert severity="error">{error}</Alert>}
            {duplicateHint && (
              <Alert
                severity="warning"
                action={
                  <Button color="inherit" size="small" onClick={() => handleSend(true)} disabled={sending}>
                    Send anyway
                  </Button>
                }
              >
                {duplicateHint}
              </Alert>
            )}
          </Stack>
        </DialogContent>

        <DialogActions sx={{ p: 2, gap: 1, flexWrap: 'wrap' }}>
          <Button onClick={handleClose} disabled={sending}>Cancel</Button>
          <Button
            onClick={handleOutlookMailto}
            variant="outlined"
            startIcon={<LaunchIcon />}
            disabled={!preview || !recipient}
          >
            Open in Outlook
          </Button>
          <Button
            onClick={() => handleSend(false)}
            variant="contained"
            startIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
            disabled={!preview || !recipient || sending}
            sx={{ minWidth: 180 }}
          >
            {sending ? 'Sending...' : 'Send via Neram'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={4500}
        onClose={() => setToast(null)}
        message={toast ?? ''}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  );
}
